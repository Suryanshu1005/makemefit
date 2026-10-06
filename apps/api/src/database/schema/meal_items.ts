import { pgTable, uuid, varchar, numeric, integer, boolean, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { meals } from './meals';

export const mealItems = pgTable(
  'meal_items',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    mealId: uuid('meal_id')
      .notNull()
      .references(() => meals.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    estimatedWeightG: numeric('estimated_weight_g', { precision: 6, scale: 1 }).notNull(),
    portionDescription: varchar('portion_description', { length: 100 }),
    calories: integer('calories').notNull(),
    proteinG: numeric('protein_g', { precision: 5, scale: 1 }).notNull(),
    carbsG: numeric('carbs_g', { precision: 5, scale: 1 }).notNull(),
    fatG: numeric('fat_g', { precision: 5, scale: 1 }).notNull(),
    confidence: varchar('confidence', { length: 10 }), // 'high' | 'medium' | 'low'
    isUserModified: boolean('is_user_modified').notNull().default(false),
    originalAiItemData: jsonb('original_ai_item_data'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    mealSortIdx: index('idx_meal_items_meal_sort').on(table.mealId, table.sortOrder),
  })
);

export type MealItemRow = typeof mealItems.$inferSelect;
export type NewMealItemRow = typeof mealItems.$inferInsert;
