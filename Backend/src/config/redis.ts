// redis.ts

import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
const redisPassword = process.env.REDIS_PASSWORD || undefined;

export const redisClient = createClient({
  socket: {
    host: redisHost,
    port: redisPort,
    reconnectStrategy: (retries: number) => {
      // Exponential backoff capped at 3 seconds
      return Math.min(retries * 100, 3000);
    },
  },
  password: redisPassword,
});

redisClient.on('connect', () => {
  console.log('[Redis] Connecting to server...');
});

redisClient.on('ready', () => {
  console.log('[Redis] Connected and ready to use.');
});

redisClient.on('error', (err: Error) => {
  console.error('[Redis] Client error:', err.message);
});

redisClient.on('reconnecting', () => {
  console.warn('[Redis] Reconnecting...');
});

export const connectRedis = async (): Promise<void> => {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
};

export const closeRedis = async (): Promise<void> => {
  if (redisClient.isOpen) {
    await redisClient.quit();
    console.log('[Redis] Connection closed.');
  }
};
