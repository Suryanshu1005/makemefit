import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config/env';
import { logger } from '../core/logger';
import * as schema from './schema';

const client = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  onnotice: () => {}, // suppress notice messages
});

export const db = drizzle(client, { schema });

let schemaInitialized = false;

export async function ensureDatabaseSchema(): Promise<void> {
  if (schemaInitialized) return;
  await client.unsafe(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      display_name VARCHAR(100) NOT NULL,
      timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_profiles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      gender VARCHAR(10) NOT NULL,
      birth_date DATE NOT NULL,
      height_cm NUMERIC(5,2) NOT NULL,
      weight_kg NUMERIC(5,2) NOT NULL,
      activity_level VARCHAR(20) NOT NULL,
      goal VARCHAR(20) NOT NULL,
      recommended_calories INTEGER,
      custom_calories INTEGER,
      target_calories INTEGER NOT NULL,
      target_protein_g NUMERIC(5,1) NOT NULL,
      target_carbs_g NUMERIC(5,1) NOT NULL,
      target_fat_g NUMERIC(5,1) NOT NULL,
      is_target_overridden BOOLEAN NOT NULL DEFAULT FALSE,
      is_onboarded BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS food_log_uploads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      storage_key VARCHAR(512) NOT NULL,
      original_file_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      file_size_bytes INTEGER NOT NULL,
      processing_status VARCHAR(30) NOT NULL DEFAULT 'uploaded',
      error_message TEXT,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_food_log_uploads_user_created ON food_log_uploads(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_food_log_uploads_status ON food_log_uploads(processing_status);

    CREATE TABLE IF NOT EXISTS ai_analyses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      upload_id UUID REFERENCES food_log_uploads(id) ON DELETE CASCADE,
      status VARCHAR(30) NOT NULL DEFAULT 'completed',
      dish_name_raw VARCHAR(255),
      model_provider VARCHAR(50) NOT NULL,
      overall_confidence VARCHAR(20),
      confidence_score NUMERIC(3,2),
      raw_response_payload JSONB,
      normalized_data JSONB,
      user_corrected_payload JSONB,
      has_user_corrections BOOLEAN NOT NULL DEFAULT FALSE,
      user_corrected_at TIMESTAMPTZ,
      error_message TEXT,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ai_analyses_user_created ON ai_analyses(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_ai_analyses_upload ON ai_analyses(upload_id);
    CREATE INDEX IF NOT EXISTS idx_ai_analyses_status ON ai_analyses(status);

    CREATE TABLE IF NOT EXISTS meals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ai_analysis_id UUID REFERENCES ai_analyses(id) ON DELETE SET NULL,
      log_date DATE NOT NULL,
      meal_slot VARCHAR(20) NOT NULL,
      dish_name VARCHAR(255) NOT NULL,
      total_calories INTEGER NOT NULL,
      total_protein_g NUMERIC(5,1) NOT NULL,
      total_carbs_g NUMERIC(5,1) NOT NULL,
      total_fat_g NUMERIC(5,1) NOT NULL,
      is_ai_generated BOOLEAN NOT NULL DEFAULT TRUE,
      has_user_edits BOOLEAN NOT NULL DEFAULT FALSE,
      notes TEXT,
      logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_meals_user_logdate ON meals(user_id, log_date, meal_slot);
    CREATE INDEX IF NOT EXISTS idx_meals_ai_analysis ON meals(ai_analysis_id);

    CREATE TABLE IF NOT EXISTS meal_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      meal_id UUID NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      estimated_weight_g NUMERIC(6,1) NOT NULL,
      portion_description VARCHAR(100),
      calories INTEGER NOT NULL,
      protein_g NUMERIC(5,1) NOT NULL,
      carbs_g NUMERIC(5,1) NOT NULL,
      fat_g NUMERIC(5,1) NOT NULL,
      confidence VARCHAR(10),
      is_user_modified BOOLEAN NOT NULL DEFAULT FALSE,
      original_ai_item_data JSONB,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_meal_items_meal_sort ON meal_items(meal_id, sort_order);

    CREATE TABLE IF NOT EXISTS daily_summaries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      summary_date DATE NOT NULL,
      target_calories INTEGER NOT NULL,
      target_protein_g NUMERIC(5,1) NOT NULL,
      target_carbs_g NUMERIC(5,1) NOT NULL,
      target_fat_g NUMERIC(5,1) NOT NULL,
      consumed_calories INTEGER NOT NULL DEFAULT 0,
      consumed_protein_g NUMERIC(5,1) NOT NULL DEFAULT 0,
      consumed_carbs_g NUMERIC(5,1) NOT NULL DEFAULT 0,
      consumed_fat_g NUMERIC(5,1) NOT NULL DEFAULT 0,
      meals_logged_count INTEGER NOT NULL DEFAULT 0,
      is_target_met BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_summaries_user_date ON daily_summaries(user_id, summary_date);
    CREATE INDEX IF NOT EXISTS idx_daily_summaries_history ON daily_summaries(user_id, summary_date);

    CREATE TABLE IF NOT EXISTS user_gamification (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      current_streak INTEGER NOT NULL DEFAULT 0,
      longest_streak INTEGER NOT NULL DEFAULT 0,
      last_logged_date DATE,
      total_xp INTEGER NOT NULL DEFAULT 0,
      current_level INTEGER NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS xp_ledger (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      meal_id UUID REFERENCES meals(id) ON DELETE SET NULL,
      event_type VARCHAR(50) NOT NULL,
      xp_amount INTEGER NOT NULL,
      awarded_date DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_xp_ledger_user_history ON xp_ledger(user_id, created_at);
  `);
  schemaInitialized = true;
}

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const result = await client`SELECT 1 as ok`;
    if (result && result.length > 0) {
      await ensureDatabaseSchema();
      logger.info('✅ PostgreSQL database connection established and schema verified');
      return true;
    }
    return false;
  } catch (error) {
    logger.warn({ err: error }, '⚠️ PostgreSQL database connection failed (check Docker container or connection string)');
    return false;
  }
}

export async function closeDatabaseConnection(): Promise<void> {
  await client.end();
}
