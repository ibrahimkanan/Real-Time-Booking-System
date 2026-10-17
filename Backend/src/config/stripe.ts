// src/config/stripe.ts

import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config();

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
    console.error('[Stripe] STRIPE_SECRET_KEY is missing in .env file!');
}

export const stripe = new Stripe(stripeSecretKey || '', {
    apiVersion: '2026-09-30.endive',
});