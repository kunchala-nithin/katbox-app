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

function expectedAdvancePaise(order: any): number {
  const total = Number(order.totalAmount);
  if (!Number.isFinite(total) || total <= 0) return 0;
  // Recompute from the final stored order total. Never trust the mobile client.
  return Math.round(Math.round(total * 0.4 * 100) / 100 * 100);
}

/** POST /api/payments/youpi/create { orderId } */
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
    if (order.paymentCaptured || order.isAdvanceVerified || /advance paid|paid/i.test(String(order.paymentStatus || ""))) {
      return res.status(409).json({ success: false, message: "This order's advance is already paid." });
    }

    const total = Number(order.totalAmount);
    const expectedPaise = expectedAdvancePaise(order);
    const storedAdvancePaise = Math.round(Number(order.advancePaidAmount || 0) * 100);
    if (!Number.isFinite(total) || total <= 0 || expectedPaise <= 0 || storedAdvancePaise !== expectedPaise) {
      return res.status(400).json({ success: false, message: "Stored order advance does not equal 40% of the final order total. Please recreate the order." });
    }
    const advanceAmount = expectedPaise / 100;

    const response = await fetch(`${gatewayBaseUrl}/api/v1/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Merchant-Id": merchantId },
      body: JSON.stringify({
        orderId: order.orderId,
        amount: advanceAmount.toFixed(2),
        currency: "INR",
        returnUrl: process.env.YOUPI_RETURN_URL || "katbox://payment-result",
        metadata: {
          katboxOrderId: order.orderId,
          serviceType: order.serviceType,
          paymentPurpose: "40_percent_advance",
          orderTotalPaise: Math.round(total * 100),
          balanceAmountPaise: Math.round(Number(order.balanceAmountToCollect || total - advanceAmount) * 100),
        },
      }),
    });
    const payload: any = await response.json().catch(() => ({}));
    if (!response.ok || !payload.checkoutUrl || !payload.paymentId) {
      console.error("YouPI create-payment failed", response.status, payload);
      return res.status(502).json({ success: false, message: "YouPI could not create a checkout session." });
    }

    order.paymentMethod = "youpi-upi";
    order.paymentStatus = "Verification Pending";
    (order as any).youpiPaymentId = String(payload.paymentId);
    await order.save();

    return res.status(200).json({
      success: true,
      orderId: order.orderId,
      amount: advanceAmount.toFixed(2),
      totalAmount: total.toFixed(2),
      balanceAmountToCollect: Number(order.balanceAmountToCollect || total - advanceAmount).toFixed(2),
      checkoutUrl: payload.checkoutUrl,
      paymentId: payload.paymentId,
      status: payload.status || "ACTIVE",
    });
  } catch (error: any) {
    console.error("YouPI checkout initialization failed", error);
    return res.status(500).json({ success: false, message: "Unable to initialize YouPI checkout." });
  }
};

/** Status endpoint is display-only; only the signed webhook confirms payment. */
export const getYoupiPaymentStatus = async (req: AuthRequest, res: Response) => {
  try {
    const order = await Order.findOne({ orderId: String(req.params.orderId || "") }).select(
      "orderId userId paymentMethod paymentStatus paymentCaptured paidAt utrNumber totalAmount advancePaidAmount balanceAmountToCollect isAdvanceVerified"
    );
    if (!order) return res.status(404).json({ success: false, message: "Order not found." });
    if (!req.user?.userId || String(order.userId || "") !== String(req.user.userId)) {
      return res.status(403).json({ success: false, message: "You cannot view this order payment status." });
    }
    return res.json({
      success: true,
      orderId: order.orderId,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      paymentCaptured: Boolean(order.paymentCaptured),
      isAdvanceVerified: Boolean(order.isAdvanceVerified),
      paidAt: order.paidAt || null,
      utrNumber: order.utrNumber || "",
      totalAmount: order.totalAmount,
      advancePaidAmount: order.advancePaidAmount,
      balanceAmountToCollect: order.balanceAmountToCollect,
    });
  } catch (error) {
    console.error("YouPI status lookup failed", error);
    return res.status(500).json({ success: false, message: "Unable to read payment status." });
  }
};

/** Mount with express.raw() BEFORE express.json(). */
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

    const order = await Order.findOne({ orderId: event.orderId });
    if (!order) return res.status(404).json({ received: false, message: "Unknown order." });
    const priorIds: string[] = Array.isArray((order as any).youpiDeliveryIds) ? (order as any).youpiDeliveryIds : [];
    if (priorIds.includes(deliveryId)) return res.status(200).json({ received: true, duplicate: true });

    const incomingPaise = Number(event.amountPaise);
    const expectedPaise = expectedAdvancePaise(order);
    const method = String(event.method || "").toUpperCase();
    const isUpiSuccess = event.event === "SUCCESS" && method === "UPI";
    if (isUpiSuccess) {
      if (!Number.isFinite(incomingPaise) || incomingPaise !== expectedPaise) {
        return res.status(409).json({ received: false, message: "Payment amount does not match the 40% advance." });
      }
      if (order.paymentCaptured && String(order.paymentStatus || "").toLowerCase().includes("gateway verified")) {
        (order as any).youpiDeliveryIds = [...priorIds, deliveryId].slice(-100);
        await order.save();
        return res.status(200).json({ received: true, alreadyPaid: true });
      }
      order.paymentMethod = "youpi-upi";
      order.paymentStatus = "Advance Paid (Gateway Verified)";
      order.paymentCaptured = false; // the full order balance is NOT yet paid
      // Keep isAdvanceVerified false so KatBox's existing admin-to-chef
      // dispatch workflow remains intact; this field means admin release.
      order.isAdvanceVerified = false;
      order.paidAt = new Date();
      order.utrNumber = String(event.utr || "");
      order.statusTimeline = order.statusTimeline || [];
      order.statusTimeline.push({
        status: "Advance Paid (Gateway Verified)",
        timestamp: new Date(),
        note: `YouPI verified the 40% advance payment of ₹${(expectedPaise / 100).toFixed(2)}. Remaining balance ₹${Number(order.balanceAmountToCollect || 0).toFixed(2)} is payable on delivery.`,
      } as any);
    } else if (event.event === "SUCCESS" && method === "COD") {
      // A COD event is not evidence that KatBox received an advance payment.
    } else if (["FAILED", "EXPIRED", "CANCELLED"].includes(String(event.event || "").toUpperCase())) {
      if (!order.paymentCaptured) order.paymentStatus = String(event.event).toUpperCase();
    }

    (order as any).youpiDeliveryIds = [...priorIds, deliveryId].slice(-100);
    await order.save();
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("YouPI webhook processing failed", error);
    return res.status(500).json({ received: false, message: "Webhook processing failed." });
  }
};
