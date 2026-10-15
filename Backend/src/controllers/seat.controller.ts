import { Request, Response } from "express";
import { pool } from "../config/db.js";
import { redisClient } from "../config/redis.js";

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
                `SELECT status FORM "Seats" WHERE id = $1 AND event_id = $2 FOR UPDATE`,
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
