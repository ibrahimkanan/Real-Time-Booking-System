import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || 'secretpassword',
  database: process.env.DB_NAME || 'booking_system',
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
