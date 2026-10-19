// src/routes/payment.route.ts

import { Router } from "express";
import express from "express";

import {
    createCheckoutSession,
    handleStripeWebhook,
} from "../controllers/payment.controller.js";

const router = Router();

router.post("/create-checkout-session", createCheckoutSession);
router.post("/webhook", handleStripeWebhook);

router.post(
    "/webhook",
    express.raw({ type: "application/json" }),
    handleStripeWebhook,
);

export default router;
