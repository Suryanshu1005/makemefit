import { pgTable, uuid, integer, date, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';

export const userGamification = pgTable('user_gamification', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  currentStreak: integer('current_streak').notNull().default(0),
  longestStreak: integer('longest_streak').notNull().default(0),
  lastLoggedDate: date('last_logged_date'),
  totalXp: integer('total_xp').notNull().default(0),
  currentLevel: integer('current_level').notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type UserGamificationRow = typeof userGamification.$inferSelect;
export type NewUserGamificationRow = typeof userGamification.$inferInsert;
