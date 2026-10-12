import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, closeDb } from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const initializeDatabase = async (): Promise<void> => {
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

    console.log('[Database] Applying schema tables...');
    await pool.query(schemaSql);
    console.log('[Database] Tables "Events", "Seats", and "Bookings" created or already exist.');
  } catch (error) {
    console.error('[Database] Failed to initialize tables:', error);
    throw error;
  }
};

// Allow direct CLI execution
if (process.argv[1] === __filename) {
  initializeDatabase()
    .catch((err) => console.error(err))
    .finally(() => closeDb());
}
