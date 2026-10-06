import { pgTable, uuid, date, integer, numeric, boolean, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';

export const dailySummaries = pgTable(
  'daily_summaries',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    summaryDate: date('summary_date').notNull(),
    targetCalories: integer('target_calories').notNull(),
    targetProteinG: numeric('target_protein_g', { precision: 5, scale: 1 }).notNull(),
    targetCarbsG: numeric('target_carbs_g', { precision: 5, scale: 1 }).notNull(),
    targetFatG: numeric('target_fat_g', { precision: 5, scale: 1 }).notNull(),
    consumedCalories: integer('consumed_calories').notNull().default(0),
    consumedProteinG: numeric('consumed_protein_g', { precision: 5, scale: 1 }).notNull().default('0'),
    consumedCarbsG: numeric('consumed_carbs_g', { precision: 5, scale: 1 }).notNull().default('0'),
    consumedFatG: numeric('consumed_fat_g', { precision: 5, scale: 1 }).notNull().default('0'),
    mealsLoggedCount: integer('meals_logged_count').notNull().default(0),
    isTargetMet: boolean('is_target_met').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userSummaryDateUq: uniqueIndex('uq_daily_summaries_user_date').on(table.userId, table.summaryDate),
    historyIdx: index('idx_daily_summaries_history').on(table.userId, table.summaryDate),
  })
);

export type DailySummaryRow = typeof dailySummaries.$inferSelect;
export type NewDailySummaryRow = typeof dailySummaries.$inferInsert;
