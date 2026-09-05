import express from "express";
import { applyCoupon, getCoupons } from "../controllers/coupon.controller";

const router = express.Router();

router.post("/apply", applyCoupon);
router.get("/", getCoupons);

export default router;