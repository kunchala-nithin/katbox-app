import { Request, Response } from "express";
import Razorpay from "razorpay";
import crypto from "crypto";
import Order from "../models/Orders";

const keyId = process.env.RAZORPAY_KEY_ID || "";
const keySecret = process.env.RAZORPAY_KEY_SECRET || "";

const razorpayInstance =
  keyId && keySecret
    ? new Razorpay({ key_id: keyId, key_secret: keySecret })
    : null;

const expectedAdvancePaise = (order: any): number => {
  const total = Number(order?.totalAmount);
  if (!Number.isFinite(total) || total <= 0) return 0;
  const expectedPaise = Math.round(total * 0.4 * 100);
  const storedAdvancePaise = Math.round(Number(order?.advancePaidAmount || 0) * 100);
  return storedAdvancePaise === expectedPaise ? storedAdvancePaise : expectedPaise;
};

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

/**
 * POST /api/payments/create-order
 * Creates a Razorpay order for the 40% advance of an existing KatBox order.
 * The payable amount is derived from MongoDB, never from client-supplied amount.
 */
export const createPaymentOrder = async (req: Request, res: Response) => {
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

    if (order.paymentCaptured === true || String(order.paymentStatus || "").toLowerCase().includes("paid")) {
      return res.status(409).json({ success: false, message: "This KatBox order already has a recorded payment." });
    }

    const amountInPaise = expectedAdvancePaise(order);
    if (amountInPaise <= 0) {
      return res.status(400).json({ success: false, message: "The stored KatBox order total is invalid." });
    }

    const razorpayOrder = await razorpayInstance.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `kb_${String(order.orderId).replace(/[^a-zA-Z0-9]/g, "").slice(-16)}_${Date.now().toString().slice(-6)}`.slice(0, 40),
      notes: { katboxOrderId: String(order.orderId), paymentPurpose: "40_percent_advance" },
    });

    order.razorpayOrderId = razorpayOrder.id;
    order.paymentMethod = "razorpay";
    order.paymentStatus = "Verification Pending";
    order.paymentCaptured = false;
    order.advancePaidAmount = amountInPaise / 100;
    order.balanceAmountToCollect = Math.round((Number(order.totalAmount) - amountInPaise / 100) * 100) / 100;
    await order.save();

    return res.status(200).json({
      success: true,
      keyId,
      orderId: order.orderId,
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      advanceAmount: amountInPaise / 100,
      balanceAmountToCollect: order.balanceAmountToCollect,
    });
  } catch (error: any) {
    console.error("Error creating Razorpay payment order:", error);
    return res.status(500).json({ success: false, message: "Failed to initialize Razorpay checkout." });
  }
};

/**
 * POST /api/payments/verify
 * Verifies the signature and fetches payment details from Razorpay, then updates
 * the already-created KatBox order. This never creates a second order document.
 */
export const verifyPaymentAndCreateOrder = async (req: Request, res: Response) => {
  try {
    if (!razorpayInstance || !keySecret) {
      return res.status(503).json({ success: false, message: "Razorpay is not configured on the server." });
    }

    const orderId = String(req.body?.orderId || "").trim();
    const razorpayOrderId = String(req.body?.razorpay_order_id || "").trim();
    const razorpayPaymentId = String(req.body?.razorpay_payment_id || "").trim();
    const razorpaySignature = String(req.body?.razorpay_signature || "").trim();

    if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({ success: false, message: "Missing orderId or Razorpay verification fields." });
    }

    const order: any = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: "KatBox order was not found." });
    }

    if (String(order.razorpayOrderId || "") !== razorpayOrderId) {
      return res.status(400).json({ success: false, message: "Razorpay order does not match this KatBox order." });
    }

    if (String(order.razorpayPaymentId || "") === razorpayPaymentId && order.paymentStatus === "Advance Paid (Gateway Verified)") {
      return res.status(200).json({ success: true, message: "Payment was already verified.", order });
    }

    if (!verifySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
      return res.status(400).json({ success: false, message: "Razorpay signature verification failed." });
    }

    const payment: any = await razorpayInstance.payments.fetch(razorpayPaymentId);
    const expectedPaise = expectedAdvancePaise(order);
    if (
      String(payment?.order_id || "") !== razorpayOrderId ||
      Number(payment?.amount) !== expectedPaise ||
      String(payment?.currency || "").toUpperCase() !== "INR" ||
      String(payment?.status || "").toLowerCase() !== "captured"
    ) {
      return res.status(400).json({
        success: false,
        message: "Razorpay payment is not captured or its order/amount does not match.",
      });
    }

    order.paymentMethod = "razorpay";
    order.paymentStatus = "Advance Paid (Gateway Verified)";
    // Only the 40% advance is paid; the remaining balance is still due.
    order.paymentCaptured = false;
    order.razorpayOrderId = razorpayOrderId;
    order.razorpayPaymentId = razorpayPaymentId;
    order.razorpaySignature = razorpaySignature;
    order.advancePaidAmount = expectedPaise / 100;
    order.balanceAmountToCollect = Math.round((Number(order.totalAmount) - expectedPaise / 100) * 100) / 100;
    order.paidAt = new Date();
    order.isAdvanceVerified = true;
    await order.save();

    return res.status(200).json({ success: true, message: "Razorpay advance payment verified.", order });
  } catch (error: any) {
    console.error("Error verifying Razorpay payment:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to verify Razorpay payment. Please check the order status before retrying.",
    });
  }
};
