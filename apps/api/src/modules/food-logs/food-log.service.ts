import { eq, and } from 'drizzle-orm';
import { db } from '../../database';
import { foodLogUploads, FoodLogUploadRow } from '../../database/schema/food_log_uploads';
import { storageService } from '../../core/storage/local-storage.service';
import { validateImageFile } from '../../core/storage/file-validator';
import { NotFoundError } from '../../core/errors/app-error';
import { FoodLogUploadResponse } from '@makemefit/shared';

export class FoodLogService {
  private static formatUploadResponse(row: FoodLogUploadRow): FoodLogUploadResponse {
    return {
      id: row.id,
      userId: row.userId,
      originalFileName: row.originalFileName,
      mimeType: row.mimeType,
      fileSizeBytes: row.fileSizeBytes,
      processingStatus: row.processingStatus as any,
      imageUrl: `/api/v1/food-logs/uploads/${row.id}/image`,
      createdAt: row.createdAt.toISOString(),
      errorMessage: row.errorMessage || null,
    };
  }

  /**
   * Validates image bytes, persists to secure storage, and creates database upload record.
   */
  public static async processUpload(params: {
    userId: string;
    buffer: Buffer;
    fileName: string;
    mimeType: string;
  }): Promise<FoodLogUploadResponse> {
    const { userId, buffer, fileName, mimeType } = params;

    // 1. Strict server-side validation (file size, MIME whitelist, magic bytes signature)
    validateImageFile(buffer, mimeType, fileName);

    // 2. Persist in object/local storage under isolated user path
    const uploadResult = await storageService.uploadFile({
      userId,
      buffer,
      fileName,
      mimeType,
    });

    // 3. Insert record into database with initial 'uploaded' status
    const [inserted] = await db
      .insert(foodLogUploads)
      .values({
        userId,
        storageKey: uploadResult.storageKey,
        originalFileName: fileName,
        mimeType,
        fileSizeBytes: uploadResult.sizeBytes,
        processingStatus: 'uploaded',
      })
      .returning();

    return this.formatUploadResponse(inserted);
  }

  /**
   * Retrieves an upload record, verifying user ownership (tenant isolation).
   */
  public static async getUpload(userId: string, uploadId: string): Promise<FoodLogUploadResponse> {
    const [row] = await db
      .select()
      .from(foodLogUploads)
      .where(and(eq(foodLogUploads.id, uploadId), eq(foodLogUploads.userId, userId)))
      .limit(1);

    if (!row) {
      throw new NotFoundError('Food log upload record not found or access denied.');
    }

    return this.formatUploadResponse(row);
  }

  /**
   * Retrieves the raw image buffer from storage, strictly enforcing ownership.
   */
  public static async getImageBuffer(
    userId: string,
    uploadId: string
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    const [row] = await db
      .select()
      .from(foodLogUploads)
      .where(and(eq(foodLogUploads.id, uploadId), eq(foodLogUploads.userId, userId)))
      .limit(1);

    if (!row) {
      throw new NotFoundError('Food log image not found or access denied.');
    }

    const file = await storageService.getFile(row.storageKey);
    return {
      buffer: file.buffer,
      mimeType: row.mimeType,
    };
  }

  /**
   * Initiates the food logging analysis pipeline by transitioning status to 'analyzing'.
   */
  public static async initiateAnalysis(
    userId: string,
    uploadId: string
  ): Promise<FoodLogUploadResponse> {
    const [row] = await db
      .select()
      .from(foodLogUploads)
      .where(and(eq(foodLogUploads.id, uploadId), eq(foodLogUploads.userId, userId)))
      .limit(1);

    if (!row) {
      throw new NotFoundError('Food log upload record not found or access denied.');
    }

    const [updated] = await db
      .update(foodLogUploads)
      .set({
        processingStatus: 'analyzing',
        updatedAt: new Date(),
      })
      .where(eq(foodLogUploads.id, row.id))
      .returning();

    return this.formatUploadResponse(updated);
  }
}
