import { z } from 'zod';

export const UserGamificationSchema = z.object({
  userId: z.string().uuid(),
  currentStreak: z.number().int().min(0),
  longestStreak: z.number().int().min(0),
  lastLoggedDate: z.string().nullable().optional(),
  totalXp: z.number().int().min(0),
  currentLevel: z.number().int().min(1),
  xpForNextLevel: z.number().int(),
  xpCurrentLevelProgress: z.number().int(),
});

export type UserGamification = z.infer<typeof UserGamificationSchema>;

export const XpEventTypeEnum = z.enum([
  'first_meal_of_day',
  'subsequent_meal',
  'daily_adherence_bonus',
  'streak_milestone',
]);

export type XpEventType = z.infer<typeof XpEventTypeEnum>;
