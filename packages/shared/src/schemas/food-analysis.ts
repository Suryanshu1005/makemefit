import { z } from 'zod';
import {
  ConfidenceTierEnum,
  ConfidenceTier,
  MealSlotEnum,
  MealSlot,
  OriginalAiSnapshotSchema,
  OriginalAiSnapshot,
  EditableFoodItemSchema,
  EditableFoodItem,
} from './nutrition';

export const FoodAnalysisStatusEnum = z.enum([
  'pending',
  'analyzing',
  'completed',
  'needs_review',
  'failed',
]);
export type FoodAnalysisStatus = z.infer<typeof FoodAnalysisStatusEnum>;

/**
 * Individual food ingredient/item identified in the image.
 */
export const FoodItemEstimateSchema = z.object({
  name: z.string().min(1, 'Item name is required'),
  quantity: z.number().positive('Quantity must be greater than 0').default(1),
  unit: z.string().min(1).default('serving'),
  estimatedWeightG: z.number().nonnegative('Estimated weight must be non-negative').default(100),
  calories: z.number().int().nonnegative('Calories must be non-negative'),
  proteinG: z.number().nonnegative('Protein grams must be non-negative'),
  carbsG: z.number().nonnegative('Carbs grams must be non-negative'),
  fatG: z.number().nonnegative('Fat grams must be non-negative'),
  confidence: ConfidenceTierEnum.default('medium'),
  notes: z.string().optional(),
});
export type FoodItemEstimate = z.infer<typeof FoodItemEstimateSchema>;

/**
 * Aggregated estimated nutrition totals.
 */
export const FoodNutritionTotalsSchema = z.object({
  totalCalories: z.number().int().nonnegative(),
  totalProteinG: z.number().nonnegative(),
  totalCarbsG: z.number().nonnegative(),
  totalFatG: z.number().nonnegative(),
});
export type FoodNutritionTotals = z.infer<typeof FoodNutritionTotalsSchema>;

/**
 * Explicit uncertainty and caveat analysis.
 */
export const FoodUncertaintyAnalysisSchema = z.object({
  overallConfidence: ConfidenceTierEnum,
  confidenceScore: z.number().min(0).max(1), // Normalized 0.0 to 1.0
  uncertainties: z.array(z.string()).default([]),
  hasHiddenIngredients: z.boolean().default(false),
  isAmbiguous: z.boolean().default(false),
  portionEstimationCertainty: ConfidenceTierEnum.default('medium'),
});
export type FoodUncertaintyAnalysis = z.infer<typeof FoodUncertaintyAnalysisSchema>;

/**
 * Strict canonical normalized analysis schema.
 * All AI provider outputs must be validated and normalized into this structure.
 */
export const NormalizedFoodAnalysisSchema = z.object({
  dishName: z.string().min(1, 'Dish name is required'),
  mealSlotSuggestion: MealSlotEnum.optional(),
  items: z.array(FoodItemEstimateSchema).min(1, 'At least one food item must be identified'),
  totals: FoodNutritionTotalsSchema,
  uncertainty: FoodUncertaintyAnalysisSchema,
  isIdentifiedAsFood: z.boolean().default(true),
  modelProvider: z.string().min(1),
  latencyMs: z.number().int().nonnegative().default(0),
});
export type NormalizedFoodAnalysis = z.infer<typeof NormalizedFoodAnalysisSchema>;

/**
 * API Response contract for food image analysis.
 */
export const FoodAnalysisResponseSchema = z.object({
  id: z.string().uuid(),
  uploadId: z.string().uuid(),
  userId: z.string().uuid(),
  status: FoodAnalysisStatusEnum,
  dishName: z.string().nullable().optional(),
  analysis: NormalizedFoodAnalysisSchema.nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FoodAnalysisResponse = z.infer<typeof FoodAnalysisResponseSchema>;

/**
 * Request payload to initiate or force re-analysis.
 */
export const AnalyzeFoodRequestSchema = z.object({
  forceReanalyze: z.boolean().optional().default(false),
  userNotes: z.string().max(500).optional(),
});
export type AnalyzeFoodRequest = z.infer<typeof AnalyzeFoodRequestSchema>;

/* -------------------------------------------------------------------------- */
/*             MANUAL CORRECTION & REVIEW CONTRACTS (AUDITABLE)              */
/* -------------------------------------------------------------------------- */

export {
  OriginalAiSnapshotSchema,
  type OriginalAiSnapshot,
  EditableFoodItemSchema,
  type EditableFoodItem,
} from './nutrition';

/**
 * Request payload when user saves corrected draft or submits for review.
 */
export const SaveFoodCorrectionsRequestSchema = z.object({
  dishName: z.string().trim().min(1, 'Dish name cannot be empty').max(255),
  mealSlot: MealSlotEnum,
  items: z.array(EditableFoodItemSchema).min(1, 'Meal must contain at least one food item'),
  userNotes: z.string().max(1000).optional(),
});
export type SaveFoodCorrectionsRequest = z.infer<typeof SaveFoodCorrectionsRequestSchema>;

/**
 * Authoritative response after user corrections are saved and validated server-side.
 */
export const FoodCorrectionsResponseSchema = z.object({
  analysisId: z.string().uuid(),
  uploadId: z.string().uuid(),
  dishName: z.string(),
  mealSlot: MealSlotEnum,
  items: z.array(EditableFoodItemSchema),
  serverTotals: FoodNutritionTotalsSchema,
  hasUserModifications: z.boolean(),
  isReadyForConfirmation: z.boolean(),
  originalAiTotals: FoodNutritionTotalsSchema,
  userNotes: z.string().nullable().optional(),
  updatedAt: z.string(),
});
export type FoodCorrectionsResponse = z.infer<typeof FoodCorrectionsResponseSchema>;

/**
 * Initial Review payload containing AI estimates alongside any saved user draft.
 */
export const NutritionReviewDataSchema = z.object({
  uploadId: z.string().uuid(),
  analysisId: z.string().uuid(),
  dishName: z.string(),
  mealSlot: MealSlotEnum,
  items: z.array(EditableFoodItemSchema),
  currentTotals: FoodNutritionTotalsSchema,
  originalAiTotals: FoodNutritionTotalsSchema,
  hasSavedDraft: z.boolean(),
  uncertaintyNotes: z.array(z.string()),
  imageUrl: z.string(),
});
export type NutritionReviewData = z.infer<typeof NutritionReviewDataSchema>;
