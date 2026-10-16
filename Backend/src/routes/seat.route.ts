import { Router } from "express";
import { holdSeat, bookSeat } from "../controllers/seat.controller.js";

const router = Router();

router.post("/hold", holdSeat);
router.post("/book", bookSeat);

export default router;
