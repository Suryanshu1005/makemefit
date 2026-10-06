import { eq, and, desc } from 'drizzle-orm';
import crypto from 'crypto';
import { db } from '../../database';
import { aiAnalyses } from '../../database/schema/ai_analyses';
import { NotFoundError, ValidationError, ForbiddenError } from '../../core/errors/app-error';
import {
  EditableFoodItem,
  SaveFoodCorrectionsRequest,
  FoodCorrectionsResponse,
  NutritionReviewData,
  NormalizedFoodAnalysis,
  FoodNutritionTotals,
} from '@makemefit/shared';

export class FoodCorrectionService {
  /**
   * Recalculates authoritative macronutrient and calorie totals server-side.
   * Browsers must never be trusted for authoritative totals.
   */
  public static calculateAuthoritativeTotals(items: EditableFoodItem[]): FoodNutritionTotals {
    let totalCalories = 0;
    let totalProteinG = 0;
    let totalCarbsG = 0;
    let totalFatG = 0;

    for (const item of items) {
      totalCalories += Math.round(item.calories);
      totalProteinG += item.proteinG;
      totalCarbsG += item.carbsG;
      totalFatG += item.fatG;
    }

    return {
      totalCalories: Math.max(0, totalCalories),
      totalProteinG: Math.max(0, Math.round(totalProteinG * 10) / 10),
      totalCarbsG: Math.max(0, Math.round(totalCarbsG * 10) / 10),
      totalFatG: Math.max(0, Math.round(totalFatG * 10) / 10),
    };
  }

  /**
   * Compares an item against its original AI baseline to detect modifications.
   */
  public static checkIfModified(item: EditableFoodItem): boolean {
    if (item.isUserAdded || !item.originalAiItemData) {
      return true;
    }

    const ai = item.originalAiItemData;
    const isDiff =
      item.name.trim().toLowerCase() !== ai.name.trim().toLowerCase() ||
      item.quantity !== ai.quantity ||
      item.unit.trim().toLowerCase() !== ai.unit.trim().toLowerCase() ||
      item.estimatedWeightG !== ai.estimatedWeightG ||
      item.calories !== ai.calories ||
      item.proteinG !== ai.proteinG ||
      item.carbsG !== ai.carbsG ||
      item.fatG !== ai.fatG;

    return isDiff;
  }

  /**
   * Retrieves review data: returns existing saved draft if present,
   * or builds the initial review baseline directly from normalized AI estimates.
   */
  public static async getReviewData(
    userId: string,
    uploadId: string
  ): Promise<NutritionReviewData> {
    const [row] = await db
      .select()
      .from(aiAnalyses)
      .where(and(eq(aiAnalyses.uploadId, uploadId), eq(aiAnalyses.userId, userId)))
      .orderBy(desc(aiAnalyses.createdAt))
      .limit(1);

    if (!row) {
      throw new NotFoundError('Food analysis record not found or access denied.');
    }

    if (row.status !== 'completed' && row.status !== 'needs_review') {
      throw new ValidationError(
        `Analysis is in status "${row.status}" and cannot be reviewed until completed.`
      );
    }

    const normalized = row.normalizedData as NormalizedFoodAnalysis;
    const draft = row.userCorrectedPayload as any;

    const originalAiTotals: FoodNutritionTotals = normalized.totals;

    if (draft && draft.items && Array.isArray(draft.items)) {
      const currentTotals = this.calculateAuthoritativeTotals(draft.items);
      return {
        uploadId: row.uploadId!,
        analysisId: row.id,
        dishName: draft.dishName || normalized.dishName,
        mealSlot: draft.mealSlot || normalized.mealSlotSuggestion || 'lunch',
        items: draft.items,
        currentTotals,
        originalAiTotals,
        hasSavedDraft: true,
        uncertaintyNotes: normalized.uncertainty?.uncertainties || [],
        imageUrl: `/api/v1/food-logs/uploads/${row.uploadId}/image`,
      };
    }

    // Build initial review state from normalized AI output
    const items: EditableFoodItem[] = normalized.items.map((item) => ({
      id: crypto.randomUUID(),
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      estimatedWeightG: item.estimatedWeightG,
      calories: item.calories,
      proteinG: item.proteinG,
      carbsG: item.carbsG,
      fatG: item.fatG,
      confidence: item.confidence,
      isUserModified: false,
      isUserAdded: false,
      originalAiItemData: {
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        estimatedWeightG: item.estimatedWeightG,
        calories: item.calories,
        proteinG: item.proteinG,
        carbsG: item.carbsG,
        fatG: item.fatG,
      },
      notes: item.notes,
    }));

    const currentTotals = this.calculateAuthoritativeTotals(items);

    return {
      uploadId: row.uploadId!,
      analysisId: row.id,
      dishName: normalized.dishName,
      mealSlot: normalized.mealSlotSuggestion || 'lunch',
      items,
      currentTotals,
      originalAiTotals,
      hasSavedDraft: false,
      uncertaintyNotes: normalized.uncertainty?.uncertainties || [],
      imageUrl: `/api/v1/food-logs/uploads/${row.uploadId}/image`,
    };
  }

  /**
   * Validates and saves manual corrections from user, recalculates authoritative totals,
   * and preserves original AI values untouched.
   */
  public static async saveCorrections(
    userId: string,
    uploadId: string,
    payload: SaveFoodCorrectionsRequest
  ): Promise<FoodCorrectionsResponse> {
    const [row] = await db
      .select()
      .from(aiAnalyses)
      .where(and(eq(aiAnalyses.uploadId, uploadId), eq(aiAnalyses.userId, userId)))
      .orderBy(desc(aiAnalyses.createdAt))
      .limit(1);

    if (!row) {
      throw new NotFoundError('Food analysis record not found or access denied.');
    }

    const normalized = row.normalizedData as NormalizedFoodAnalysis;

    // Validate items and verify modification flags
    const processedItems: EditableFoodItem[] = [];
    let hasAnyModification = false;

    for (const item of payload.items) {
      const isModified = this.checkIfModified(item);
      if (isModified) {
        hasAnyModification = true;
      }

      processedItems.push({
        ...item,
        name: item.name.trim(),
        unit: item.unit.trim(),
        calories: Math.round(item.calories),
        proteinG: Math.round(item.proteinG * 10) / 10,
        carbsG: Math.round(item.carbsG * 10) / 10,
        fatG: Math.round(item.fatG * 10) / 10,
        isUserModified: isModified,
        isUserAdded: Boolean(item.isUserAdded),
      });
    }

    if (payload.dishName.trim() !== normalized.dishName.trim()) {
      hasAnyModification = true;
    }

    // Authoritative server-side recalculation of totals
    const serverTotals = this.calculateAuthoritativeTotals(processedItems);

    const userCorrectedPayload = {
      dishName: payload.dishName.trim(),
      mealSlot: payload.mealSlot,
      items: processedItems,
      serverTotals,
      hasUserModifications: hasAnyModification,
      userNotes: payload.userNotes || null,
      savedAt: new Date().toISOString(),
    };

    // Update row in ai_analyses (Original rawResponsePayload & normalizedData remain intact)
    const [updated] = await db
      .update(aiAnalyses)
      .set({
        userCorrectedPayload,
        hasUserCorrections: hasAnyModification,
        userCorrectedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(aiAnalyses.id, row.id))
      .returning();

    return {
      analysisId: updated.id,
      uploadId: updated.uploadId!,
      dishName: userCorrectedPayload.dishName,
      mealSlot: userCorrectedPayload.mealSlot,
      items: processedItems,
      serverTotals,
      hasUserModifications: hasAnyModification,
      isReadyForConfirmation: true,
      originalAiTotals: normalized.totals,
      userNotes: userCorrectedPayload.userNotes,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }
}
