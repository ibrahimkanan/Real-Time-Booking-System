// src/controllers/payment.controller.ts

import { Request, Response } from "express";
import { stripe } from "../config/stripe.js";
import { redisClient } from "../config/redis.js";

export const createCheckoutSession = async (
    req: Request,
    res: Response,
): Promise<void> => {
    const { eventId, seatId, userId } = req.body;

    // validate input
    if (!eventId || !seatId || !userId) {
        res.status(400).json({ error: "Missing eventId, seatId, or userId" });
        return;
    }

    const holdKey = `hold:event:${eventId}:seat:${seatId}`;

    try {
        // check if seat is held by this user
        const heldBy = await redisClient.get(holdKey);

        if (heldBy !== userId) {
            res.status(400).json({ error: "Seat is not held by this user" });
            return;
        }

        const session = await stripe.checkout.sessions.create({
            line_items: [
                {
                    price_data: {
                        currency: "usd",
                        product_data: {
                            name: `Ticket for Event ${eventId} - Seat ${seatId}`,
                            description: "Standard Entry Ticket",
                        },
                        unit_amount: 5000,
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
            url: session.url,
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: "Failed to create checkout session" });
    }
};
