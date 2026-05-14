import Redis from 'ioredis';
import { env } from './env.js';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(env.REDIS_URL, {
      retryStrategy: (times) => {
        if (times > 3) {
          console.warn('Redis connection failed after 3 retries, operating without cache');
          return null;
        }
        return Math.min(times * 100, 3000);
      },
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false,
    });

    redisClient.on('error', (err) => {
      if (process.env.NODE_ENV === 'development') {
        console.warn('Redis error (non-critical):', err.message);
      }
    });

    redisClient.on('connect', () => {
      console.log('✅ Redis connected');
    });
  }
  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
