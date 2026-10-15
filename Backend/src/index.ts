// index.ts

import { pool } from './config/db.js';
import { redisClient, connectRedis } from './config/redis.js';
import seatRoutes from './routes/seat.route.js';
import express from 'express';

const app = express();
app.use(express.json());

app.use('/api/seats', seatRoutes);


async function main() {
  console.log('--- Initializing Real-Time Booking Backend ---');

  try {
    // 1. Test PostgreSQL connection
    const pgRes = await pool.query('SELECT NOW() as current_time, current_database() as database');
    console.log('[PostgreSQL] Connected:', pgRes.rows[0]);

    // 2. Test Redis connection
    await connectRedis();
    await redisClient.set('health', 'ok');
    const redisVal = await redisClient.get('health');
    console.log('[Redis] Health check key value:', redisVal);

    console.log('--- All database and cache connections ready ---');
  } catch (error) {
    console.error('Initialization error:', error);
  }
}

main();
