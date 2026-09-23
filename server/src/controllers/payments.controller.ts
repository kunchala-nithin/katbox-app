// server/controllers/payments.controller.ts
import { Request, Response } from "express";
import mongoose from "mongoose";

// ==================== RAZORPAY IMPORTS (COMMENTED OUT) ====================
// import Razorpay from "razorpay";
// import { verifyRazorpaySignature } from "../utils/verifySignature";
// =========================================================================

import Order from "../models/Orders";
import Chef from "../models/Chef";
import User from "../models/User";
import { io } from "..";
import {
  sendExpoPush,
  isValidExpoToken,
  ORDER_ALARM_SOUND,
  CHEF_ORDER_CHANNEL_ID,
} from "../utils/expoPush";

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

/* ─────────────────────────────────────────────────────────────────
   ✅ NEW HELPER — Safely parse a JSON value that may arrive as a
   string or already as an array/object. Never throws.
   ───────────────────────────────────────────────────────────────── */
const parseIfJsonString = (value: any, fallback: any = null) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  try {
    return JSON.parse(trimmed);
  } catch {
    return fallback;
  }
};

/* ─────────────────────────────────────────────────────────────────
   ✅ NEW HELPER — Normalize the incoming items array so it always
   satisfies HomemadeItemSubSchema's required fields, regardless of
   what the client sends. This is a defense-in-depth mirror of the
   sanitization already done in CheckOutScreen.tsx.

   Why: If any item is missing `id`, `name`, `price`, or `quantity`,
   Mongoose throws a ValidationError on save and the entire payment
   verification fails with a 500. Previously this only happened for
   Homemade/QuickBites because their schema is stricter than Mixed.
   ───────────────────────────────────────────────────────────────── */
const sanitizeItemsForSchema = (rawItems: any): any[] => {
  const parsed = parseIfJsonString(rawItems, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((it: any, idx: number) => ({
    id: String(it?.id || it?._id || `item_${Date.now()}_${idx}`),
    name: String(it?.name || "Special Dish"),
    image: String(it?.image || it?.imageUrl || ""),
    price: Number(it?.price) || 0,
    quantity: Number(it?.quantity) || 1,
    selectedQtyConfig: String(
      it?.selectedQtyConfig || it?.sizeLabel || it?.size || "Standard Serving"
    ),
    isVeg: it?.isVeg !== undefined ? Boolean(it.isVeg) : true,
  }));
};

/* ─────────────────────────────────────────────────────────────────
   ✅ NEW HELPER — Fetch a Cashfree order with automatic retry.

   Why: Right after the user completes payment, Cashfree's servers
   sometimes need a moment to propagate the PAID status. If we call
   GET /orders/:id too quickly, we may see ACTIVE or PENDING even
   though the payment succeeded. We retry up to 3 times with a
   2-second delay, only accepting PAID as the final answer.

   Never throws — always returns { ok, data, attempts }.
   ───────────────────────────────────────────────────────────────── */
const fetchCashfreeOrderWithRetry = async (
  cfOrderId: string,
  maxAttempts = 3,
  delayMs = 2000
): Promise<{ ok: boolean; data: any; attempts: number }> => {
  let lastData: any = null;
  let lastOk = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resp = await fetch(
        `${CASHFREE_BASE_URL}/orders/${cfOrderId}`,
        {
          method: "GET",
          headers: {
            "x-api-version": CASHFREE_API_VERSION,
            "x-client-id": CASHFREE_APP_ID,
            "x-client-secret": CASHFREE_SECRET_KEY,
          },
        }
      );

      const data = await resp.json();
      lastData = data;
      lastOk = resp.ok;

      // Success — even if status isn't PAID yet, we break early if it's
      // a terminal status (PAID, EXPIRED, CANCELLED, FAILED) — no point
      // retrying those. Only retry transient states (ACTIVE, PENDING).
      if (resp.ok) {
        const status = String(data?.order_status || "").toUpperCase();
        const isTerminal =
          status === "PAID" ||
          status === "EXPIRED" ||
          status === "CANCELLED" ||
          status === "TERMINATED";
        if (isTerminal) {
          return { ok: true, data, attempts: attempt };
        }
      }

      // If this was the last attempt, return whatever we have.
      if (attempt === maxAttempts) {
        return { ok: lastOk, data: lastData, attempts: attempt };
      }

      // Wait before retrying.
      console.log(
        `[Cashfree] Order ${cfOrderId} status not final yet (attempt ${attempt}/${maxAttempts}). Retrying in ${delayMs}ms...`
      );
      await new Promise((r) => setTimeout(r, delayMs));
    } catch (err) {
      console.error(
        `[Cashfree] Attempt ${attempt}/${maxAttempts} fetch failed:`,
        err
      );
      if (attempt === maxAttempts) {
        return { ok: false, data: null, attempts: attempt };
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return { ok: lastOk, data: lastData, attempts: maxAttempts };
};

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
 *   2. We ask Cashfree's API directly "what is the status of this order?"
 *      with automatic RETRY if the status is still transient.
 *   3. If Cashfree says order_status === "PAID", we trust it and persist
 *      the order to MongoDB.
 *   4. Replay-protected: if we already saved this cf_order_id, we return
 *      the existing order instead of creating a duplicate.
 *
 * ✅ Auto-verifies the order (isAdvanceVerified: true) and immediately
 *    notifies the assigned chef with the alarm push — applies to BOTH
 *    Mealbox/Catering (45% advance) and Homemade/QuickBites (full
 *    online payment). No admin action needed.
 *
 * ✅ Sanitizes `items` before saving so Homemade/QuickBites orders
 *    never fail schema validation (missing id / name / price / quantity).
 *
 * ✅ Persists `deliveryAddress` on the order document for Homemade /
 *    QuickBites (required on their schema).
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
    //    Retries up to 3 times with 2s delay if the status is transient.
    // ------------------------------------------------------------------
    const cfFetch = await fetchCashfreeOrderWithRetry(cf_order_id, 3, 2000);
    const cfOrder = cfFetch.data;

    if (!cfFetch.ok || !cfOrder) {
      console.error("Cashfree fetch order error after retries:", cfOrder);
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
        attempts: cfFetch.attempts,
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
    // 6. Detect the service type so we can branch field handling.
    //    Homemade/QuickBites have stricter schemas (required items
    //    fields + required deliveryAddress) than Mealbox/Catering.
    // ------------------------------------------------------------------
    const resolvedServiceType = String(orderPayload.serviceType || "mealbox").toLowerCase();
    const isHomemadeOrQuickBites =
      resolvedServiceType === "homemade" ||
      resolvedServiceType === "quickbites";

    // ------------------------------------------------------------------
    // 7. Sanitize items (defense-in-depth). This guarantees that even
    //    if the client forgot to fill in `id`/`quantity`/`name`/`price`,
    //    Mongoose will not throw a ValidationError.
    // ------------------------------------------------------------------
    const sanitizedItems = sanitizeItemsForSchema(orderPayload.items);

    // ------------------------------------------------------------------
    // 8. Persist the verified order.
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
      // ✅ For Homemade/QuickBites, `deliveryAddress` is a required field
      //    on their discriminator schema. We mirror `addressDetails` here
      //    so the document satisfies validation regardless of flow.
      deliveryAddress:
        orderPayload.deliveryAddress ||
        orderPayload.addressDetails ||
        "",
      deliveryDate: orderPayload.deliveryDate || "",
      deliverySlot: orderPayload.deliverySlot || "",
      upcomingDeliveries: Array.isArray(orderPayload.upcomingDeliveries)
        ? orderPayload.upcomingDeliveries
        : [],
      subtotal: Number(orderPayload.subtotal) || 0,
      deliveryPrice: Number(orderPayload.deliveryPrice) || 0,
      discount: Number(orderPayload.discount) || 0,
      appliedCoupon: orderPayload.appliedCoupon || "",
      totalAmount: Number(orderPayload.totalAmount) || 0,

      // Payment flags — Cashfree is the source of truth here
      paymentMethod: orderPayload.paymentMethod || "online",
      paymentStatus: "Paid",
      orderStatus: "Placed",

      // ==================== CASHFREE FIELDS ====================
      cashfreeOrderId: cf_order_id,
      cashfreePaymentId: cfPaymentId,
      paymentCaptured: true,
      paidAt: new Date(),
      // ========================================================

      // ✅ Auto-verify since Cashfree already confirmed the payment.
      //    Admin no longer needs to tap "Payment Received".
      isAdvanceVerified: true,

      // Advance/balance split.
      //  • Mealbox/Catering: 45% advance, 55% balance (fallback math)
      //  • Homemade/QuickBites online: full amount paid (advance=total, balance=0)
      //  • Homemade/QuickBites COD: not routed through this endpoint
      advancePaidAmount:
        Number(orderPayload.advancePaidAmount) ||
        (isHomemadeOrQuickBites
          ? Number(orderPayload.totalAmount) || 0
          : Math.round((Number(orderPayload.totalAmount) || 0) * 0.45 * 100) / 100),
      balanceAmountToCollect:
        Number(orderPayload.balanceAmountToCollect) ||
        (isHomemadeOrQuickBites
          ? 0
          : Math.round(
              ((Number(orderPayload.totalAmount) || 0) -
                (Number(orderPayload.advancePaidAmount) ||
                  (Number(orderPayload.totalAmount) || 0) * 0.45)) *
                100
            ) / 100),

      // ✅ Use the sanitized items array (guaranteed schema-compliant).
      items: sanitizedItems,

      selections: orderPayload.selections || null,

      // ✅ Homemade/QuickBites-specific fields
      isQuickBites: orderPayload.isQuickBites === "true" || orderPayload.isQuickBites === true,
      estimatedDeliveryAt: orderPayload.estimatedDeliveryAtMs
        ? new Date(Number(orderPayload.estimatedDeliveryAtMs))
        : undefined,
      deliveryWindowMinutes: Number(orderPayload.deliveryWindowMinutes) || 0,

      // ✅ Geo coordinates
      latitude: orderPayload.latitude !== undefined ? Number(orderPayload.latitude) : undefined,
      longitude: orderPayload.longitude !== undefined ? Number(orderPayload.longitude) : undefined,
    });

    const savedOrder = await newOrder.save();

    // ------------------------------------------------------------------
    // 9. ✅ Auto-notify the chef + customer + admin the moment the
    //    payment is confirmed. No admin tap required.
    // ------------------------------------------------------------------
    try {
      // ---- Socket emits (identical shape to verifyAdvancePayment) ----
      io.emit("advance_payment_verified", savedOrder);
      io.emit("order_updated", savedOrder);
      io.emit("new_order_placed", savedOrder);

      if (savedOrder.userId) {
        io.to(String(savedOrder.userId)).emit("advance_payment_verified", savedOrder);
        io.to(String(savedOrder.userId)).emit("order_updated", savedOrder);
        io.to(String(savedOrder.userId)).emit("new_order_placed", savedOrder);
      }

      // ---- Resolve the assigned chef's user document for push ----
      const chefIdentifier = savedOrder.chefId;
      let chefUserDoc: any = null;
      let resolvedChefUserId: string | null = null;

      if (chefIdentifier && mongoose.Types.ObjectId.isValid(chefIdentifier)) {
        const chefDoc = await Chef.findById(chefIdentifier);
        if (chefDoc?.user) {
          chefUserDoc = await User.findById(chefDoc.user);
          resolvedChefUserId = String(chefDoc.user);
          io.to(String(chefDoc.user)).emit("new_chef_order", savedOrder);
          io.to(String(chefDoc.user)).emit("order_updated", savedOrder);
        }
      }
      if (!chefUserDoc && savedOrder.chefName) {
        const chefDoc = await Chef.findOne({ name: savedOrder.chefName });
        if (chefDoc?.user) {
          chefUserDoc = await User.findById(chefDoc.user);
          resolvedChefUserId = String(chefDoc.user);
          io.to(String(chefDoc.user)).emit("new_chef_order", savedOrder);
          io.to(String(chefDoc.user)).emit("order_updated", savedOrder);
        }
      }
      if (chefIdentifier) {
        io.to(String(chefIdentifier)).emit("new_chef_order", savedOrder);
        io.to(String(chefIdentifier)).emit("order_updated", savedOrder);
      }

      // ---- Chef alarm push (identical config to verifyAdvancePayment) ----
      if (chefUserDoc?.pushToken && isValidExpoToken(chefUserDoc.pushToken)) {
        try {
          await sendExpoPush({
            token: String(chefUserDoc.pushToken),
            title: `🔔 New Verified Order ${savedOrder.orderId}`,
            body: `${savedOrder.userName || "Customer"} → ₹${savedOrder.totalAmount}. Tap to accept now!`,
            data: {
              orderId: savedOrder.orderId,
              screen: "chef-orders",
              role: "chef",
              chefId: resolvedChefUserId || String(chefUserDoc._id || ""),
            },
            sound: ORDER_ALARM_SOUND,
            channelId: CHEF_ORDER_CHANNEL_ID,
            priority: "max",
            vibrate: [0, 600, 300, 600, 300],
          });
          console.log(
            `[verifyPaymentAndCreateOrder] Chef alarm push sent for order ${savedOrder.orderId}`
          );
        } catch (chefPushErr) {
          console.log("Chef alarm push error:", chefPushErr);
        }
      }

      // ---- Customer confirmation push (default sound, not alarm) ----
      if (savedOrder.userId && mongoose.Types.ObjectId.isValid(savedOrder.userId)) {
        try {
          const customerDoc = await User.findById(savedOrder.userId);
          if (customerDoc?.pushToken && isValidExpoToken(customerDoc.pushToken)) {
            await sendExpoPush({
              token: String(customerDoc.pushToken),
              title: "Payment Verified! 🎉",
              body: `Your payment for order #${savedOrder.orderId} has been confirmed. We're preparing your order now.`,
              data: {
                orderId: savedOrder.orderId,
                screen: "orders",
                role: "customer",
              },
              sound: "default",
              priority: "high",
            });
          }
        } catch (customerPushErr) {
          console.log("Customer confirmation push error:", customerPushErr);
        }
      }
    } catch (notifyErr) {
      // Notifications are best-effort — never block the payment response.
      console.log("Post-payment notification error:", notifyErr);
    }

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