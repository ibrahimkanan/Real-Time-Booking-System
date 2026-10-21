import { Request, Response } from "express";
import { pool } from "../config/db.js";
import { redisClient } from "../config/redis.js";
import { v4 as uuidv4 } from "uuid";
import { emitSeatUpdate } from "../config/socket.js";

export const holdSeat = async (req: Request, res: Response) => {
    const { eventId, seatId, userId } = req.body;

    if (!eventId || !seatId || !userId) {
        res.status(400).json({ error: "Missing eventId, seatId, or userId" });
        return;
    }

    const holdKey = `hold:event:${eventId}:seat:${seatId}`;

    try {
        const isHeld = await redisClient.get(holdKey);
        if (isHeld) {
            res.status(409).json({ message: "Seat is already held" });
            return;
        }

        const client = await pool.connect();

        try {
            await client.query("BEGIN");

            const seatResult = await client.query(
                `SELECT status FROM "Seats" WHERE id = $1 AND event_id = $2 FOR UPDATE`,
                [seatId, eventId],
            );

            if (seatResult.rows.length === 0) {
                await client.query("ROLLBACK");
                res.status(404).json({ message: "Seat not found" });
                return;
            }

            const seat = seatResult.rows[0];

            if (seat.status !== "available") {
                await client.query("ROLLBACK");
                res.status(409).json({ message: "Seat is not available" });
                return;
            }

            await client.query(
                `UPDATE "Seats" SET status = 'held', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
                [seatId],
            );

            await redisClient.setEx(holdKey, 300, userId);
            await client.query("COMMIT");

            emitSeatUpdate(Number(eventId), Number(seatId), "held");
            res.status(200).json({
                message: "Seat held successfully",
                seatId,
                expiresIn: 300,
            });
        } catch (dbError) {
            await client.query("ROLLBACK");
            throw dbError;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error("[Hold Seat] Error:", error);
        res.status(500).json({ message: "Failed to hold seat" });
    }
};

export const bookSeat = async (req: Request, res: Response): Promise<void> => {
    const { eventId, seatId, userId } = req.body;

    // validate input
    if (!eventId || !seatId || !userId) {
        res.status(400).json({ error: "Missing eventId, seatId, or userId" });
        return;
    }

    // get hold key
    const holdKey = `hold:event:${eventId}:seat:${seatId}`;

    try {
        // check if seat is held
        const heldBy = await redisClient.get(holdKey);

        // if seat is not held
        if (!heldBy) {
            res.status(400).json({
                error: "Seat hold has expired or was never held",
            });
            return;
        }

        // if seat is not held by this user
        if (heldBy !== userId) {
            res.status(403).json({ message: "Seat is not held by this user" });
            return;
        }

        // acquire a client
        const client = await pool.connect();

        try {
            await client.query("BEGIN");

            // Re-check if seat is still available
            const seatResult = await client.query(
                `SELECT status FROM "Seats" WHERE id = $1 AND event_id = $2 FOR UPDATE`,
                [seatId, eventId],
            );

            // if seat is not found or not held
            if (
                seatResult.rows.length === 0 ||
                seatResult.rows[0].status !== "held"
            ) {
                await client.query("ROLLBACK");
                res.status(409).json({ message: "Seat is not available" });
                return;
            }

            // update seat status to booked
            await client.query(
                `UPDATE "Seats" SET status = 'booked', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
                [seatId],
            );

            // create booking
            const bookingReference = uuidv4();
            const bookingResult = await client.query(
                `INSERT INTO "Bookings" (event_id, seat_id, user_id, booking_reference, status)
                VALUES ($1, $2, $3, $4, 'confirmed') RETURNING id, booking_reference`,
                [eventId, seatId, userId, bookingReference],
            );

            // remove hold
            await redisClient.del(holdKey);
            await client.query("COMMIT");

            // send response
            res.status(200).json({
                message: "Seat booked successfully",
                bookingReference: bookingResult.rows[0].booking_reference,
                seatId,
            });
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error("[Book Seat] Error:", error);
        res.status(500).json({ message: "Failed to book seat" });
    }
};
