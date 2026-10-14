// seed.ts

import { fileURLToPath } from 'url';
import { pool, closeDb } from '../config/db.js';
import { initializeDatabase } from './init.js';

export interface SeedResult {
  eventId: number;
  eventName: string;
  totalSeatsCreated: number;
}

export const seedDatabase = async (): Promise<SeedResult> => {
  const client = await pool.connect();

  try {
    // 1. Ensure tables exist before seeding
    await initializeDatabase();

    // 2. Start transaction
    await client.query('BEGIN');

    // 3. Insert one Event
    const eventName = 'Coldplay Live Concert 2026';
    const eventDescription = 'World Tour - Live Stadium Performance';
    const eventDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30 days from now

    const eventResult = await client.query<{ id: number; name: string }>(
      `
      INSERT INTO "Events" (name, description, event_date, total_seats)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name;
      `,
      [eventName, eventDescription, eventDate, 50]
    );

    const event = eventResult.rows[0];
    const eventId = event.id;

    console.log(`[Seed] Created event "${event.name}" with ID: ${eventId}`);

    // 4. Generate 50 seats associated with this event, all with status 'available'
    const totalSeats = 50;
    const seatValues: (number | string)[] = [];
    const placeholders: string[] = [];

    for (let i = 1; i <= totalSeats; i++) {
      const offset = (i - 1) * 3;
      // Generates: ($1, $2, $3), ($4, $5, $6), ...
      placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
      seatValues.push(eventId, `Seat-${i}`, 'available');
    }

    const seatsQuery = `
      INSERT INTO "Seats" (event_id, seat_number, status)
      VALUES ${placeholders.join(', ')}
      RETURNING id, seat_number, status;
    `;

    const seatsResult = await client.query(seatsQuery, seatValues);

    // 5. Commit transaction
    await client.query('COMMIT');

    console.log(`[Seed] Successfully seeded ${seatsResult.rowCount} seats for Event ID: ${eventId}`);

    return {
      eventId,
      eventName: event.name,
      totalSeatsCreated: seatsResult.rowCount ?? 0,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Seed] Error during seeding, transaction rolled back:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Allow direct CLI execution
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  seedDatabase()
    .then((result) => {
      console.log('[Seed] Seeding finished successfully:', result);
    })
    .catch((err) => {
      console.error('[Seed] Seeding failed:', err);
    })
    .finally(() => closeDb());
}
