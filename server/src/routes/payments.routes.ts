// payments.routes.ts
import { Router } from "express";
import {
  createPaymentOrder,
  verifyPaymentAndCreateOrder,
} from "../controllers/payments.controller";

const router = Router();

// Razorpay is the only active online payment gateway.
// Both endpoints operate on an existing KatBox order created by /api/orders/create.
router.post("/create-order", createPaymentOrder);
router.post("/verify", verifyPaymentAndCreateOrder);

export default router;
