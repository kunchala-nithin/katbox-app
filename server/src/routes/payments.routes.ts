import { Router } from "express";
import { protect } from "../middleware/auth.middleware";
import { createPaymentOrder, verifyPaymentAndCreateOrder, handleRazorpayWebhook } from "../controllers/payments.controller";

const router = Router();

// Webhook is authenticated by Razorpay's HMAC signature over the raw body.
// It must not use the customer JWT middleware.
router.post("/webhook", handleRazorpayWebhook);

// Customer-facing payment endpoints require the authenticated KatBox session.
router.post("/create-order", protect, createPaymentOrder);
router.post("/verify", protect, verifyPaymentAndCreateOrder);

export default router;
