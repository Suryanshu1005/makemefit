import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../database';
import { aiAnalyses, AiAnalysisRow } from '../../database/schema/ai_analyses';
import { foodLogUploads } from '../../database/schema/food_log_uploads';
import { storageService } from '../../core/storage/local-storage.service';
import { getFoodVisionProvider } from './providers/provider.factory';
import { FoodAnalysisNormalizer } from './food-analysis.normalizer';
import { NotFoundError, AppError } from '../../core/errors/app-error';
import { logger } from '../../core/logger';
import {
  FoodAnalysisResponse,
  FoodAnalysisStatus,
  NormalizedFoodAnalysis,
} from '@makemefit/shared';

export interface AnalyzeUploadOptions {
  forceReanalyze?: boolean;
  userNotes?: string;
  timeoutMs?: number;
}

export class FoodAnalysisService {
  private static formatResponse(row: AiAnalysisRow): FoodAnalysisResponse {
    return {
      id: row.id,
      uploadId: row.uploadId!,
      userId: row.userId,
      status: row.status as FoodAnalysisStatus,
      dishName: row.dishNameRaw || null,
      analysis: (row.normalizedData as NormalizedFoodAnalysis) || null,
      errorMessage: row.errorMessage || null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /**
   * Primary entrypoint: Analyzes an uploaded food image through the configured AI vision provider.
   * Preserves raw AI output, validates normalized schema, and ensures tenant isolation.
   */
  public static async analyzeUpload(
    userId: string,
    uploadId: string,
    options: AnalyzeUploadOptions = {}
  ): Promise<FoodAnalysisResponse> {
    const { forceReanalyze = false, userNotes, timeoutMs } = options;

    // 1. Verify that upload exists and belongs to the authenticated user
    const [upload] = await db
      .select()
      .from(foodLogUploads)
      .where(and(eq(foodLogUploads.id, uploadId), eq(foodLogUploads.userId, userId)))
      .limit(1);

    if (!upload) {
      throw new NotFoundError('Food image upload not found or access denied.');
    }

    // 2. Duplicate analysis prevention: Check for existing analysis
    const [existingAnalysis] = await db
      .select()
      .from(aiAnalyses)
      .where(and(eq(aiAnalyses.uploadId, uploadId), eq(aiAnalyses.userId, userId)))
      .orderBy(desc(aiAnalyses.createdAt))
      .limit(1);

    if (existingAnalysis && !forceReanalyze) {
      // If already completed or needs_review, return existing cached result
      if (
        existingAnalysis.status === 'completed' ||
        existingAnalysis.status === 'needs_review'
      ) {
        logger.info(
          { uploadId, analysisId: existingAnalysis.id },
          'Returning existing validated food analysis (duplicate prevented)'
        );
        return this.formatResponse(existingAnalysis);
      }

      // If currently analyzing within last 45 seconds, prevent duplicate concurrent request
      const ageMs = Date.now() - existingAnalysis.updatedAt.getTime();
      if (existingAnalysis.status === 'analyzing' && ageMs < 45000) {
        return this.formatResponse(existingAnalysis);
      }
    }

    // 3. Retrieve stored image buffer from object/local storage
    const storedFile = await storageService.getFile(upload.storageKey);

    // 4. Record initiation: Create or update analysis row in state 'analyzing'
    let analysisRecord: AiAnalysisRow;

    if (existingAnalysis) {
      const [updated] = await db
        .update(aiAnalyses)
        .set({
          status: 'analyzing',
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(aiAnalyses.id, existingAnalysis.id))
        .returning();
      analysisRecord = updated;
    } else {
      const [created] = await db
        .insert(aiAnalyses)
        .values({
          userId,
          uploadId,
          status: 'analyzing',
          modelProvider: 'pending',
          dishNameRaw: 'Analyzing...',
          latencyMs: 0,
        })
        .returning();
      analysisRecord = created;
    }

    // Update upload processing status to 'analyzing'
    await db
      .update(foodLogUploads)
      .set({ processingStatus: 'analyzing', updatedAt: new Date() })
      .where(eq(foodLogUploads.id, upload.id));

    // 5. Invoke AI Vision Provider abstraction
    const provider = getFoodVisionProvider();
    let rawResult: any = null;

    try {
      rawResult = await provider.analyzeImage({
        imageBuffer: storedFile.buffer,
        mimeType: upload.mimeType,
        fileName: upload.originalFileName,
        userNotes,
        timeoutMs,
      });

      // 6. Validate and normalize raw response against strict application schema
      const normalized = FoodAnalysisNormalizer.normalize(
        rawResult.rawPayload,
        rawResult.modelProvider,
        rawResult.latencyMs
      );

      // Determine confidence state
      const targetStatus: FoodAnalysisStatus =
        normalized.uncertainty.overallConfidence === 'low' ||
        normalized.uncertainty.isAmbiguous ||
        !normalized.isIdentifiedAsFood
          ? 'needs_review'
          : 'completed';

      // 7. Persist raw payload and normalized structure separately in PostgreSQL
      const [saved] = await db
        .update(aiAnalyses)
        .set({
          status: targetStatus,
          dishNameRaw: normalized.dishName,
          modelProvider: rawResult.modelProvider,
          overallConfidence: normalized.uncertainty.overallConfidence,
          confidenceScore: normalized.uncertainty.confidenceScore.toFixed(2),
          rawResponsePayload: rawResult.rawPayload,
          normalizedData: normalized,
          errorMessage: null,
          latencyMs: rawResult.latencyMs,
          updatedAt: new Date(),
        })
        .where(eq(aiAnalyses.id, analysisRecord.id))
        .returning();

      // Update upload status
      await db
        .update(foodLogUploads)
        .set({ processingStatus: targetStatus, updatedAt: new Date() })
        .where(eq(foodLogUploads.id, upload.id));

      logger.info(
        { uploadId, analysisId: saved.id, status: targetStatus, dishName: normalized.dishName },
        'AI food analysis completed and validated successfully'
      );

      return this.formatResponse(saved);
    } catch (err: any) {
      const errorMsg = err.message || 'An unexpected error occurred during food image analysis';
      logger.error(
        { err, uploadId, analysisId: analysisRecord.id },
        'Food image analysis failed'
      );

      // Mark analysis as failed, preserving raw output (if any was received) for diagnostics
      const [failedRow] = await db
        .update(aiAnalyses)
        .set({
          status: 'failed',
          errorMessage: errorMsg,
          rawResponsePayload: rawResult ? rawResult.rawPayload : null,
          updatedAt: new Date(),
        })
        .where(eq(aiAnalyses.id, analysisRecord.id))
        .returning();

      // Mark upload as failed
      await db
        .update(foodLogUploads)
        .set({
          processingStatus: 'failed',
          errorMessage: errorMsg,
          updatedAt: new Date(),
        })
        .where(eq(foodLogUploads.id, upload.id));

      if (err instanceof AppError) {
        throw err;
      }
      throw new AppError(errorMsg, 500, 'FOOD_ANALYSIS_FAILED');
    }
  }

  /**
   * Retrieves the current analysis for an upload, strictly scoped to the owner user.
   */
  public static async getAnalysis(
    userId: string,
    uploadId: string
  ): Promise<FoodAnalysisResponse> {
    const [row] = await db
      .select()
      .from(aiAnalyses)
      .where(and(eq(aiAnalyses.uploadId, uploadId), eq(aiAnalyses.userId, userId)))
      .orderBy(desc(aiAnalyses.createdAt))
      .limit(1);

    if (!row) {
      throw new NotFoundError('No food analysis found for this image upload.');
    }

    return this.formatResponse(row);
  }

  /**
   * Retries analysis by forcing re-evaluation through the provider.
   */
  public static async retryAnalysis(
    userId: string,
    uploadId: string,
    userNotes?: string
  ): Promise<FoodAnalysisResponse> {
    return this.analyzeUpload(userId, uploadId, { forceReanalyze: true, userNotes });
  }
}
