import type { Config } from 'drizzle-kit';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

export default {
  schema: './src/database/schema/index.ts',
  out: './src/database/migrations',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:admin@localhost:5432/makemefit_db',
  },
} satisfies Config;
