// db.ts

import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

export const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5433', 10),
  database: process.env.DB_NAME || 'booking_db',
  user: process.env.DB_USER || 'booking_user',
  password: process.env.DB_PASSWORD || 'booking_pass123',
  max: 20, // Max concurrent connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
  console.log('[PostgreSQL] Connected to database successfully.');
});

pool.on('error', (err: Error) => {
  console.error('[PostgreSQL] Unexpected error on idle client:', err.message);
  process.exit(-1);
});

export const query = (text: string, params?: unknown[]) => {
  return pool.query(text, params);
};

export const closeDb = async (): Promise<void> => {
  await pool.end();
  console.log('[PostgreSQL] Connection pool closed.');
};
