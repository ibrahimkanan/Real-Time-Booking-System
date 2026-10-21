// src/workers/seat.worker.ts

import { pool } from "../config/db.js";
import { emitSeatUpdate } from "../config/socket.js";

export const startSeatBookingWorker = () => {
    console.log("[Worker] Seat relase backround worker started");

    // Run the check every 1 minute (60,000 milliseconds)
    setInterval(async () => {
        // Query: Update seats that are 'held' and haven't been updated in the last 5 minutes
        try {
            const result = await pool.query(`
                UPDATE "Seats"
                SET status = 'available', updated_at = CURRENT_TIMESTAMP
                WHERE status = 'held' 
                AND updated_at < NOW() - INTERVAL '5 minutes'
                RETURNING id, seat_number;
            `);


            if (result.rowCount && result.rowCount > 0) {
                console.log(
                    `[Worker] Released ${result.rowCount} expired seats back to 'available'.`,
                );
                result.rows.forEach((row) => {
                    console.log(
                        `         -> Released Seat ID: ${row.id} (${row.seat_number})`,
                    );
                    emitSeatUpdate(
                        Number(row.event_id),
                        Number(row.id),
                        "available",
                    );
                });
            }
        } catch (error) {
            console.error("[Worker] Error releasing expired seats:", error);
        }
    }, 60000);
};
