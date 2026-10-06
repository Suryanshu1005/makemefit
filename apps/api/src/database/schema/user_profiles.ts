import { pgTable, uuid, varchar, date, numeric, integer, boolean, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';

export const userProfiles = pgTable('user_profiles', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })
    .unique(),
  gender: varchar('gender', { length: 10 }).notNull(), // 'male' | 'female'
  birthDate: date('birth_date').notNull(),
  heightCm: numeric('height_cm', { precision: 5, scale: 2 }).notNull(),
  weightKg: numeric('weight_kg', { precision: 5, scale: 2 }).notNull(),
  activityLevel: varchar('activity_level', { length: 20 }).notNull(),
  goal: varchar('goal', { length: 20 }).notNull(),
  recommendedCalories: integer('recommended_calories'),
  customCalories: integer('custom_calories'),
  targetCalories: integer('target_calories').notNull(),
  targetProteinG: numeric('target_protein_g', { precision: 5, scale: 1 }).notNull(),
  targetCarbsG: numeric('target_carbs_g', { precision: 5, scale: 1 }).notNull(),
  targetFatG: numeric('target_fat_g', { precision: 5, scale: 1 }).notNull(),
  isTargetOverridden: boolean('is_target_overridden').notNull().default(false),
  isOnboarded: boolean('is_onboarded').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type UserProfileRow = typeof userProfiles.$inferSelect;
export type NewUserProfileRow = typeof userProfiles.$inferInsert;
