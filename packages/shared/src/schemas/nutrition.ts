import { z } from 'zod';
import { FitnessGoalEnum } from './user';

export const MealSlotEnum = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
export type MealSlot = z.infer<typeof MealSlotEnum>;

export const ConfidenceTierEnum = z.enum(['high', 'medium', 'low']);
export type ConfidenceTier = z.infer<typeof ConfidenceTierEnum>;

export const OriginalAiSnapshotSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  unit: z.string(),
  estimatedWeightG: z.number(),
  calories: z.number().int(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
});
export type OriginalAiSnapshot = z.infer<typeof OriginalAiSnapshotSchema>;

export const EditableFoodItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, 'Food item name is required').max(255),
  quantity: z.number().positive('Quantity must be greater than 0'),
  unit: z.string().trim().min(1, 'Portion unit is required').max(50),
  estimatedWeightG: z.number().positive('Estimated weight must be greater than 0'),
  calories: z.number().int().min(0, 'Calories cannot be negative'),
  proteinG: z.number().min(0, 'Protein cannot be negative'),
  carbsG: z.number().min(0, 'Carbohydrates cannot be negative'),
  fatG: z.number().min(0, 'Fat cannot be negative'),
  confidence: ConfidenceTierEnum.optional(),
  isUserModified: z.boolean().default(false),
  isUserAdded: z.boolean().default(false),
  originalAiItemData: OriginalAiSnapshotSchema.nullable().optional(),
  notes: z.string().max(255).optional(),
});
export type EditableFoodItem = z.infer<typeof EditableFoodItemSchema>;

export const FoodItemInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Name is required').max(255),
  estimatedWeightG: z.number().min(1, 'Weight must be at least 1g'),
  portionDescription: z.string().max(100).optional(),
  calories: z.number().int().min(0),
  proteinG: z.number().min(0),
  carbsG: z.number().min(0),
  fatG: z.number().min(0),
  confidence: ConfidenceTierEnum.optional(),
  isUserModified: z.boolean().default(false),
  originalAiItemData: z.record(z.unknown()).optional(),
  sortOrder: z.number().int().default(0),
});
export type FoodItemInput = z.infer<typeof FoodItemInputSchema>;

export const MealConfirmRequestSchema = z.object({
  uploadId: z.string().uuid().optional(),
  aiAnalysisId: z.string().uuid().optional(),
  dishName: z.string().trim().min(1, 'Dish name is required').max(255),
  mealSlot: MealSlotEnum,
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be in YYYY-MM-DD format').optional(),
  items: z.array(EditableFoodItemSchema).min(1, 'Must include at least 1 food item'),
  notes: z.string().max(1000).optional(),
  idempotencyKey: z.string().max(128).optional(),
});
export type MealConfirmRequest = z.infer<typeof MealConfirmRequestSchema>;

export const MealResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  aiAnalysisId: z.string().uuid().nullable(),
  dishName: z.string(),
  mealSlot: MealSlotEnum,
  logDate: z.string(),
  totalCalories: z.number().int(),
  totalProteinG: z.number(),
  totalCarbsG: z.number(),
  totalFatG: z.number(),
  isAiGenerated: z.boolean(),
  hasUserEdits: z.boolean(),
  notes: z.string().nullable().optional(),
  loggedAt: z.string(),
  items: z.array(FoodItemInputSchema),
});

export type MealResponse = z.infer<typeof MealResponseSchema>;

export const DailySummarySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  summaryDate: z.string(),
  targetCalories: z.number().int(),
  targetProteinG: z.number(),
  targetCarbsG: z.number(),
  targetFatG: z.number(),
  consumedCalories: z.number().int(),
  consumedProteinG: z.number(),
  consumedCarbsG: z.number(),
  consumedFatG: z.number(),
  mealsLoggedCount: z.number().int(),
  isTargetMet: z.boolean(),
  remainingCalories: z.number().int(),
});
export type DailySummary = z.infer<typeof DailySummarySchema>;

export const MealConfirmResponseSchema = z.object({
  success: z.boolean(),
  meal: MealResponseSchema,
  todaySummary: DailySummarySchema,
  message: z.string(),
});
export type MealConfirmResponse = z.infer<typeof MealConfirmResponseSchema>;

export const DaySummaryQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be in YYYY-MM-DD format').optional(),
});
export type DaySummaryQuery = z.infer<typeof DaySummaryQuerySchema>;

export const MealHistoryQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(30).default(7),
});
export type MealHistoryQuery = z.infer<typeof MealHistoryQuerySchema>;

export const CalorieCalculationBreakdownSchema = z.object({
  bmr: z.number().int(),
  activityMultiplier: z.number(),
  activityAdjustmentCalories: z.number().int(),
  tdee: z.number().int(),
  goal: FitnessGoalEnum,
  goalAdjustmentCalories: z.number().int(),
  recommendedCalories: z.number().int(),
  recommendedMacros: z.object({
    proteinG: z.number(),
    carbsG: z.number(),
    fatG: z.number(),
    proteinCalories: z.number().int(),
    carbsCalories: z.number().int(),
    fatCalories: z.number().int(),
    proteinPct: z.number(),
    carbsPct: z.number(),
    fatPct: z.number(),
  }),
  formula: z.object({
    name: z.string(),
    description: z.string(),
    bmrFormula: z.string(),
    activityExplanation: z.string(),
    goalRationale: z.string(),
  }),
  disclaimer: z.string(),
});

export type CalorieCalculationBreakdown = z.infer<typeof CalorieCalculationBreakdownSchema>;

export const TargetResolutionSchema = z.object({
  calculation: CalorieCalculationBreakdownSchema,
  systemRecommended: z.object({
    calories: z.number().int(),
    proteinG: z.number(),
    carbsG: z.number(),
    fatG: z.number(),
  }),
  userSelected: z.object({
    calories: z.number().int().nullable(),
    proteinG: z.number().nullable(),
    carbsG: z.number().nullable(),
    fatG: z.number().nullable(),
  }).nullable(),
  activeTarget: z.object({
    calories: z.number().int(),
    proteinG: z.number(),
    carbsG: z.number(),
    fatG: z.number(),
    isOverridden: z.boolean(),
  }),
});

export type TargetResolution = z.infer<typeof TargetResolutionSchema>;

export const DashboardDataSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    displayName: z.string(),
    email: z.string(),
    timezone: z.string(),
  }),
  todaySummary: z.object({
    date: z.string(),
    targetCalories: z.number().int(),
    targetProteinG: z.number(),
    targetCarbsG: z.number(),
    targetFatG: z.number(),
    consumedCalories: z.number().int(),
    consumedProteinG: z.number(),
    consumedCarbsG: z.number(),
    consumedFatG: z.number(),
    remainingCalories: z.number().int(),
    mealsLoggedCount: z.number().int(),
    isTargetMet: z.boolean(),
  }),
  targetContext: z.object({
    recommendedCalories: z.number().int(),
    customCalories: z.number().int().nullable(),
    activeTargetCalories: z.number().int(),
    isTargetOverridden: z.boolean(),
    goal: FitnessGoalEnum,
  }),
  gamification: z.object({
    currentStreak: z.number().int(),
    currentLevel: z.number().int(),
    totalXp: z.number().int(),
    xpInCurrentLevel: z.number().int().optional(),
    xpSpanForLevel: z.number().int().optional(),
    progressPercent: z.number().int().optional(),
    nextLevelCeiling: z.number().int().optional(),
  }),
  meals: z.array(MealResponseSchema),
});

export type DashboardData = z.infer<typeof DashboardDataSchema>;
