import express from "express";
import { pool } from "./config/db.js";
import { redisClient, connectRedis } from "./config/redis.js";

import seatRoutes from "./routes/seat.route.js";

const app = express();
const PORT = 3000;

app.use(express.json());

app.use("/api/seats", seatRoutes);

async function main() {
    console.log("--- Initializing Real-Time Booking Backend ---");

    try {
        // 1.Test PostgreSQL
        const pgRes = await pool.query(
            "SELECT NOW() as current_time, current_database() as database",
        );
        console.log("[PostgreSQL] Connected:", pgRes.rows[0]);

        // 2. Test Redis
        await connectRedis();
        await redisClient.set("health", "ok");
        const redisVal = await redisClient.get("health");
        console.log("[Redis] Health check key value:", redisVal);

        // 3. Express Server
        app.listen(PORT, () => {
            console.log(
                `[Server] Express is running on http://localhost:${PORT}`,
            );
            console.log("--- API is ready to accept requests ---");
        });
    } catch (error) {
        console.error("Initialization error:", error);
    }
}

main();
