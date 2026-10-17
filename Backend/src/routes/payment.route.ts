// src/routes/payment.route.ts

import { Router } from 'express';
import { createCheckoutSession } from '../controllers/payment.controller.js';

const router = Router();

router.post('/create-checkout-session', createCheckoutSession);

export default router;