import { Router } from "express";
import { protect } from "../middleware/auth.middleware";
import { createPaymentOrder, verifyPaymentAndCreateOrder } from "../controllers/payments.controller";

const router = Router();

// Both payment endpoints require the authenticated KatBox customer session.
router.post("/create-order", protect, createPaymentOrder);
router.post("/verify", protect, verifyPaymentAndCreateOrder);

export default router;
