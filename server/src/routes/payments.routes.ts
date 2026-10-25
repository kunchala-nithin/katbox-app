import { Router } from "express";
import {
  createPaymentOrder,
  verifyPaymentAndCreateOrder,
} from "../controllers/payments.controller";
import { createYoupiPayment, getYoupiPaymentStatus } from "../controllers/youpi.controller";
import { protect } from "../middleware/auth.middleware";

const router = Router();

router.post("/create-order", createPaymentOrder);
router.post("/verify", verifyPaymentAndCreateOrder);

// YouPI-PG is an isolated experimental option; Razorpay endpoints remain unchanged.
router.post("/youpi/create", protect, createYoupiPayment);
router.get("/youpi/status/:orderId", protect, getYoupiPaymentStatus);

export default router;