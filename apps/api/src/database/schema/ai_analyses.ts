import { pgTable, uuid, varchar, numeric, integer, jsonb, timestamp, text, boolean, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';
import { foodLogUploads } from './food_log_uploads';

export const aiAnalyses = pgTable(
  'ai_analyses',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    uploadId: uuid('upload_id')
      .references(() => foodLogUploads.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 30 }).notNull().default('completed'), // 'pending' | 'analyzing' | 'completed' | 'needs_review' | 'failed'
    dishNameRaw: varchar('dish_name_raw', { length: 255 }),
    modelProvider: varchar('model_provider', { length: 50 }).notNull(),
    overallConfidence: varchar('overall_confidence', { length: 20 }), // 'high' | 'medium' | 'low'
    confidenceScore: numeric('confidence_score', { precision: 3, scale: 2 }),
    rawResponsePayload: jsonb('raw_response_payload'),
    normalizedData: jsonb('normalized_data'),
    userCorrectedPayload: jsonb('user_corrected_payload'),
    hasUserCorrections: boolean('has_user_corrections').notNull().default(false),
    userCorrectedAt: timestamp('user_corrected_at', { withTimezone: true }),
    errorMessage: text('error_message'),
    latencyMs: integer('latency_ms').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userCreatedIdx: index('idx_ai_analyses_user_created').on(table.userId, table.createdAt),
    uploadIdx: index('idx_ai_analyses_upload').on(table.uploadId),
    statusIdx: index('idx_ai_analyses_status').on(table.status),
  })
);

export type AiAnalysisRow = typeof aiAnalyses.$inferSelect;
export type NewAiAnalysisRow = typeof aiAnalyses.$inferInsert;
