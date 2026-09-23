// server/controllers/payments.controller.ts
import { Request, Response } from "express";

// ==================== RAZORPAY IMPORTS (COMMENTED OUT) ====================
// import Razorpay from "razorpay";
// import { verifyRazorpaySignature } from "../utils/verifySignature";
// =========================================================================

import Order from "../models/Orders";

// ==================== RAZORPAY CONFIG (COMMENTED OUT) ====================
// const keyId = process.env.RAZORPAY_KEY_ID || "";
// const keySecret = process.env.RAZORPAY_KEY_SECRET || "";
//
// const razorpayInstance = new Razorpay({
//   key_id: keyId,
//   key_secret: keySecret,
// });
// =========================================================================

// ==================== CASHFREE CONFIG ====================
const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID || "";
const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY || "";
const CASHFREE_ENV = (process.env.CASHFREE_ENV || "SANDBOX").toUpperCase(); // "SANDBOX" | "PRODUCTION"
const CASHFREE_BASE_URL =
  CASHFREE_ENV === "PRODUCTION"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
const CASHFREE_API_VERSION = "2023-08-01";
// =========================================================

/**
 * POST /api/payments/create-order
 *
 * Cashfree: Creates an order on Cashfree's servers and returns a
 * `payment_session_id` which the client SDK uses to open the hosted
 * checkout (UPI QR + PhonePe/GPay/Paytm deep-links + cards + netbanking).
 *
 * Body: { amount: number, orderId?: string }
 */
export const createPaymentOrder = async (req: Request, res: Response) => {
  try {
    const { amount, orderId: merchantOrderId } = req.body;

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid or non-positive order amount provided.",
      });
    }

    // Cashfree requires order_id: alphanumeric + underscore/hyphen, 3-45 chars, unique.
    const cfOrderId = `KB${Date.now().toString().slice(-10)}${Math.floor(
      Math.random() * 900 + 100
    )}`;

    // Customer ID must exist; fallback to a deterministic value when not provided.
    const customerId = merchantOrderId
      ? String(merchantOrderId).slice(0, 45)
      : `guest_${Date.now().toString().slice(-8)}`;

    const orderRequest = {
      order_id: cfOrderId,
      order_amount: numericAmount,
      order_currency: "INR",
      customer_details: {
        customer_id: customerId,
        // Cashfree requires a phone; if we don't have a real one, use a
        // placeholder. For production, always pass the real phone from
        // the user's profile.
        customer_phone: "9999999999",
      },
      order_meta: {
        // Not used for native SDK, but Cashfree expects the key.
        notify_url: "",
      },
    };

    const cfResponse = await fetch(`${CASHFREE_BASE_URL}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-version": CASHFREE_API_VERSION,
        "x-client-id": CASHFREE_APP_ID,
        "x-client-secret": CASHFREE_SECRET_KEY,
      },
      body: JSON.stringify(orderRequest),
    });

    const cfData = await cfResponse.json();

    if (!cfResponse.ok) {
      console.error("Cashfree create order error:", cfData);
      return res.status(500).json({
        success: false,
        message:
          cfData?.message ||
          "Failed to initialize payment session with Cashfree",
        error: cfData,
      });
    }

    return res.status(200).json({
      success: true,
      orderId: cfData.order_id,
      paymentSessionId: cfData.payment_session_id,
      amount: cfData.order_amount,
      currency: cfData.order_currency,
    });
  } catch (error: any) {
    console.error("Error creating Cashfree Order:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to initialize payment session",
      error: error.message,
    });
  }
};

/**
 * POST /api/payments/verify
 *
 * Production-grade server-side verification:
 *
 *   1. Client sends { cf_order_id, orderPayload }.
 *   2. We ask Cashfree's API directly "what is the status of this order?".
 *   3. If Cashfree says order_status === "PAID", we trust it and persist
 *      the order to MongoDB.
 *   4. Replay-protected: if we already saved this cf_order_id, we return
 *      the existing order instead of creating a duplicate.
 *
 * This replaces Razorpay's HMAC signature check — instead of trusting the
 * client to send a signature, we ask Cashfree directly.
 *
 * Body: { cf_order_id: string, orderPayload: {...} }
 */
export const verifyPaymentAndCreateOrder = async (
  req: Request,
  res: Response
) => {
  try {
    const { cf_order_id, orderPayload } = req.body;

    if (!cf_order_id || !orderPayload) {
      return res.status(400).json({
        success: false,
        message: "Missing cf_order_id or orderPayload in request body.",
      });
    }

    // ------------------------------------------------------------------
    // 1. Replay attack protection: if this Cashfree order was already
    //    verified and saved, return the existing document.
    // ------------------------------------------------------------------
    const existingOrder = await Order.findOne({
      cashfreeOrderId: cf_order_id,
    });

    if (existingOrder) {
      return res.status(200).json({
        success: true,
        message: "Order already verified and processed.",
        order: existingOrder,
      });
    }

    // ------------------------------------------------------------------
    // 2. Ask Cashfree directly: "Is this order actually paid?"
    //    We use the secret key so the client can't forge this call.
    // ------------------------------------------------------------------
    const cfResponse = await fetch(
      `${CASHFREE_BASE_URL}/orders/${cf_order_id}`,
      {
        method: "GET",
        headers: {
          "x-api-version": CASHFREE_API_VERSION,
          "x-client-id": CASHFREE_APP_ID,
          "x-client-secret": CASHFREE_SECRET_KEY,
        },
      }
    );

    const cfOrder = await cfResponse.json();

    if (!cfResponse.ok) {
      console.error("Cashfree fetch order error:", cfOrder);
      return res.status(400).json({
        success: false,
        message: "Failed to verify payment with Cashfree",
        error: cfOrder,
      });
    }

    // ------------------------------------------------------------------
    // 3. Reject unless Cashfree confirms PAID.
    // ------------------------------------------------------------------
    if (cfOrder.order_status !== "PAID") {
      return res.status(400).json({
        success: false,
        message: `Payment not completed. Current status: ${cfOrder.order_status}`,
        cashfreeStatus: cfOrder.order_status,
      });
    }

    // ------------------------------------------------------------------
    // 4. Extract the payment ID from Cashfree's response. Cashfree
    //    returns payments[] inside the order object.
    // ------------------------------------------------------------------
    const paymentRecord =
      Array.isArray(cfOrder.payments) && cfOrder.payments.length > 0
        ? cfOrder.payments[0]
        : null;

    const cfPaymentId =
      paymentRecord?.cf_payment_id?.toString() || "";

    // ------------------------------------------------------------------
    // 5. Construct the platform order ID (KBxxxxxxxx format).
    // ------------------------------------------------------------------
    const generatedOrderId =
      "KB" + Date.now().toString().slice(-8);

    // ------------------------------------------------------------------
    // 6. Persist the verified order.
    // ------------------------------------------------------------------
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

      // Payment flags — cashfree is the source of truth here
      paymentMethod: orderPayload.paymentMethod || "online",
      paymentStatus: "Paid",
      orderStatus: "Placed",

      // ==================== CASHFREE FIELDS ====================
      cashfreeOrderId: cf_order_id,
      cashfreePaymentId: cfPaymentId,
      paymentCaptured: true,
      paidAt: new Date(),
      // ========================================================

      // Advance/balance split (Cashfree pays the 40% advance)
      advancePaidAmount:
        Number(orderPayload.advancePaidAmount) ||
        Math.round((Number(orderPayload.totalAmount) || 0) * 0.4 * 100) / 100,
      balanceAmountToCollect:
        Number(orderPayload.balanceAmountToCollect) ||
        Math.round(
          ((Number(orderPayload.totalAmount) || 0) -
            (Number(orderPayload.advancePaidAmount) ||
              (Number(orderPayload.totalAmount) || 0) * 0.4)) *
            100
        ) / 100,

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

/* ======================================================================
   ============ RAZORPAY CONTROLLER FUNCTIONS (COMMENTED OUT) ============
   ======================================================================

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

   ============ END RAZORPAY CONTROLLER FUNCTIONS ============
   ====================================================================== */