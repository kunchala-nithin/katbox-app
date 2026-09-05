import { Request, Response } from "express";
import Razorpay from "razorpay";
import { verifyRazorpaySignature } from "../utils/verifySignature";
import Order from "../models/Orders";

const keyId = process.env.RAZORPAY_KEY_ID || "";
const keySecret = process.env.RAZORPAY_KEY_SECRET || "";

const razorpayInstance = new Razorpay({
  key_id: keyId,
  key_secret: keySecret,
});

/**
 * POST /api/payments/create-order
 * Generates Razorpay Order before collecting payment on client SDK
 */
export const createPaymentOrder = async (req: Request, res: Response) => {
  try {
    const { amount } = req.body;

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid or non-positive order amount provided.",
      });
    }

    // Amount converted to Paise (1 INR = 100 Paise)
    const amountInPaise = Math.round(numericAmount * 100);
    const receiptKey = `rcpt_${Date.now().toString().slice(-8)}`;

    const options = {
      amount: amountInPaise,
      currency: "INR",
      receipt: receiptKey,
      payment_capture: 1, // Auto capture upon payment
    };

    const razorpayOrder = await razorpayInstance.orders.create(options);

    return res.status(200).json({
      success: true,
      keyId: process.env.RAZORPAY_KEY_ID,
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
    });
  } catch (error: any) {
    console.error("Error creating Razorpay Order:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to initialize payment session",
      error: error.message,
    });
  }
};

/**
 * POST /api/payments/verify
 * Cryptographically verifies payment signature & persists verified order into MongoDB
 */
export const verifyPaymentAndCreateOrder = async (req: Request, res: Response) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderPayload,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderPayload) {
      return res.status(400).json({
        success: false,
        message: "Missing essential payment verification components in request body.",
      });
    }

    // 1. Replay attack protection: Prevent duplicate entries
    const existingOrder = await Order.findOne({
      $or: [
        { razorpayPaymentId: razorpay_payment_id },
        { razorpayOrderId: razorpay_order_id },
      ],
    });

    if (existingOrder) {
      return res.status(200).json({
        success: true,
        message: "Order already verified and processed.",
        order: existingOrder,
      });
    }

    // 2. Cryptographic HMAC Signature Verification
    const isValidSignature = verifyRazorpaySignature({
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
    });

    if (!isValidSignature) {
      return res.status(400).json({
        success: false,
        message: "Security Alert: Cryptographic signature verification failed!",
      });
    }

    // 3. Construct unique Daawath Order ID
    const generatedOrderId = "DW" + Date.now().toString().slice(-8);

    // 4. Save Verified Order Document into MongoDB
    const newOrder = new Order({
      orderId: generatedOrderId,
      userId: orderPayload.userId || "",
      userName: orderPayload.userName || "",
      chefId: orderPayload.chefId || "",
      chefName: orderPayload.chefName || "",
      serviceType: orderPayload.serviceType || "mealbox",
      menuName: orderPayload.menuName || "Meal Plan",
      menuImage: orderPayload.menuImage || "",
      durationType: orderPayload.durationType || "",
      deliveryTimeSlot: orderPayload.deliveryTimeSlot || "",
      addressDetails: orderPayload.addressDetails || "",
      deliveryDate: orderPayload.deliveryDate || "",
      upcomingDeliveries: Array.isArray(orderPayload.upcomingDeliveries)
        ? orderPayload.upcomingDeliveries
        : [],
      subtotal: Number(orderPayload.subtotal) || 0,
      deliveryPrice: Number(orderPayload.deliveryPrice) || 0,
      discount: Number(orderPayload.discount) || 0,
      appliedCoupon: orderPayload.appliedCoupon || "",
      totalAmount: Number(orderPayload.totalAmount) || 0,
      paymentMethod: orderPayload.paymentMethod || "online",
      paymentStatus: "Paid",
      orderStatus: "Placed",
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      paymentCaptured: true,
      paidAt: new Date(),
      selections: orderPayload.selections || null,
      items: orderPayload.items || [],
    });

    const savedOrder = await newOrder.save();

    return res.status(201).json({
      success: true,
      message: "Payment verified successfully & order persisted.",
      order: savedOrder,
    });
  } catch (error: any) {
    console.error("Error verifying payment and saving order:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during payment verification",
      error: error.message,
    });
  }
};