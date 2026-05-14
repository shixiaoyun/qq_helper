import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('1031'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  NIUMA_ENGINE_URL: z.string().url().default('http://localhost:1023'),
  DATABASE_URL: z.string().default('file:./database/app.db'),
  CORS_ORIGIN: z.string().default('http://localhost:3031'),
  RATE_LIMIT_WINDOW_MS: z.string().default('60000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_FILE_SIZE: z.string().default('10485760'),
});

export const env = envSchema.parse(process.env);
