import { Router } from "express";
import { holdSeat, bookSeat } from "../controllers/seat.controller.js";
import { pool } from "../config/db.js";

const router = Router();

router.post("/hold", holdSeat);
router.post("/book", bookSeat);

router.get("/:eventId", async (req, res) => {
    try {
        const { eventId } = req.params;
        const result = await pool.query(
            `SELECT id, event_id, seat_number, status FROM "Seats" WHERE event_id = $1 ORDER BY id ASC`,
            [eventId],
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch seats" });
    }
});

export default router;
