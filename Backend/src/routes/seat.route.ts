import { Router } from 'express';
import { holdSeat } from '../controllers/seat.controller.js';

const router = Router();

router.post('/hold', holdSeat);

export default router;