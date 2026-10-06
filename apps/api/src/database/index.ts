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

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const result = await client`SELECT 1 as ok`;
    if (result && result.length > 0) {
      logger.info('✅ PostgreSQL database connection established');
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
