import { Request, Response } from "express";
import Razorpay from "razorpay";
import crypto from "crypto";
import Order from "../models/Orders";
import User from "../models/User";
import Chef from "../models/Chef";
import { io } from "..";
import {
  ORDER_ALARM_SOUND,
  ADMIN_ORDER_CHANNEL_ID,
  CHEF_ORDER_CHANNEL_ID,
} from "../utils/expoPush";
import { queueOrderNotification } from "../utils/orderNotifications";

interface AuthRequest extends Request {
  user?: {
    userId?: string;
    _id?: string;
    id?: string;
    [key: string]: any;
  };
}

const keyId = process.env.RAZORPAY_KEY_ID || "";
const keySecret = process.env.RAZORPAY_KEY_SECRET || "";

const razorpayInstance = keyId && keySecret
  ? new Razorpay({ key_id: keyId, key_secret: keySecret })
  : null;

const safeStringEqual = (left: string, right: string): boolean => {
  if (!/^[a-fA-F0-9]{64}$/.test(left) || !/^[a-fA-F0-9]{64}$/.test(right)) return false;
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const verifySignature = (orderId: string, paymentId: string, signature: string): boolean => {
  if (!keySecret || !orderId || !paymentId || !signature) return false;
  const expected = crypto.createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return safeStringEqual(expected, signature);
};

const dispatchVerifiedPaymentNotifications = async (order: any, paidAmount: number): Promise<void> => {
  io.emit("order_updated", order);
  io.emit("payment_verified", order);
  if (order.userId) {
    io.to(String(order.userId)).emit("order_updated", order);
    io.to(String(order.userId)).emit("payment_verified", order);
  }

  let chefUserId = "";
  const chefIdentifier = String(order.chefId || "");
  let chefDoc: any = null;
  if (chefIdentifier && /^[a-fA-F0-9]{24}$/.test(chefIdentifier)) {
    chefDoc = await Chef.findById(chefIdentifier);
  }
  if (!chefDoc && chefIdentifier) chefDoc = await Chef.findOne({ user: chefIdentifier });
  if (!chefDoc && order.chefName) chefDoc = await Chef.findOne({ name: order.chefName });
  if (chefDoc?.user) chefUserId = String(chefDoc.user);

  if (chefUserId) {
    io.to(chefUserId).emit("new_chef_order", order);
    io.to(chefUserId).emit("order_updated", order);
    await queueOrderNotification({
      orderId: String(order.orderId),
      eventType: "razorpay_captured_chef_alarm",
      recipientUserId: chefUserId,
      recipientRole: "chef",
      payload: {
        title: `🔔 New Paid Order ${order.orderId}`,
        body: `${order.userName || "Customer"} paid ₹${paidAmount} ${Number(order.balanceAmountToCollect || 0) > 0 ? "advance" : "in full"} for an order of ₹${order.totalAmount}. Tap to accept now!`,
        data: { orderId: order.orderId, screen: "chef-orders", role: "chef", chefId: chefUserId },
        sound: ORDER_ALARM_SOUND,
        channelId: CHEF_ORDER_CHANNEL_ID,
        priority: "high",
      },
    });
  }
  if (chefIdentifier) {
    io.to(chefIdentifier).emit("new_chef_order", order);
    io.to(chefIdentifier).emit("order_updated", order);
  }

  const admins = await User.find({ isAdmin: true }).select("_id");
  for (const admin of admins) {
    await queueOrderNotification({
      orderId: String(order.orderId),
      eventType: "razorpay_captured_admin_alarm",
      recipientUserId: String(admin._id),
      recipientRole: "admin",
      payload: {
        title: `🚨 New Paid Order ${order.orderId}`,
        body: `${order.userName || "A customer"} paid ₹${paidAmount} for an order of ₹${order.totalAmount}. Tap to review.`,
        data: { orderId: order.orderId, screen: "admin-orders", role: "admin" },
        sound: ORDER_ALARM_SOUND,
        channelId: ADMIN_ORDER_CHANNEL_ID,
        priority: "high",
      },
    });
  }

  if (order.userId) {
    await queueOrderNotification({
      orderId: String(order.orderId),
      eventType: "razorpay_captured_customer_confirmation",
      recipientUserId: String(order.userId),
      recipientRole: "customer",
      payload: {
        title: "Payment successful 🎉",
        body: `Your KatBox order #${order.orderId} has been confirmed.`,
        data: { orderId: order.orderId, screen: "orders", role: "customer" },
        sound: "default",
        priority: "high",
      },
    });
  }
};



/**
 * POST /api/payments/create-order
 * Body: { orderId: string }
 * Creates a Razorpay order for the advance or full amount already saved in MongoDB.
 * The amount is never accepted from the client.
 */
export const createPaymentOrder = async (req: AuthRequest, res: Response) => {
  try {
    if (!razorpayInstance || !keyId || !keySecret) {
      return res.status(503).json({ success: false, message: "Razorpay is not configured on the server." });
    }

    const orderId = String(req.body?.orderId || "").trim();
    if (!orderId) {
      return res.status(400).json({ success: false, message: "KatBox orderId is required." });
    }

    const order: any = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: "KatBox order was not found." });
    }
    const authenticatedUserId = String(req.user?.userId || req.user?._id || req.user?.id || "");
    if (!authenticatedUserId || String(order.userId || "") !== authenticatedUserId) {
      return res.status(403).json({ success: false, message: "You are not allowed to initiate payment for this order." });
    }

    if (order.paymentCaptured === true || String(order.paymentStatus || "").toLowerCase() === "paid") {
      return res.status(409).json({ success: false, message: "This KatBox order is already paid." });
    }
    if (["cod", "cash", "cash_on_delivery"].includes(String(order.paymentMethod || "").toLowerCase())) {
      return res.status(400).json({ success: false, message: "COD orders cannot be paid through Razorpay." });
    }

    const amountToPay = Number(order.advancePaidAmount ?? order.totalAmount);
    const amountInPaise = Math.round(amountToPay * 100);
    if (!Number.isSafeInteger(amountInPaise) || amountInPaise <= 0) {
      return res.status(400).json({ success: false, message: "The stored KatBox order total is invalid." });
    }

    let razorpayOrder: any = null;
    if (order.razorpayOrderId) {
      try {
        const existingGatewayOrder = await razorpayInstance.orders.fetch(String(order.razorpayOrderId));
        if (
          Number(existingGatewayOrder.amount) === amountInPaise &&
          String(existingGatewayOrder.currency || "").toUpperCase() === "INR"
        ) razorpayOrder = existingGatewayOrder;
      } catch {
        // If the stored gateway order cannot be fetched, create a fresh one.
      }
    }
    if (!razorpayOrder) {
      razorpayOrder = await razorpayInstance.orders.create({
        amount: amountInPaise,
        currency: "INR",
        receipt: `kb_${String(order.orderId).replace(/[^a-zA-Z0-9]/g, "").slice(-20)}_${Date.now().toString().slice(-6)}`.slice(0, 40),
        notes: {
          katboxOrderId: String(order.orderId),
          serviceType: String(order.serviceType || ""),
          paymentPurpose: Number(order.balanceAmountToCollect || 0) > 0 ? "40_percent_advance" : "full_order_payment",
        },
      });
    }

    order.razorpayOrderId = razorpayOrder.id;
    order.paymentStatus = "Payment Pending";
    order.paymentCaptured = false;
    // Keep the amount split calculated by the authenticated order-creation flow.
    order.advancePaidAmount = amountToPay;
    order.balanceAmountToCollect = Math.max(0, Number(order.totalAmount) - amountToPay);
    await order.save();

    return res.status(200).json({
      success: true,
      keyId,
      orderId: order.orderId,
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
    });
  } catch (error: any) {
    console.error("Error creating Razorpay payment order:", error);
    return res.status(500).json({ success: false, message: "Failed to initialize Razorpay checkout." });
  }
};

/**
 * POST /api/payments/verify
 * Body: { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature }
 * Verifies the signature and confirms the exact advance or full amount. It updates
 * the existing MongoDB order; it never creates a duplicate order document.
 */
export const verifyPaymentAndCreateOrder = async (req: AuthRequest, res: Response) => {
  try {
    if (!razorpayInstance || !keySecret) {
      return res.status(503).json({ success: false, message: "Razorpay is not configured on the server." });
    }

    const orderId = String(req.body?.orderId || "").trim();
    const razorpayOrderId = String(req.body?.razorpay_order_id || "").trim();
    const razorpayPaymentId = String(req.body?.razorpay_payment_id || "").trim();
    const razorpaySignature = String(req.body?.razorpay_signature || "").trim();

    if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({ success: false, message: "Missing KatBox orderId or Razorpay verification fields." });
    }

    const order: any = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: "KatBox order was not found." });
    }
    const authenticatedUserId = String(req.user?.userId || req.user?._id || req.user?.id || "");
    if (!authenticatedUserId || String(order.userId || "") !== authenticatedUserId) {
      return res.status(403).json({ success: false, message: "You are not allowed to verify payment for this order." });
    }

    if (String(order.razorpayOrderId || "") !== razorpayOrderId) {
      return res.status(400).json({ success: false, message: "Razorpay order does not match this KatBox order." });
    }

    if (!verifySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
      return res.status(400).json({ success: false, message: "Razorpay signature verification failed." });
    }

    // Idempotency: safe retry after a client/network timeout.
    if (String(order.razorpayPaymentId || "") === razorpayPaymentId && order.paymentCaptured === true) {
      setImmediate(() => {
        void dispatchVerifiedPaymentNotifications(order, Number(order.advancePaidAmount || order.totalAmount))
          .catch((error) => console.error("Payment notification outbox retry failed:", error));
      });
      return res.status(200).json({ success: true, message: "Payment was already verified.", order });
    }

    const expectedPaymentAmount = Number(order.advancePaidAmount ?? order.totalAmount);
    const expectedPaise = Math.round(expectedPaymentAmount * 100);
    if (!Number.isSafeInteger(expectedPaise) || expectedPaise <= 0) {
      return res.status(400).json({ success: false, message: "The stored KatBox order total is invalid." });
    }

    let payment: any = await razorpayInstance.payments.fetch(razorpayPaymentId);
    if (
      String(payment?.order_id || "") !== razorpayOrderId ||
      Number(payment?.amount) !== expectedPaise ||
      String(payment?.currency || "").toUpperCase() !== "INR"
    ) {
      return res.status(400).json({ success: false, message: "Razorpay payment order, amount or currency does not match." });
    }

    // If automatic capture is disabled on the Razorpay account, capture an
    // authorized payment here and re-fetch it before confirming the order.
    if (String(payment?.status || "").toLowerCase() === "authorized") {
      payment = await razorpayInstance.payments.capture(razorpayPaymentId, expectedPaise, "INR");
    }

    if (String(payment?.status || "").toLowerCase() !== "captured") {
      return res.status(409).json({
        success: false,
        message: "Payment has not been captured by Razorpay yet. The KatBox order remains pending.",
      });
    }

    const paidAt = new Date();
    const updatedOrder: any = await Order.findOneAndUpdate(
      { _id: order._id, razorpayOrderId, paymentCaptured: { $ne: true } },
      {
        $set: {
          paymentMethod: String(payment.method || order.paymentMethod || "razorpay").toLowerCase(),
          paymentStatus: "Paid",
          paymentCaptured: true,
          isAdvanceVerified: true,
          advancePaidAmount: expectedPaymentAmount,
          balanceAmountToCollect: Math.max(0, Math.round((Number(order.totalAmount) - expectedPaymentAmount) * 100) / 100),
          razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature,
          paidAt,
        },
        $push: {
          statusTimeline: {
            status: "Payment Received",
            timestamp: paidAt,
            note: `${Number(order.balanceAmountToCollect || 0) > 0 ? "Advance" : "Full payment"} of ₹${expectedPaymentAmount} verified by Razorpay (${razorpayPaymentId}).`,
          },
        },
      },
      { new: true }
    );

    if (!updatedOrder) {
      const currentOrder: any = await Order.findById(order._id);
      if (currentOrder?.paymentCaptured === true && String(currentOrder.razorpayPaymentId || "") === razorpayPaymentId) {
        setImmediate(() => {
          void dispatchVerifiedPaymentNotifications(currentOrder, expectedPaymentAmount)
            .catch((error) => console.error("Payment notification outbox retry failed:", error));
        });
        return res.status(200).json({ success: true, message: "Payment was already verified.", order: currentOrder });
      }
      return res.status(409).json({ success: false, message: "Payment state changed concurrently. Please refresh the order status." });
    }

    // Persisted payment state is authoritative. Notifications are queued in a
    // database-backed outbox so provider failures/restarts do not lose alerts.
    setImmediate(() => {
      void dispatchVerifiedPaymentNotifications(updatedOrder, expectedPaymentAmount)
        .catch((notifyError) => console.error("Razorpay verified but notification enqueue failed:", notifyError));
    });

    return res.status(200).json({ success: true, message: "Razorpay payment verified.", order: updatedOrder });
  } catch (error: any) {
    console.error("Error verifying Razorpay payment:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to verify Razorpay payment. Please check the order status before retrying.",
    });
  }
};

/**
 * Razorpay webhook: the raw request body is required for HMAC verification.
 * Configure the webhook secret separately from the API key secret in Render.
 */
export const handleRazorpayWebhook = async (req: Request, res: Response) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "";
    const signatureHeader = String(req.headers["x-razorpay-signature"] || "");
    const rawBody = Buffer.isBuffer(req.body) ? req.body : null;
    if (!webhookSecret || !rawBody || !signatureHeader) {
      return res.status(400).json({ success: false, message: "Invalid webhook configuration or payload." });
    }

    const expectedSignature = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
    if (!safeStringEqual(expectedSignature, signatureHeader)) {
      return res.status(400).json({ success: false, message: "Webhook signature verification failed." });
    }

    const event = JSON.parse(rawBody.toString("utf8"));
    if (event?.event !== "payment.captured" && event?.event !== "order.paid") {
      return res.status(200).json({ success: true, ignored: true });
    }

    const payment = event?.payload?.payment?.entity;
    if (!payment || String(payment.status || "").toLowerCase() !== "captured") {
      return res.status(200).json({ success: true, ignored: true });
    }

    const razorpayOrderId = String(payment.order_id || "");
    const razorpayPaymentId = String(payment.id || "");
    if (!razorpayOrderId || !razorpayPaymentId) {
      return res.status(400).json({ success: false, message: "Webhook payment reference is incomplete." });
    }

    const order: any = await Order.findOne({ razorpayOrderId });
    if (!order) {
      // A 404 encourages Razorpay to retry if the webhook arrived before the
      // KatBox order-to-Razorpay association became visible.
      return res.status(404).json({ success: false, message: "KatBox order not found for Razorpay payment." });
    }

    const expectedPaise = Math.round(Number(order.advancePaidAmount ?? order.totalAmount) * 100);
    if (
      Number(payment.amount) !== expectedPaise ||
      String(payment.currency || "").toUpperCase() !== "INR" ||
      !Number.isSafeInteger(expectedPaise) || expectedPaise <= 0
    ) {
      return res.status(400).json({ success: false, message: "Webhook payment amount or currency does not match the KatBox order." });
    }

    if (order.paymentCaptured === true) {
      if (String(order.razorpayPaymentId || "") !== razorpayPaymentId) {
        return res.status(409).json({ success: false, message: "A different payment is already associated with this order." });
      }
      setImmediate(() => {
        void dispatchVerifiedPaymentNotifications(order, Number(order.advancePaidAmount || order.totalAmount))
          .catch((error) => console.error("Razorpay webhook notification enqueue retry failed:", error));
      });
      return res.status(200).json({ success: true, alreadyProcessed: true });
    }

    const paidAt = payment.created_at ? new Date(Number(payment.created_at) * 1000) : new Date();
    const update: any = await Order.findOneAndUpdate(
      { _id: order._id, razorpayOrderId, paymentCaptured: { $ne: true } },
      {
        $set: {
          paymentMethod: String(payment.method || "razorpay").toLowerCase(),
          paymentStatus: "Paid",
          paymentCaptured: true,
          isAdvanceVerified: true,
          razorpayPaymentId,
          paidAt,
          balanceAmountToCollect: Math.max(0, Math.round((Number(order.totalAmount) - Number(order.advancePaidAmount || 0)) * 100) / 100),
        },
        $push: {
          statusTimeline: {
            status: "Payment Received",
            timestamp: paidAt,
            note: `Razorpay captured payment of ₹${Number(payment.amount) / 100}.`,
          },
        },
      },
      { new: true }
    );

    const persistedOrder = update || await Order.findById(order._id);
    if (!persistedOrder || persistedOrder.paymentCaptured !== true || String(persistedOrder.razorpayPaymentId || "") !== razorpayPaymentId) {
      return res.status(409).json({ success: false, message: "Payment state changed concurrently; retry webhook." });
    }

    setImmediate(() => {
      void dispatchVerifiedPaymentNotifications(persistedOrder, Number(persistedOrder.advancePaidAmount || persistedOrder.totalAmount))
        .catch((error) => console.error("Razorpay webhook notification enqueue failed:", error));
    });

    return res.status(200).json({ success: true, processed: true });
  } catch (error) {
    console.error("Razorpay webhook processing error:", error instanceof Error ? error.message : "unknown error");
    return res.status(500).json({ success: false, message: "Webhook processing failed." });
  }
};

