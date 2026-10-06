import { pgTable, uuid, varchar, integer, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';

export const foodLogUploads = pgTable(
  'food_log_uploads',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    storageKey: varchar('storage_key', { length: 512 }).notNull(),
    originalFileName: varchar('original_file_name', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    fileSizeBytes: integer('file_size_bytes').notNull(),
    processingStatus: varchar('processing_status', { length: 30 }).notNull().default('uploaded'),
    errorMessage: text('error_message'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userCreatedIdx: index('idx_food_log_uploads_user_created').on(table.userId, table.createdAt),
    statusIdx: index('idx_food_log_uploads_status').on(table.processingStatus),
  })
);

export type FoodLogUploadRow = typeof foodLogUploads.$inferSelect;
export type NewFoodLogUploadRow = typeof foodLogUploads.$inferInsert;
