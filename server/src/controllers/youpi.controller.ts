import { Request, Response } from "express";
import crypto from "crypto";
import Order from "../models/Orders";
import { AuthRequest } from "../middleware/auth.middleware";

const gatewayBaseUrl = (process.env.YOUPI_API_URL || "").replace(/\/+$/, "");
const merchantId = process.env.YOUPI_MERCHANT_ID || "";
const webhookSecret = process.env.YOUPI_WEBHOOK_SECRET || "";

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/**
 * Create a YouPI hosted checkout session for an order already stored in KatBox.
 * The order's total is read from MongoDB; the client cannot set the gateway amount.
 * POST /api/payments/youpi/create { orderId }
 */
export const createYoupiPayment = async (req: AuthRequest, res: Response) => {
  try {
    if (!gatewayBaseUrl || !merchantId) {
      return res.status(503).json({ success: false, message: "YouPI is not configured on this server." });
    }

    const orderId = String(req.body?.orderId || "").trim();
    if (!orderId) return res.status(400).json({ success: false, message: "orderId is required." });

    const order = await Order.findOne({ orderId });
    if (!order) return res.status(404).json({ success: false, message: "KatBox order not found." });
    if (!req.user?.userId || String(order.userId || "") !== String(req.user.userId)) {
      return res.status(403).json({ success: false, message: "You cannot start payment for this order." });
    }

    if (order.paymentCaptured || String(order.paymentStatus).toLowerCase() === "paid") {
      return res.status(409).json({ success: false, message: "This order is already paid." });
    }

    const amount = Number(order.totalAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: "Stored order amount is invalid." });
    }

    const response = await fetch(`${gatewayBaseUrl}/api/v1/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Merchant-Id": merchantId,
      },
      body: JSON.stringify({
        orderId: order.orderId,
        amount: amount.toFixed(2),
        currency: "INR",
        returnUrl: process.env.YOUPI_RETURN_URL || "katbox://payment-result",
        metadata: { katboxOrderId: order.orderId, serviceType: order.serviceType },
      }),
    });

    const payload: any = await response.json().catch(() => ({}));
    if (!response.ok || !payload.checkoutUrl) {
      console.error("YouPI create-payment failed", response.status, payload);
      return res.status(502).json({ success: false, message: "YouPI could not create a checkout session." });
    }

    order.paymentMethod = "youpi-upi";
    order.paymentStatus = "Verification Pending";
    (order as any).youpiPaymentId = String(payload.paymentId || "");
    await order.save();

    return res.status(200).json({
      success: true,
      orderId: order.orderId,
      amount: amount.toFixed(2),
      checkoutUrl: payload.checkoutUrl,
      paymentId: payload.paymentId || "",
      status: payload.status || "ACTIVE",
    });
  } catch (error: any) {
    console.error("YouPI checkout initialization failed", error);
    return res.status(500).json({ success: false, message: "Unable to initialize YouPI checkout." });
  }
};

/** Status endpoint for UI refresh only. Payment truth is set by the signed webhook. */
export const getYoupiPaymentStatus = async (req: AuthRequest, res: Response) => {
  try {
    const order = await Order.findOne({ orderId: String(req.params.orderId || "") }).select(
      "orderId paymentMethod paymentStatus paymentCaptured paidAt utrNumber totalAmount"
    );
    if (!order) return res.status(404).json({ success: false, message: "Order not found." });
    if (!req.user?.userId || String(order.userId || "") !== String(req.user.userId)) {
      return res.status(403).json({ success: false, message: "You cannot view this order payment status." });
    }
    return res.json({
      success: true,
      orderId: order.orderId,
      paymentStatus: order.paymentStatus,
      paymentCaptured: Boolean(order.paymentCaptured),
      paidAt: order.paidAt || null,
      utrNumber: order.utrNumber || "",
      totalAmount: order.totalAmount,
    });
  } catch (error) {
    console.error("YouPI status lookup failed", error);
    return res.status(500).json({ success: false, message: "Unable to read payment status." });
  }
};

/**
 * YouPI webhook. Mount with express.raw() BEFORE express.json().
 * Only signed UPI success events may mark an order paid; COD success events are not payment.
 */
export const receiveYoupiWebhook = async (req: Request, res: Response) => {
  try {
    if (!webhookSecret) return res.status(503).json({ received: false, message: "Webhook is not configured." });
    if (!Buffer.isBuffer(req.body)) return res.status(400).json({ received: false, message: "Raw request body required." });

    const rawBody = req.body as Buffer;
    const signatureHeader = String(req.header("X-Gateway-Signature") || "");
    const expected = `sha256=${crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex")}`;
    if (!constantTimeEqual(signatureHeader, expected)) {
      return res.status(401).json({ received: false, message: "Invalid webhook signature." });
    }

    const deliveryId = String(req.header("X-Gateway-Delivery-Id") || "").trim();
    if (!deliveryId) return res.status(400).json({ received: false, message: "Missing delivery ID." });

    let event: any;
    try { event = JSON.parse(rawBody.toString("utf8")); }
    catch { return res.status(400).json({ received: false, message: "Invalid JSON payload." }); }

    if (!event || typeof event.orderId !== "string" || !event.orderId) {
      return res.status(400).json({ received: false, message: "Missing orderId." });
    }

    // Persist delivery IDs on the order for idempotency across gateway retries.
    const order = await Order.findOne({ orderId: event.orderId });
    if (!order) return res.status(404).json({ received: false, message: "Unknown order." });

    const priorIds: string[] = Array.isArray((order as any).youpiDeliveryIds) ? (order as any).youpiDeliveryIds : [];
    if (priorIds.includes(deliveryId)) return res.status(200).json({ received: true, duplicate: true });

    const incomingPaise = Number(event.amountPaise);
    const expectedPaise = Math.round(Number(order.totalAmount) * 100);
    const isUpiSuccess = event.event === "SUCCESS" && String(event.method || "").toUpperCase() === "UPI";

    if (isUpiSuccess) {
      if (!Number.isFinite(incomingPaise) || incomingPaise !== expectedPaise) {
        return res.status(409).json({ received: false, message: "Payment amount does not match order." });
      }
      if (order.paymentCaptured && String(order.paymentStatus).toLowerCase() === "paid") {
        (order as any).youpiDeliveryIds = [...priorIds, deliveryId].slice(-100);
        await order.save();
        return res.status(200).json({ received: true, alreadyPaid: true });
      }
      order.paymentMethod = "youpi-upi";
      order.paymentStatus = "Paid";
      order.paymentCaptured = true;
      order.paidAt = new Date();
      order.utrNumber = String(event.utr || "");
    } else if (event.event === "SUCCESS" && String(event.method || "").toUpperCase() === "COD") {
      // A COD order is not paid merely because the gateway emitted SUCCESS.
    } else if (["FAILED", "EXPIRED", "CANCELLED"].includes(String(event.event || ""))) {
      if (!order.paymentCaptured) order.paymentStatus = String(event.event);
    }

    (order as any).youpiDeliveryIds = [...priorIds, deliveryId].slice(-100);
    await order.save();
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("YouPI webhook processing failed", error);
    return res.status(500).json({ received: false, message: "Webhook processing failed." });
  }
};
