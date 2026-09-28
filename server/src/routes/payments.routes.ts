import { Router } from "express";
import {
  createPaymentOrder,
  verifyPaymentAndCreateOrder,
} from "../controllers/payments.controller";

const router = Router();

router.post("/create-order", createPaymentOrder);
router.post("/verify", verifyPaymentAndCreateOrder);

export default router;