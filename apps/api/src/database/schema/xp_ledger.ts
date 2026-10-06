import { pgTable, uuid, varchar, integer, date, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';
import { meals } from './meals';

export const xpLedger = pgTable(
  'xp_ledger',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mealId: uuid('meal_id').references(() => meals.id, { onDelete: 'set null' }),
    eventType: varchar('event_type', { length: 50 }).notNull(),
    xpAmount: integer('xp_amount').notNull(),
    awardedDate: date('awarded_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userHistoryIdx: index('idx_xp_ledger_user_history').on(table.userId, table.createdAt),
  })
);

export type XpLedgerRow = typeof xpLedger.$inferSelect;
export type NewXpLedgerRow = typeof xpLedger.$inferInsert;
