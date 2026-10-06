import { pgTable, uuid, varchar, date, integer, numeric, boolean, text, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';
import { aiAnalyses } from './ai_analyses';

export const meals = pgTable(
  'meals',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    aiAnalysisId: uuid('ai_analysis_id').references(() => aiAnalyses.id, { onDelete: 'set null' }),
    logDate: date('log_date').notNull(),
    mealSlot: varchar('meal_slot', { length: 20 }).notNull(), // 'breakfast' | 'lunch' | 'dinner' | 'snack'
    dishName: varchar('dish_name', { length: 255 }).notNull(),
    totalCalories: integer('total_calories').notNull(),
    totalProteinG: numeric('total_protein_g', { precision: 5, scale: 1 }).notNull(),
    totalCarbsG: numeric('total_carbs_g', { precision: 5, scale: 1 }).notNull(),
    totalFatG: numeric('total_fat_g', { precision: 5, scale: 1 }).notNull(),
    isAiGenerated: boolean('is_ai_generated').notNull().default(true),
    hasUserEdits: boolean('has_user_edits').notNull().default(false),
    notes: text('notes'),
    loggedAt: timestamp('logged_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    userLogDateIdx: index('idx_meals_user_logdate').on(table.userId, table.logDate, table.mealSlot),
    aiAnalysisIdx: index('idx_meals_ai_analysis').on(table.aiAnalysisId),
  })
);

export type MealRow = typeof meals.$inferSelect;
export type NewMealRow = typeof meals.$inferInsert;
