import { Request, Response } from "express";
import Razorpay from "razorpay";
import crypto from "crypto";
import Order from "../models/Orders";
import User from "../models/User";
import Chef from "../models/Chef";
import { io } from "..";
import {
  sendExpoPush,
  isValidExpoToken,
  ORDER_ALARM_SOUND,
  CHEF_ORDER_CHANNEL_ID,
} from "../utils/expoPush";

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

/**
 * POST /api/payments/create-order
 * Body: { orderId: string }
 * Creates a Razorpay order for the FULL amount already saved in MongoDB.
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

    const amountInPaise = Math.round(Number(order.totalAmount) * 100);
    if (!Number.isSafeInteger(amountInPaise) || amountInPaise <= 0) {
      return res.status(400).json({ success: false, message: "The stored KatBox order total is invalid." });
    }

    const razorpayOrder = await razorpayInstance.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `kb_${String(order.orderId).replace(/[^a-zA-Z0-9]/g, "").slice(-20)}_${Date.now().toString().slice(-6)}`.slice(0, 40),
      notes: {
        katboxOrderId: String(order.orderId),
        serviceType: String(order.serviceType || ""),
        paymentPurpose: "full_order_payment",
      },
    });

    order.razorpayOrderId = razorpayOrder.id;
    order.paymentStatus = "Payment Pending";
    order.paymentCaptured = false;
    order.advancePaidAmount = 0;
    order.balanceAmountToCollect = Number(order.totalAmount);
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
 * Verifies the signature and confirms the captured FULL payment. It updates
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
      return res.status(200).json({ success: true, message: "Payment was already verified.", order });
    }

    const expectedPaise = Math.round(Number(order.totalAmount) * 100);
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
    order.paymentMethod = String(payment.method || order.paymentMethod || "razorpay").toLowerCase();
    order.paymentStatus = "Paid";
    order.paymentCaptured = true;
    order.isAdvanceVerified = true;
    order.advancePaidAmount = Number(order.totalAmount);
    order.balanceAmountToCollect = 0;
    order.razorpayOrderId = razorpayOrderId;
    order.razorpayPaymentId = razorpayPaymentId;
    order.razorpaySignature = razorpaySignature;
    order.paidAt = paidAt;
    order.statusTimeline = Array.isArray(order.statusTimeline) ? order.statusTimeline : [];
    order.statusTimeline.push({
      status: "Payment Received",
      timestamp: paidAt,
      note: `Full payment of ₹${order.totalAmount} verified by Razorpay (${razorpayPaymentId}).`,
    });
    const updatedOrder = await order.save();

    // Notify customer, admin listeners and the assigned chef only after the
    // backend has verified that Razorpay captured the complete amount.
    try {
      io.emit("order_updated", updatedOrder);
      io.emit("payment_verified", updatedOrder);
      if (order.userId) {
        io.to(String(order.userId)).emit("order_updated", updatedOrder);
        io.to(String(order.userId)).emit("payment_verified", updatedOrder);
      }

      let chefUser: any = null;
      let chefUserId = "";
      const chefIdentifier = String(order.chefId || "");
      if (chefIdentifier) {
        if (/^[a-fA-F0-9]{24}$/.test(chefIdentifier)) {
          const chefDoc: any = await Chef.findById(chefIdentifier);
          if (chefDoc?.user) {
            chefUserId = String(chefDoc.user);
            chefUser = await User.findById(chefDoc.user);
          }
        }
        if (!chefUser && chefIdentifier) {
          const chefDoc: any = await Chef.findOne({ user: chefIdentifier });
          if (chefDoc?.user) {
            chefUserId = String(chefDoc.user);
            chefUser = await User.findById(chefDoc.user);
          }
        }
      }
      if (!chefUser && order.chefName) {
        const chefDoc: any = await Chef.findOne({ name: order.chefName });
        if (chefDoc?.user) {
          chefUserId = String(chefDoc.user);
          chefUser = await User.findById(chefDoc.user);
        }
      }

      if (chefUserId) {
        io.to(chefUserId).emit("new_chef_order", updatedOrder);
        io.to(chefUserId).emit("order_updated", updatedOrder);
      }
      if (chefIdentifier) {
        io.to(chefIdentifier).emit("new_chef_order", updatedOrder);
        io.to(chefIdentifier).emit("order_updated", updatedOrder);
      }
      if (chefUser?.pushToken && isValidExpoToken(chefUser.pushToken)) {
        await sendExpoPush({
          token: String(chefUser.pushToken),
          title: `🔔 New Paid Order ${order.orderId}`,
          body: `${order.userName || "Customer"} placed a paid order of ₹${order.totalAmount}. Tap to accept now!`,
          data: {
            orderId: order.orderId,
            screen: "chef-orders",
            role: "chef",
            chefId: chefUserId || chefIdentifier,
          },
          sound: ORDER_ALARM_SOUND,
          channelId: CHEF_ORDER_CHANNEL_ID,
          priority: "max",
          vibrate: [0, 600, 300, 600, 300],
        });
      }
    } catch (notifyError) {
      // Payment is already persisted. Notification failure must not reverse it.
      console.error("Razorpay verified but order notification failed:", notifyError);
    }

    return res.status(200).json({ success: true, message: "Full Razorpay payment verified.", order: updatedOrder });
  } catch (error: any) {
    console.error("Error verifying Razorpay payment:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to verify Razorpay payment. Please check the order status before retrying.",
    });
  }
};
