import { Request, Response } from "express";
import Coupon from "../models/Coupon";

export const applyCoupon = async (req: Request, res: Response) => {
  try {
    const { code, cartTotal } = req.body;

    const coupon = await Coupon.findOne({ code: code.toUpperCase() });

    if (!coupon || !coupon.isActive) {
      return res.json({ success: false, message: "Invalid coupon" });
    }

    // Expiry check
    if (coupon.expiry && coupon.expiry < new Date()) {
      return res.json({ success: false, message: "Coupon expired" });
    }

    // Min order check
    if (cartTotal < coupon.minOrder) {
      return res.json({
        success: false,
        message: `Minimum order ₹${coupon.minOrder}`,
      });
    }

    let discount = 0;

    if (coupon.type === "FLAT") {
      discount = coupon.value;
    } else {
      discount = (cartTotal * coupon.value) / 100;

      if (coupon.maxDiscount) {
        discount = Math.min(discount, coupon.maxDiscount);
      }
    }

    return res.json({
      success: true,
      discount: Math.round(discount),
      code: coupon.code,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
  
};
export const getCoupons = async (_req: Request, res: Response) => {
  try {
    const coupons = await Coupon.find({ isActive: true });

    res.json({
      success: true,
      coupons,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false });
  }
};