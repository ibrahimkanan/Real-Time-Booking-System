// src/controllers/payment.controller.ts

import { Request, Response } from "express";
import { stripe } from "../config/stripe.js";
import { redisClient } from "../config/redis.js";
import { pool } from "../config/db.js";
import { v4 as uuidv4 } from "uuid";
import Stripe from "stripe";
import { emitSeatUpdate } from "../config/socket.js";

// Helper function to finalize booking in PostgreSQL and clean up Redis
const finalizeBookingInDB = async (
    eventId: number,
    seatId: number,
    userId: string,
) => {
    const holdKey = `hold:event:${eventId}:seat:${seatId}`;
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // Lock the seat row in PostgreSQL
        const seatResult = await client.query(
            `SELECT status FROM "Seats" WHERE id = $1 AND event_id = $2 FOR UPDATE`,
            [seatId, eventId],
        );

        if (
            seatResult.rows.length === 0 ||
            seatResult.rows[0].status === "booked"
        ) {
            await client.query("ROLLBACK");
            return {
                success: false,
                reason: "Seat is already booked or does not exist",
            };
        }

        // Update seat status to booked
        await client.query(
            `UPDATE "Seats" SET status = 'booked', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [seatId],
        );

        // Create official booking record
        const bookingReference = uuidv4();
        await client.query(
            `INSERT INTO "Bookings" (event_id, seat_id, user_id, booking_reference, status)
            VALUES ($1, $2, $3, $4, 'confirmed')`,
            [eventId, seatId, userId, bookingReference],
        );

        // Remove temporary hold from Redis
        await redisClient.del(holdKey);

        await client.query("COMMIT");
        emitSeatUpdate(Number(eventId), Number(seatId), "booked");
        return { success: true, bookingReference };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

export const createCheckoutSession = async (
    req: Request,
    res: Response,
): Promise<void> => {
    const { eventId, seatId, userId } = req.body;

    if (!eventId || !seatId || !userId) {
        res.status(400).json({ error: "Missing eventId, seatId, or userId" });
        return;
    }

    const holdKey = `hold:event:${eventId}:seat:${seatId}`;

    try {
        // 1. Verify that the user still holds the seat in Redis
        const heldBy = await redisClient.get(holdKey);

        if (heldBy !== userId) {
            res.status(403).json({
                error: "Seat hold has expired or is held by someone else",
            });
            return;
        }

        // 2. Check if Mock Mode is enabled for load testing (k6)
        if (process.env.PAYMENT_MODE === "mock") {
            // Simulate 200ms network latency for realistic load testing
            await new Promise((resolve) => setTimeout(resolve, 200));

            const result = await finalizeBookingInDB(
                Number(eventId),
                Number(seatId),
                userId,
            );

            if (!result.success) {
                res.status(409).json({ error: result.reason });
                return;
            }

            res.status(200).json({
                message: "Mock payment processed and seat booked successfully",
                mode: "mock",
                bookingReference: result.bookingReference,
            });
            return;
        }

        // 3. Real Stripe Checkout Session (when PAYMENT_MODE !== 'mock')
        const session = await stripe.checkout.sessions.create({
            line_items: [
                {
                    price_data: {
                        currency: "usd",
                        product_data: {
                            name: `Ticket for Event ${eventId} - Seat ${seatId}`,
                            description: "Standard Entry Ticket",
                        },
                        unit_amount: 5000, // $50.00
                    },
                    quantity: 1,
                },
            ],
            mode: "payment",
            success_url: `http://localhost:3000/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `http://localhost:3000/cancel`,
            metadata: {
                eventId: eventId.toString(),
                seatId: seatId.toString(),
                userId: userId,
            },
        });

        res.status(200).json({
            message: "Checkout session created",
            mode: "live",
            url: session.url,
        });
    } catch (error) {
        console.error("[Payment Error]:", error);
        res.status(500).json({
            error: "Internal server error while processing payment",
        });
    }
};

export const handleStripeWebhook = async (
    req: Request,
    res: Response,
): Promise<void> => {
    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event: Stripe.Event;

    try {
        if (!webhookSecret) {
            throw new Error("STRIPE_WEBHOOK_SECRET is missing");
        }
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
        console.error(
            `[Webhook] Signature verification failed: ${err.message}`,
        );
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }

    if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;

        const eventId = Number(session.metadata?.eventId);
        const seatId = Number(session.metadata?.seatId);
        const userId = session.metadata?.userId;

        if (!eventId || !seatId || !userId) {
            console.error("[Webhook] Missing metadata in Stripe session");
            res.status(400).json({ error: "Missing metadata" });
            return;
        }

        try {
            const result = await finalizeBookingInDB(eventId, seatId, userId);
            if (result.success) {
                console.log(
                    `🎉 [Webhook] Payment confirmed! Seat ${seatId} booked for ${userId} (Ref: ${result.bookingReference})`,
                );
            } else {
                console.warn(`[Webhook] ${result.reason}`);
            }
        } catch (dbError) {
            console.error("[Webhook] Database transaction failed:", dbError);
            res.status(500).json({ error: "Failed to finalize booking" });
            return;
        }
    }

    res.status(200).json({ received: true });
};
