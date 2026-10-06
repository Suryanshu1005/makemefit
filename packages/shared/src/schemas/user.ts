import { z } from 'zod';

export const GenderEnum = z.enum(['male', 'female']);
export type Gender = z.infer<typeof GenderEnum>;

export const ActivityLevelEnum = z.enum([
  'sedentary',
  'light',
  'moderate',
  'very_active',
  'extra_active',
]);
export type ActivityLevel = z.infer<typeof ActivityLevelEnum>;

export const FitnessGoalEnum = z.enum([
  'weight_loss',
  'maintain',
  'weight_gain',
  'general_fitness',
]);
export type FitnessGoal = z.infer<typeof FitnessGoalEnum>;

export const UserProfileSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  gender: GenderEnum,
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be in YYYY-MM-DD format'),
  heightCm: z.number().min(50).max(280),
  weightKg: z.number().min(20).max(500),
  activityLevel: ActivityLevelEnum,
  goal: FitnessGoalEnum,
  recommendedCalories: z.number().int().min(800).nullable().optional(),
  customCalories: z.number().int().min(800).nullable().optional(),
  targetCalories: z.number().int().min(800),
  targetProteinG: z.number().min(0),
  targetCarbsG: z.number().min(0),
  targetFatG: z.number().min(0),
  isTargetOverridden: z.boolean().default(false),
  isOnboarded: z.boolean().default(false),
  updatedAt: z.string(),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;

export const OnboardingRequestSchema = z.object({
  gender: GenderEnum,
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Birth date must be in YYYY-MM-DD format'),
  heightCm: z.number().min(50, 'Height must be between 50 and 280 cm').max(280, 'Height must be between 50 and 280 cm'),
  weightKg: z.number().min(20, 'Weight must be between 20 and 500 kg').max(500, 'Weight must be between 20 and 500 kg'),
  activityLevel: ActivityLevelEnum,
  goal: FitnessGoalEnum,
  isTargetOverridden: z.boolean().default(false),
  customCalories: z.number().int().min(800, 'Minimum calories is 800 kcal').max(10000, 'Maximum calories is 10,000 kcal').optional().nullable(),
  customProteinG: z.number().min(0).max(1000).optional().nullable(),
  customCarbsG: z.number().min(0).max(1500).optional().nullable(),
  customFatG: z.number().min(0).max(500).optional().nullable(),
  timezone: z.string().optional(),
});

export type OnboardingRequest = z.infer<typeof OnboardingRequestSchema>;

export const UpdateProfileRequestSchema = z.object({
  displayName: z.string().min(1, 'Display name cannot be empty').max(100).optional(),
  timezone: z.string().min(1).max(50).optional(),
  gender: GenderEnum,
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Birth date must be in YYYY-MM-DD format'),
  heightCm: z.number().min(50, 'Height must be between 50 and 280 cm').max(280, 'Height must be between 50 and 280 cm'),
  weightKg: z.number().min(20, 'Weight must be between 20 and 500 kg').max(500, 'Weight must be between 20 and 500 kg'),
  activityLevel: ActivityLevelEnum,
  goal: FitnessGoalEnum,
  isTargetOverridden: z.boolean().default(false),
  customCalories: z.number().int().min(800, 'Minimum calories is 800 kcal').max(10000, 'Maximum calories is 10,000 kcal').optional().nullable(),
  customProteinG: z.number().min(0).max(1000).optional().nullable(),
  customCarbsG: z.number().min(0).max(1500).optional().nullable(),
  customFatG: z.number().min(0).max(500).optional().nullable(),
});

export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;

export const CalculateTargetsRequestSchema = z.object({
  gender: GenderEnum,
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be in YYYY-MM-DD format'),
  heightCm: z.number().min(50).max(280),
  weightKg: z.number().min(20).max(500),
  activityLevel: ActivityLevelEnum,
  goal: FitnessGoalEnum,
});

export type CalculateTargetsRequest = z.infer<typeof CalculateTargetsRequestSchema>;
