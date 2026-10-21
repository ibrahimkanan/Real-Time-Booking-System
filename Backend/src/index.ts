import express from "express";
import { pool } from "./config/db.js";
import { redisClient, connectRedis } from "./config/redis.js";

import seatRoutes from "./routes/seat.route.js";
import { startSeatBookingWorker } from "./workers/seat.worker.js";
import paymentRoutes from "./routes/payment.route.js";

import { createServer } from "http";
import { initSocket } from "./config/socket.js";

const app = express();
const PORT = 3000;

// Stripe webhook needs raw body
app.use((req, res, next) => {
    if (req.originalUrl === "/api/payments/webhook") {
        next();
    } else {
        express.json()(req, res, next);
    }
});

app.use("/api/seats", seatRoutes);
app.use("/api/payments", paymentRoutes);

async function main() {
    console.log("--- Initializing Real-Time Booking Backend ---");

    try {
        // 1. Test PostgreSQL
        const pgRes = await pool.query(
            "SELECT NOW() as current_time, current_database() as database",
        );
        console.log("[PostgreSQL] Connected:", pgRes.rows[0]);

        // 2. Test Redis
        await connectRedis();
        await redisClient.set("health", "ok");
        const redisVal = await redisClient.get("health");
        console.log("[Redis] Health check key value:", redisVal);

        // 3. Express & Socket.io Server
        const httpServer = createServer(app);
        initSocket(httpServer);

        httpServer.listen(PORT, () => {
            console.log(
                `🚀 Server & Socket.io running on http://localhost:${PORT}`,
            );
            // 4. Start background worker once server & socket are ready
            startSeatBookingWorker();
        });
    } catch (error) {
        console.error("Initialization error:", error);
    }
}

main();
