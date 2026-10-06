import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env from root or local
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  AI_PROVIDER: z.string().default('mock'),
  AI_VISION_PROVIDER: z.string().default('mock'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-3.8-flash'),
});

export type Env = z.infer<typeof envSchema>;

let parsedEnv: Env;
try {
  parsedEnv = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('❌ Invalid environment variables:', error.format());
  } else {
    console.error('❌ Failed to parse environment variables:', error);
  }
  process.exit(1);
}

export const env = parsedEnv;
