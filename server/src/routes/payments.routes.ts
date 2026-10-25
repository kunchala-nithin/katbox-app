import { Router } from "express";
import { createPaymentOrder, verifyPaymentAndCreateOrder } from "../controllers/payments.controller";
import { createYoupiPayment, getYoupiPaymentStatus } from "../controllers/youpi.controller";
import { protect } from "../middleware/auth.middleware";

const router = Router();

// Existing Razorpay endpoints are intentionally unchanged.
router.post("/create-order", createPaymentOrder);
router.post("/verify", verifyPaymentAndCreateOrder);

router.post("/youpi/create", protect, createYoupiPayment);
router.get("/youpi/status/:orderId", protect, getYoupiPaymentStatus);

export default router;
