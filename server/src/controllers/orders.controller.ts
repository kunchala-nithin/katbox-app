// orders.controller.ts
import { Request, Response } from "express";
import mongoose from "mongoose";
import Order, {
  HomemadeOrderModel,
  QuickBitesOrderModel,
  CateringOrderModel,
  MealBoxOrderModel,
} from "../models/Orders";
import User from "../models/User";
import Chef from "../models/Chef";
import Cart from "../models/Cart";
import cloudinary from "../config/cloudinary";
import { io } from "..";
import { recalculateChefRating } from "./chef.controller";
import {
  sendExpoPush,
  sendExpoPushBatch,
  isValidExpoToken,
  ORDER_ALARM_SOUND,
  ADMIN_ORDER_CHANNEL_ID,
  CHEF_ORDER_CHANNEL_ID,
} from "../utils/expoPush";

interface AuthRequest extends Request {
  user?: {
    userId?: string;
    _id?: string;
    id?: string;
    phone?: string;
    [key: string]: any;
  };
}

const MONTHS_MAP: { [key: string]: number } = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11
};

/* ─────────────────────────────────────────────────────────────────
   ✅ CANCELLATION / REFUND CONSTANTS
   Only two cancellation sources exist across the entire system:
     • "cancelled by customer"  — set by PATCH /:orderId/cancel
     • "cancelled by chef"      — set by PATCH /:orderId/status when
                                   status becomes "Cancelled" (this
                                   covers BOTH the chef tapping Decline
                                   AND the admin overriding via the
                                   dropdown — per product decision).
   ───────────────────────────────────────────────────────────────── */
const CANCELLATION_SOURCE_CUSTOMER = "cancelled by customer";
const CANCELLATION_SOURCE_CHEF = "cancelled by chef";

/* ✅ Refund status shown after a successful customer cancellation where
   the advance has been captured / is being returned. */
const REFUND_STATUS_INITIATED = "Refund Initiated (3–4 hrs)";

/* ✅ Refund status used when no advance was ever paid (pure-COD placed
   cancellations). Money has NOT been collected, so it must never say
   "Refunded". */
const REFUND_STATUS_NOT_APPLICABLE = "Not Applicable (No Payment Collected)";

/* ✅ Refund status used when a cancellation somehow happens on an
   order that DID capture payment via a route other than the customer
   cancel endpoint and we have no advance to compute against. An ops
   team must review and act. */
const REFUND_STATUS_PENDING_REVIEW = "Pending Review";

/* ✅ Final refund status once the admin has tapped "Process Refund". */
const REFUND_STATUS_REFUNDED = "Refunded";

/* ✅ Professional disclosure text shown to the customer whenever a
   cancellation is blocked because preparation has already begun. */
const CANCELLATION_NOT_PERMITTED_MESSAGE =
  "Cancellation and refund is not possible. Please contact support.";

const CANCELLATION_NOT_PERMITTED_NOTE =
  "Cancellation is not permitted once food preparation has begun. Cancellation charges apply and are payable to the chef as compensation for ingredients and preparation already undertaken. Please contact support.";

/* ─────────────────────────────────────────────────────────────────
   ✅ Helper — Build the cancellation-fee / refund patch for a given order.

   Refund policy (final):
     • Placed-stage customer cancellation → refundAmount = advancePaidAmount
       (full advance refunded), cancellationFee = 0.
     • If advancePaidAmount === 0 (pure-COD, no advance collected):
       refundAmount = 0 and refundStatus = "Not Applicable (No Payment Collected)".
     • If a cancellation somehow happens on an order that DID capture
       payment via another path and advancePaidAmount is 0, we do NOT
       fabricate a refund — refundStatus becomes "Pending Review" so an
       ops team can act.
   ───────────────────────────────────────────────────────────────── */
const buildCancellationRefundPatch = (order: any) => {
  const advanceNum = Number(order?.advancePaidAmount || 0);
  const wasPaymentCaptured = order?.paymentCaptured === true;

  if (advanceNum > 0) {
    return {
      cancellationFee: 0,
      refundAmount: advanceNum,
      refundStatus: REFUND_STATUS_INITIATED,
    };
  }

  if (wasPaymentCaptured) {
    return {
      cancellationFee: 0,
      refundAmount: 0,
      refundStatus: REFUND_STATUS_PENDING_REVIEW,
    };
  }

  return {
    cancellationFee: 0,
    refundAmount: 0,
    refundStatus: REFUND_STATUS_NOT_APPLICABLE,
  };
};

const parseMonthAndDay = (dateStr: string) => {
  if (!dateStr) return { month: 0, day: 0 };
  const cleaned = dateStr.includes("–") ? dateStr.split("–")[0].trim() : dateStr.trim();
  const parts = cleaned.replace(",", "").split(" ");
  if (parts.length >= 2) {
    const day = parseInt(parts[1], 10) || 0;
    const monthStr = (parts[2] || parts[0]).substring(0, 3).toUpperCase();
    const month = MONTHS_MAP[monthStr] ?? 0;
    return { month, day };
  }
  return { month: 0, day: 0 };
};

const sortDatesAscending = (dates: string[]) => {
  if (!Array.isArray(dates) || dates.length <= 1) return dates;
  return [...dates].sort((a, b) => {
    const pA = parseMonthAndDay(a);
    const pB = parseMonthAndDay(b);
    if (pA.month !== pB.month) return pA.month - pB.month;
    return pA.day - pB.day;
  });
};

const calculateSlotTargetTime = (dateStr: string, slotStr: string): Date => {
  const now = new Date();
  try {
    let target = new Date();
    if (slotStr && slotStr.includes("-")) {
      const parts = slotStr.split("-");
      const endPart = parts[1].trim();
      const [time, modifier] = endPart.split(" ");
      let [hours, minutes] = time.split(":").map(Number);
      if (modifier?.toUpperCase() === "PM" && hours < 12) hours += 12;
      if (modifier?.toUpperCase() === "AM" && hours === 12) hours = 0;
      target.setHours(hours, minutes || 0, 0, 0);
      if (target.getTime() <= now.getTime()) {
        target = new Date(now.getTime() + 45 * 60 * 1000);
      }
    } else {
      target = new Date(now.getTime() + 45 * 60 * 1000);
    }
    return target;
  } catch (e) {
    return new Date(now.getTime() + 45 * 60 * 1000);
  }
};

/* ─────────────────────────────────────────────────────────────────
   ✅ NEW — COMMISSION ENGINE (chef earnings)
   ─────────────────────────────────────────────────────────────────
   Business rule (1-based chef order index within that chef's own
   chronological sequence of orders):

     • Orders 1, 2, 3            → Commission FREE (0%)
     • Orders 4, 5, 6, 7         → 18% commission
     • Order  8                  → Commission FREE
     • Orders 9, 10, 11, 12      → 18% commission
     • Order  13                 → Commission FREE
     • Orders 14, 15, 16, 17     → 18% commission
     • Order  18                 → Commission FREE
     • … and so on, repeating forever.

   Condensed rule:
     isCommissionFree = (orderIndex <= 3) || (orderIndex % 5 === 3)

   Verify the pattern:
     1 → free (1<=3)          ✓
     2 → free (2<=3)          ✓
     3 → free (3<=3)          ✓
     4 → paid (4%5=4)         ✓
     5 → paid (5%5=0)         ✓
     6 → paid (6%5=1)         ✓
     7 → paid (7%5=2)         ✓
     8 → free (8%5=3)         ✓
     9 → paid (9%5=4)         ✓
    10 → paid                 ✓
    11 → paid                 ✓
    12 → paid                 ✓
    13 → free (13%5=3)        ✓
    ...
   ───────────────────────────────────────────────────────────────── */
const COMMISSION_RATE = 0.18;

const getCommissionInfo = (orderIndex: number) => {
  const idx = Number(orderIndex) || 1;
  const isFree = idx <= 3 || idx % 5 === 3;

  if (isFree) {
    return {
      isFree: true,
      rate: 0,
      label: "Commission Free",
      note: `Order #${idx}: Commission Free (0%)`,
    };
  }

  return {
    isFree: false,
    rate: COMMISSION_RATE,
    label: "18% Commission",
    note: `Order #${idx}: 18% Commission Applied`,
  };
};

/* ✅ NEW — Enrich a Mongoose order document with commission fields.
   Always returns a plain object (never a Mongoose doc) so the
   response serialization is identical to before. */
const enrichOrderWithCommission = (orderDoc: any, orderIndex: number) => {
  const obj = orderDoc && typeof orderDoc.toObject === "function"
    ? orderDoc.toObject()
    : { ...orderDoc };

  const comm = getCommissionInfo(orderIndex);
  const total = Number(obj.totalAmount || 0);
  const commissionAmount = comm.isFree
    ? 0
    : Math.round(total * comm.rate * 100) / 100;

  return {
    ...obj,
    chefOrderIndex: orderIndex,
    commissionRate: comm.rate,
    isCommissionFree: comm.isFree,
    commissionAmount,
    commissionNote: comm.note,
    commissionLabel: comm.label,
  };
};

/* ─────────────────────────────────────────────────────────────────
   ✅ NEW HELPER — Safely parse a value that may arrive as a JSON
   string (from multipart/form-data) or already as an array/object
   (from application/json). Never throws.
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
   ✅ NEW HELPER — Safely parse a numeric coordinate value that
   may arrive as a string from multipart/form-data. Returns
   undefined for invalid/empty values so MongoDB does not store NaN.
   ───────────────────────────────────────────────────────────────── */
const parseNumberOrUndefined = (val: any): number | undefined => {
  if (val === undefined || val === null || val === "") return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
};

/* ─────────────────────────────────────────────────────────────────
   ✅ NEW HELPER — Coerce any incoming value (which may be an Array
   if the client accidentally sent the same multipart/form-data key
   twice) back into a plain string. Uses the last non-empty entry
   so that the client's most recent value wins. Never throws.
   ───────────────────────────────────────────────────────────────── */
const coerceToString = (val: any): string => {
  if (val === undefined || val === null) return "";
  if (Array.isArray(val)) {
    for (let i = val.length - 1; i >= 0; i--) {
      const v = val[i];
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        return String(v);
      }
    }
    return "";
  }
  return String(val);
};

/* ─────────────────────────────────────────────────────────────────
   ✅ NEW HELPER — Format an absolute Date into "4:30 PM" style string.
   Used to build the delivery slot label. This is the ONLY format
   that will be persisted for QuickBites / homemade delivery slots.
   ───────────────────────────────────────────────────────────────── */
const formatTimeShort = (d: Date): string => {
  try {
    return d.toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
};

/* ─────────────────────────────────────────────────────────────────
   ✅ NEW HELPER — Format an absolute Date into "17 Sep" style string.
   Used only for the delivery date label.
   ───────────────────────────────────────────────────────────────── */
const formatDateShort = (d: Date): string => {
  try {
    const day = d.getDate();
    const month = d.toLocaleDateString("en-US", { month: "short" });
    return `${day} ${month}`;
  } catch {
    return "";
  }
};

/* ─────────────────────────────────────────────────────────────────
   ✅ NEW HELPER (Prompt 2) — Defensive parser for the Prompt 1
   `specialInstructions` sub-document ({ spice, noOnionsGarlic, notes })
   arriving via multipart/form-data (JSON string) or application/json
   (already an object). Mirrors the existing `parsedSpecialInstruction`
   pattern so the backend convention is preserved. Never throws.
   ───────────────────────────────────────────────────────────────── */
const parseQuickSpecialInstructions = (
  raw: any
): { spice: string; noOnionsGarlic: boolean; notes: string } | null => {
  if (raw === undefined || raw === null || raw === "") return null;

  let parsed: any = null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return null;
    }
  } else if (typeof raw === "object") {
    parsed = raw;
  } else {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;

  const spice = String(parsed.spice ?? "").trim();
  const noOnionsGarlic = Boolean(parsed.noOnionsGarlic);
  const notes = String(parsed.notes ?? "").trim();

  // Return null when every sub-field is empty — avoids writing an
  // all-empty sub-doc to MongoDB for orders that carry no instructions.
  if (!spice && !noOnionsGarlic && !notes) return null;

  return { spice, noOnionsGarlic, notes };
};

const uploadBufferToCloudinary = (fileBuffer: Buffer) => {
  return new Promise<any>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "advance_payment_proofs",
        resource_type: "image",
        quality: "auto:good",
        fetch_format: "auto",
        transformation: [{ width: 1000, height: 1000, crop: "limit" }],
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    stream.end(fileBuffer);
  });
};

/* ─────────────────────────────────────────────────────────────────
   ✅ UPDATED — Local wrapper now delegates to the centralized
   `sendExpoPush` helper from ../utils/expoPush.
   Signature kept IDENTICAL so all existing call sites
   (customer pushes in feedback cron + order flows) keep working
   with zero changes. Uses the OS default sound (NOT the alarm)
   so customer-facing notifications remain unchanged.
   ───────────────────────────────────────────────────────────────── */
const sendExpoPushNotification = async (
  pushToken: string,
  title: string,
  body: string,
  data: any = {}
) => {
  if (!isValidExpoToken(pushToken)) return;
  await sendExpoPush({
    token: pushToken,
    title,
    body,
    data,
    sound: "default",
  });
};

/* ─────────────────────────────────────────────────────────────────
   ✅ NEW HELPER — Human-readable title + body for customer-facing
   order status push notifications. Maps every status value that
   the admin/chef dropdowns can produce to a friendly message.
   Falls back to a generic message for any unmapped status.
   ───────────────────────────────────────────────────────────────── */
const getCustomerStatusMessage = (
  rawStatus: string,
  orderId: string
): { title: string; body: string } => {
  const s = String(rawStatus || "").trim().toLowerCase();
  const shortId = orderId ? `#${orderId}` : "";

  // Accepted / Prep started
  if (s === "accepted") {
    return {
      title: "✅ Order Accepted",
      body: `Your order ${shortId} has been accepted and will be prepared shortly.`,
    };
  }

  // Preparing
  if (s === "preparing" || s === "prep") {
    return {
      title: "👨‍🍳 Order Being Prepared",
      body: `Great news! Your order ${shortId} is now being prepared.`,
    };
  }

  // Packed
  if (
    s === "prepared & packing" ||
    s === "prepared and packing" ||
    s === "packing" ||
    s === "packed"
  ) {
    return {
      title: "📦 Order Packed",
      body: `Your order ${shortId} has been packed and is ready to be dispatched.`,
    };
  }

  // Out for delivery
  if (s === "out for delivery" || s === "out_for_delivery" || s === "dispatched") {
    return {
      title: "🚴 Out for Delivery",
      body: `Your order ${shortId} is on its way! Please be ready to receive it.`,
    };
  }

  // Delivered / completed
  if (s === "delivered" || s === "completed") {
    return {
      title: "🎉 Order Delivered",
      body: `Your order ${shortId} has been delivered. Enjoy your meal!`,
    };
  }

  // Cancelled
  if (s === "cancelled" || s === "canceled") {
    return {
      title: "❌ Order Cancelled",
      body: `Your order ${shortId} has been cancelled. If this was unexpected, please contact support.`,
    };
  }

  // Cash collected / fully paid
  if (
    s === "cash collected" ||
    s === "cash_collected" ||
    s === "collected" ||
    s === "balance collected" ||
    s === "fully paid"
  ) {
    return {
      title: "💰 Payment Received",
      body: `Payment for order ${shortId} has been received. Thank you!`,
    };
  }

  // Paused / Unpaused (mealbox schedule)
  if (s === "paused") {
    return {
      title: "⏸ Delivery Paused",
      body: `A scheduled delivery for order ${shortId} has been paused.`,
    };
  }
  if (s === "scheduled" || s === "unpaused") {
    return {
      title: "▶ Delivery Resumed",
      body: `A scheduled delivery for order ${shortId} has been resumed.`,
    };
  }

  // Generic fallback for any unmapped status
  return {
    title: "📋 Order Update",
    body: `Your order ${shortId} status: ${rawStatus}`,
  };
};

// Background cron reminder for feedbacks
setInterval(async () => {
  try {
    const now = new Date();
    const deliveredOrders = await Order.find({
      orderStatus: { $in: ["Delivered", "Completed", "Cash Collected"] },
      "feedback.isSubmitted": { $ne: true },
      actualDeliveredAt: { $exists: true, $ne: null },
    });

    for (const order of deliveredOrders) {
      const deliveredTime = new Date(order.actualDeliveredAt!).getTime();
      const lastNotifTime = order.lastFeedbackNotificationAt ? new Date(order.lastFeedbackNotificationAt).getTime() : deliveredTime;
      const count = order.feedbackNotificationCount || 0;

      const hoursSinceDelivery = (now.getTime() - deliveredTime) / (1000 * 60 * 60);
      const hoursSinceLastNotif = (now.getTime() - lastNotifTime) / (1000 * 60 * 60);

      let shouldNotify = false;
      if (count === 0 && hoursSinceDelivery >= 2) {
        shouldNotify = true;
      } else if (count > 0 && hoursSinceLastNotif >= 3) {
        shouldNotify = true;
      }

      if (shouldNotify && order.userId) {
        const userDoc = await User.findById(order.userId);
        if (userDoc && userDoc.pushToken) {
          await sendExpoPushNotification(
            userDoc.pushToken,
            'We value your feedback!',
            'Please take a moment to rate your recent order and chef.',
            { orderId: order.orderId, screen: 'orders' }
          );
        }

        order.lastFeedbackNotificationAt = now;
        order.feedbackNotificationCount = count + 1;
        await order.save();
      }
    }
  } catch (err) {
    console.log("Background feedback reminder cron error:", err);
  }
}, 15 * 60 * 1000);

/**
 * POST /api/orders/create
 *
 * IMPORTANT: When an order is created, it goes ONLY to the Admin.
 * The chef is NOT notified here. Chef receives the order only after
 * admin verifies advance payment via /verify-advance.
 *
 * ✅ QuickBites flow:
 *    When serviceType === "quickbites" (or isQuickBites === "true", or the
 *    category normalizes to "quickbites"), the order is saved through the
 *    dedicated QuickBitesOrderModel — a discriminated sibling of homemade
 *    that reuses the same schema but persists serviceType = "quickbites"
 *    on the shared Orders collection. Every downstream behaviour
 *    (admin alarm, chef alarm on verify, status timeline, feedback cron)
 *    stays identical to a homemade order.
 *
 * ✅ The controller computes and persists three additional timestamp
 *    fields on the order document at the exact moment of order placement:
 *
 *      • orderPlacedAt          → the server time when createOrder ran.
 *      • estimatedDeliveryAt    → absolute Date when delivery is expected.
 *      • deliveryWindowMinutes  → the window size (75 for QuickBites, else 0).
 *
 *    ✅ The human-readable delivery slot label that gets stored in
 *       MongoDB is now ONLY the time in "4:30 PM" format (e.g. "4:30 PM"),
 *       never the long "ASAP (Within 75 minutes...)" string.
 *
 *    ✅ latitude & longitude are also persisted on the order and
 *       on each delivery schedule so downstream map actions can pin
 *       the exact location.
 *
 *    ✅ Special instructions and delivery type are now persisted
 *       on the order document for ALL flows.
 *
 *    ✅ PROMPT 2: Prompt 1's authoritative cart fields
 *       (`quickDeliverySlot` and `specialInstructions`) are now also
 *       persisted on the order document for homemade / quickbites.
 *       The legacy `deliverySlot` / `specialInstruction*` fields are
 *       kept intact so existing orders and existing UIs continue to work.
 *
 *    ✅ DEFENSIVE: All scalar string fields are passed through
 *       `coerceToString()` so that if a client sends the same
 *       multipart/form-data key twice (delivering an Array to
 *       Express), Mongoose never sees an array for a String field.
 *
 *    ✅ After the order is saved, EVERY user with isAdmin === true
 *       receives an Expo push with the bundled alarm.mp3 sound +
 *       admin_orders_alarm channel + data.role = "admin". This makes
 *       the admin's phone ring even when the app is fully closed.
 */
export const createOrder = async (req: AuthRequest, res: Response) => {
  try {
    const rawUserId = req.user?.userId || req.user?._id || req.user?.id || req.body?.userId;

    const {
      userId,
      userName,
      userPhone,
      phone,
      alternatePhone,
      orderDetails,
      cartId,
      cart,
      chefId,
      chefName,
      serviceType,
      menuName,
      menuImage,
      durationType,
      deliveryTimeSlot,
      // ✅ New: top-level delivery slot label for homemade (mirror of deliveryTimeSlot)
      deliverySlot,
      addressDetails,
      deliveryAddress,
      deliveryDate,
      upcomingDeliveries,
      subtotal,
      deliveryPrice,
      discount,
      appliedCoupon,
      totalAmount,
      advancePaidAmount,
      balanceAmountToCollect,
      utrNumber,
      paymentMethod,
      selections,
      items,
      restaurantName,
      restaurantImage,
      occasion,
      guests,
      eventDate,
      eventTime,
      deliveryType,
      pricePerPlate,
      addons,
      // ✅ QuickBites flow hint + optional client-provided absolute timestamp
      isQuickBites,
      estimatedDeliveryAtMs,
      deliveryWindowMinutes,
      // ✅ geo coordinates for map pinning
      latitude,
      longitude,
      // ✅ Special instruction fields (legacy, single-object shape)
      specialInstruction,
      specialInstructionTag,
      specialInstructionLabel,
      specialInstructionText,
      // ✅ PROMPT 2: Prompt 1's authoritative cart fields
      //    - quickDeliverySlot: the exact slot string stored on the cart.
      //    - specialInstructions: the exact sub-doc shape stored on the cart
      //      ({ spice, noOnionsGarlic, notes }).
      //    These are additive and do NOT replace the legacy fields above.
      quickDeliverySlot,
      specialInstructions,
    } = req.body;

    // ✅ Normalize coordinates once (works for JSON and multipart/form-data)
    const resolvedLatitude = parseNumberOrUndefined(latitude);
    const resolvedLongitude = parseNumberOrUndefined(longitude);

    // ✅ DEFENSIVE: Coerce all scalar string fields back to plain strings.
    //    This is the SAFETY NET that prevents the 500 error:
    //      "Cast to string failed for value [ 'Standard', 'Standard' ]"
    //    which occurs when a multipart key is sent twice.
    const safeServiceType = coerceToString(serviceType);
    const safeMenuName = coerceToString(menuName);
    const safeMenuImage = coerceToString(menuImage);
    const safeDurationType = coerceToString(durationType);
    const safeDeliveryTimeSlot = coerceToString(deliveryTimeSlot);
    const safeDeliverySlot = coerceToString(deliverySlot);
    const safeAddressDetails = coerceToString(addressDetails);
    const safeDeliveryAddress = coerceToString(deliveryAddress);
    const safeDeliveryDate = coerceToString(deliveryDate);
    const safeAppliedCoupon = coerceToString(appliedCoupon);
    const safeUtrNumber = coerceToString(utrNumber);
    const safePaymentMethod = coerceToString(paymentMethod);
    const safeRestaurantName = coerceToString(restaurantName);
    const safeRestaurantImage = coerceToString(restaurantImage);
    const safeOccasion = coerceToString(occasion);
    const safeEventDate = coerceToString(eventDate);
    const safeEventTime = coerceToString(eventTime);
    const safeDeliveryType = coerceToString(deliveryType);
    // ✅ PROMPT 2: Coerce the incoming Prompt 1 quickDeliverySlot.
    const safeQuickDeliverySlot = coerceToString(quickDeliverySlot);

    // ✅ Defensive parsing of specialInstruction — never throws, never leaks null
    let parsedSpecialInstruction: any = null;
    try {
      if (
        specialInstruction !== undefined &&
        specialInstruction !== null &&
        specialInstruction !== ""
      ) {
        if (typeof specialInstruction === "string") {
          const trimmed = specialInstruction.trim();
          if (trimmed.length > 0) {
            parsedSpecialInstruction = JSON.parse(trimmed);
          }
        } else if (typeof specialInstruction === "object") {
          parsedSpecialInstruction = specialInstruction;
        }
      }
    } catch (parseErr) {
      console.log("specialInstruction parse warning:", parseErr);
      parsedSpecialInstruction = null;
    }

    // ✅ Resolve special instruction fields with fallbacks (always strings)
    const resolvedSpecialInstructionTag = String(
      coerceToString(specialInstructionTag) ||
      (parsedSpecialInstruction && parsedSpecialInstruction.tag) ||
      ""
    ).trim();

    const resolvedSpecialInstructionLabel = String(
      coerceToString(specialInstructionLabel) ||
      (parsedSpecialInstruction && parsedSpecialInstruction.label) ||
      ""
    ).trim();

    const resolvedSpecialInstructionText = String(
      coerceToString(specialInstructionText) ||
      (parsedSpecialInstruction && parsedSpecialInstruction.text) ||
      ""
    ).trim();

    // ✅ Build the specialInstruction object for persistence (always an object)
    const resolvedSpecialInstruction = {
      tag: resolvedSpecialInstructionTag,
      label: resolvedSpecialInstructionLabel,
      text: resolvedSpecialInstructionText,
    };

    // ✅ PROMPT 2: Parse the Prompt 1 `specialInstructions` sub-doc
    // ({ spice, noOnionsGarlic, notes }) — returns null when empty so we
    // don't write an all-empty sub-document to MongoDB.
    const resolvedQuickSpecialInstructions = parseQuickSpecialInstructions(specialInstructions);

    const finalUserId = String(rawUserId || userId || "");

    let finalUserPhone = coerceToString(
      userPhone ||
      phone ||
      orderDetails?.contactPhone ||
      cart?.userPhone ||
      cart?.orderDetails?.contactPhone ||
      req.user?.phone ||
      ""
    );

    let finalAlternatePhone = coerceToString(
      alternatePhone ||
      orderDetails?.alternatePhone ||
      cart?.alternatePhone ||
      cart?.orderDetails?.alternatePhone ||
      ""
    );

    if (finalUserId && mongoose.Types.ObjectId.isValid(finalUserId)) {
      if (!finalUserPhone || !finalAlternatePhone) {
        let userCart = null;
        if (cartId && mongoose.Types.ObjectId.isValid(cartId)) {
          userCart = await Cart.findById(cartId);
        }
        if (!userCart) {
          userCart = await Cart.findOne({ user: finalUserId, status: "in-cart" }).sort({ createdAt: -1 });
        }

        if (userCart) {
          if (!finalUserPhone) {
            finalUserPhone = coerceToString(userCart.userPhone || userCart.orderDetails?.contactPhone || "");
          }
          if (!finalAlternatePhone) {
            finalAlternatePhone = coerceToString(userCart.alternatePhone || userCart.orderDetails?.alternatePhone || "");
          }
        }
      }

      if (!finalUserPhone) {
        const userObj = await User.findById(finalUserId);
        if (userObj && userObj.phone) {
          finalUserPhone = coerceToString(userObj.phone);
        }
      }
    }

    // Handle Screenshot Upload if provided via multer
    let screenshotData = { url: "", cloudinaryId: "" };
    const uploadedFile = req.file;
    if (uploadedFile) {
      try {
        const uploadRes = await uploadBufferToCloudinary(uploadedFile.buffer);
        screenshotData = {
          url: uploadRes.secure_url,
          cloudinaryId: uploadRes.public_id,
        };
      } catch (uploadErr) {
        console.log("Screenshot upload warning:", uploadErr);
      }
    }

    const generatedOrderId = "KB" + Date.now().toString().slice(-8);
    const sortedDeliveries = Array.isArray(upcomingDeliveries) ? sortDatesAscending(upcomingDeliveries) : [];
    const effectiveChefId = coerceToString(chefId);
    const effectiveChefName = coerceToString(chefName) || safeRestaurantName || "";
    const effectiveRestaurantName = safeRestaurantName || coerceToString(chefName) || "";

    // ✅ Normalize the incoming serviceType to lowercase so we always
    // compare apples-to-apples when choosing the correct discriminator.
    const resolvedServiceType = safeServiceType ? safeServiceType.toLowerCase() : "mealbox";

    const resolvedAddress = String(safeDeliveryAddress || safeAddressDetails || "");

    const numericTotal = Number(totalAmount) || 0;
    const finalAdvance = advancePaidAmount !== undefined ? Number(advancePaidAmount) : Math.round(numericTotal * 0.40 * 100) / 100;
    const finalBalance = balanceAmountToCollect !== undefined ? Number(balanceAmountToCollect) : Math.round((numericTotal - finalAdvance) * 100) / 100;

    let resolvedChefPhone = "";
    try {
      let chefDoc: any = null;
      if (effectiveChefId && mongoose.Types.ObjectId.isValid(effectiveChefId)) {
        chefDoc = await Chef.findById(effectiveChefId);
      }
      if (!chefDoc && effectiveChefId) {
        chefDoc = await Chef.findOne({ user: effectiveChefId });
      }
      if (!chefDoc && effectiveChefName) {
        chefDoc = await Chef.findOne({ name: effectiveChefName });
      }
      if (chefDoc && chefDoc.phone) {
        resolvedChefPhone = String(chefDoc.phone).trim();
      }
    } catch (lookupErr) {
      console.log("Chef phone lookup warning:", lookupErr);
    }

    // ────────────────────────────────────────────────────────────────
    // ✅ Compute absolute delivery timestamps at order placement.
    //    • orderPlacedAt = server "now"
    //    • QuickBites = serviceType === "quickbites" OR isQuickBites === "true"
    //      OR category normalizes to "quickbites".
    //      → estimatedDeliveryAt = now + 75 min (or supplied window)
    //    • Else if client sent an absolute ms timestamp: use it.
    //    • Else: leave estimatedDeliveryAt unset.
    // ────────────────────────────────────────────────────────────────
    const orderPlacedAt = new Date();
    const quickBitesFlag =
      resolvedServiceType === "quickbites" ||
      String(isQuickBites || "").toLowerCase() === "true" ||
      String(req.body?.category || "").trim().toLowerCase().replace(/\s+/g, "") === "quickbites";

    let resolvedWindowMinutes = Number(deliveryWindowMinutes) || 0;
    let resolvedEstimatedDeliveryAt: Date | undefined = undefined;

    if (quickBitesFlag) {
      // Default to 75 minutes when the client didn't specify
      if (!resolvedWindowMinutes || resolvedWindowMinutes <= 0) {
        resolvedWindowMinutes = 75;
      }
      resolvedEstimatedDeliveryAt = new Date(
        orderPlacedAt.getTime() + resolvedWindowMinutes * 60 * 1000
      );
    } else if (estimatedDeliveryAtMs !== undefined && estimatedDeliveryAtMs !== null && estimatedDeliveryAtMs !== "") {
      const parsedMs = Number(estimatedDeliveryAtMs);
      if (Number.isFinite(parsedMs) && parsedMs > 0) {
        resolvedEstimatedDeliveryAt = new Date(parsedMs);
      }
    }

    // ✅ Format the human-readable delivery slot label so downstream UIs
    // can display a fixed string even without reading the Date.
    //
    // ✅ The slot label is now ALWAYS just the time — "4:30 PM" —
    // never the long "ASAP (Within 75 minutes…)" string.
    //
    // ✅ CRITICAL FIX for QuickBites:
    //    For QuickBites, the persisted `deliverySlot` and `deliveryTimeSlot`
    //    MUST be the formatted time (e.g. "4:30 PM") so that the admin and
    //    chef /all-orders screens can display it directly. We therefore
    //    OVERRIDE whatever the client sent with the server-computed value.
    let finalDeliverySlotLabel = String(safeDeliverySlot || safeDeliveryTimeSlot || "").trim();
    let finalDeliveryDateLabel = String(safeDeliveryDate || "").trim();

    if (resolvedEstimatedDeliveryAt) {
      const timeStr = formatTimeShort(resolvedEstimatedDeliveryAt);
      const dateStr = formatDateShort(orderPlacedAt);

      if (quickBitesFlag) {
        // ✅ Just the time, e.g. "4:30 PM" — ALWAYS override for QuickBites
        finalDeliveryDateLabel = `Today, ${dateStr}`;
        finalDeliverySlotLabel = timeStr;
      } else if (!finalDeliverySlotLabel) {
        // ✅ Just the time
        finalDeliverySlotLabel = timeStr;
      }
      if (!finalDeliveryDateLabel) {
        finalDeliveryDateLabel = dateStr;
      }
    }

    // ✅ ADDITIONAL SAFETY NET for QuickBites:
    //    If for any reason resolvedEstimatedDeliveryAt was undefined but
    //    the flow is QuickBites, still compute a fresh slot label from
    //    "now" so the persisted slot is never empty.
    if (quickBitesFlag && !finalDeliverySlotLabel) {
      const fallbackEstimated = new Date(
        orderPlacedAt.getTime() + (resolvedWindowMinutes || 75) * 60 * 1000
      );
      finalDeliverySlotLabel = formatTimeShort(fallbackEstimated);
      if (!finalDeliveryDateLabel) {
        finalDeliveryDateLabel = `Today, ${formatDateShort(orderPlacedAt)}`;
      }
      // Also make sure we persist the estimated timestamp
      if (!resolvedEstimatedDeliveryAt) {
        resolvedEstimatedDeliveryAt = fallbackEstimated;
        resolvedWindowMinutes = resolvedWindowMinutes || 75;
      }
    }

    // ✅ PROMPT 2: Resolve the authoritative `quickDeliverySlot` value that
    // gets persisted on the order document.
    //
    // Priority (single authoritative value — never two competing versions):
    //   1. The exact `quickDeliverySlot` string the client sent (which
    //      CheckoutScreen derived from the cart's `deliverySlot` field —
    //      Prompt 1's source of truth).
    //   2. Fallback to the server-computed `finalDeliverySlotLabel`
    //      (which for QuickBites is the fresh "4:30 PM" time and for
    //      homemade is the client/legacy `deliverySlot`/`deliveryTimeSlot`).
    //
    // This guarantees the SAME value travels Cart → Checkout → Order → Mongo
    // without inventing a new field or a second source of truth.
    const resolvedQuickDeliverySlot =
      safeQuickDeliverySlot || finalDeliverySlotLabel || "";

    // ✅ PROMPT 2: Only attach the two new fields to the order doc when
    // there is actual data to persist. This keeps older / non-QuickBites /
    // non-homemade orders exactly as they were before (no new empty fields).
    const includeQuickDeliverySlot =
      !!resolvedQuickDeliverySlot &&
      (resolvedServiceType === "homemade" || resolvedServiceType === "quickbites");

    const includeQuickSpecialInstructions =
      !!resolvedQuickSpecialInstructions &&
      (resolvedServiceType === "homemade" || resolvedServiceType === "quickbites");

    let savedOrder: any = null;

    // ✅ Homemade AND QuickBites share the same schema, but they are
    //    saved through DIFFERENT discriminator models so that the
    //    persisted serviceType correctly stays as "homemade" or
    //    "quickbites" respectively on the shared Orders collection.
    if (resolvedServiceType === "homemade" || resolvedServiceType === "quickbites") {
      const parsedItemsRaw = parseIfJsonString(items, []);

      const sanitizedItems = Array.isArray(parsedItemsRaw)
        ? parsedItemsRaw.map((it: any) => ({
            id: String(it.id || it._id || Math.random().toString()),
            name: String(it.name || "Special Dish"),
            image: String(it.image || it.imageUrl || ""),
            price: Number(it.price) || 0,
            quantity: Number(it.quantity) || 1,
            selectedQtyConfig: String(
              it.selectedQtyConfig || it.sizeLabel || it.size || "Standard Serving"
            ),
            isVeg: it.isVeg !== undefined ? Boolean(it.isVeg) : true,
          }))
        : [];

      // ✅ Resolve the delivery slot label for homemade / quickbites —
      // prefer the new top-level `deliverySlot` param, fall back to
      // legacy `deliveryTimeSlot`.
      const resolvedHomemadeSlot = finalDeliverySlotLabel || "";

      // ✅ Pick the correct discriminator model.
      const ModelToUse = resolvedServiceType === "quickbites"
        ? QuickBitesOrderModel
        : HomemadeOrderModel;

      // ✅ Build a safe numeric coordinate (never NaN, never undefined -> use null)
      const safeLat = Number.isFinite(resolvedLatitude as number) ? (resolvedLatitude as number) : undefined;
      const safeLng = Number.isFinite(resolvedLongitude as number) ? (resolvedLongitude as number) : undefined;

      const newHomemadeOrder = new ModelToUse({
        orderId: generatedOrderId,
        userId: finalUserId,
        userName: coerceToString(userName),
        userPhone: finalUserPhone,
        alternatePhone: finalAlternatePhone,
        chefId: effectiveChefId,
        chefName: effectiveChefName,
        chefPhone: resolvedChefPhone,
        // ✅ Always persist the resolved serviceType so downstream
        // screens (CartScreen, Orders tab, admin dashboard) can key
        // off the correct value: "homemade" or "quickbites".
        serviceType: resolvedServiceType,
        items: sanitizedItems,
        deliveryAddress: resolvedAddress,
        deliveryTimeSlot: resolvedHomemadeSlot,
        deliverySlot: resolvedHomemadeSlot,
        deliveryDate: finalDeliveryDateLabel || "Today",
        // ✅ Persist the QuickBites flag alongside the timestamps
        isQuickBites: quickBitesFlag,
        // ✅ Persist the absolute delivery timestamps computed from "now"
        orderPlacedAt,
        estimatedDeliveryAt: resolvedEstimatedDeliveryAt,
        deliveryWindowMinutes: resolvedWindowMinutes,
        // ✅ Persist geo coordinates for map pinning (only if valid numbers)
        ...(safeLat !== undefined ? { latitude: safeLat } : {}),
        ...(safeLng !== undefined ? { longitude: safeLng } : {}),
        subtotal: Number(subtotal) || 0,
        deliveryPrice: Number(deliveryPrice) || 0,
        discount: Number(discount) || 0,
        appliedCoupon: safeAppliedCoupon,
        totalAmount: numericTotal,
        advancePaidAmount: finalAdvance,
        balanceAmountToCollect: finalBalance,
        utrNumber: safeUtrNumber,
        advancePaymentScreenshot: screenshotData,
        isAdvanceVerified: false,
        paymentMethod: safePaymentMethod || "cod",
        paymentStatus: "Verification Pending",
        orderStatus: "Placed",
        // ✅ Persist special instructions for homemade / quickbites flow
        specialInstruction: resolvedSpecialInstruction,
        specialInstructionTag: resolvedSpecialInstructionTag,
        specialInstructionLabel: resolvedSpecialInstructionLabel,
        specialInstructionText: resolvedSpecialInstructionText,
        // ✅ PROMPT 2: Persist Prompt 1's authoritative cart fields for
        // homemade / quickbites. Only attached when non-empty so we never
        // write a phantom value.
        ...(includeQuickDeliverySlot
          ? { quickDeliverySlot: resolvedQuickDeliverySlot }
          : {}),
        ...(includeQuickSpecialInstructions
          ? { specialInstructions: resolvedQuickSpecialInstructions }
          : {}),
        // ✅ Persist delivery type for homemade / quickbites flow
        deliveryType: safeDeliveryType,
        statusTimeline: [
          { status: "Placed", timestamp: orderPlacedAt, note: `Advance submitted (UTR: ${safeUtrNumber || 'Screenshot Provided'}) - Verification Pending` },
        ],
      });

      savedOrder = await newHomemadeOrder.save();
    }
    else if (resolvedServiceType === "catering") {
      const safeLat = Number.isFinite(resolvedLatitude as number) ? (resolvedLatitude as number) : undefined;
      const safeLng = Number.isFinite(resolvedLongitude as number) ? (resolvedLongitude as number) : undefined;

      // ✅ PROMPT 2: On catering, we still persist the two new fields IF the
      // client happened to send them (defensive, keeps the chain universal).
      // We do NOT fabricate them for catering — they are only attached when
      // the client explicitly provided them, matching Prompt 2's "do not
      // accidentally apply the new behavior to unrelated order types".
      const includeCateringQuickDeliverySlot = !!safeQuickDeliverySlot;
      const includeCateringQuickSpecialInstructions = !!resolvedQuickSpecialInstructions;

      const newCateringOrder = new CateringOrderModel({
        orderId: generatedOrderId,
        userId: finalUserId,
        userName: coerceToString(userName),
        userPhone: finalUserPhone,
        alternatePhone: finalAlternatePhone,
        chefId: effectiveChefId,
        chefName: effectiveChefName,
        chefPhone: resolvedChefPhone,
        serviceType: "catering",
        menuName: safeMenuName || "Catering Platter",
        menuImage: safeMenuImage || safeRestaurantImage || "",
        addressDetails: resolvedAddress,
        restaurantName: effectiveRestaurantName,
        restaurantImage: safeRestaurantImage || safeMenuImage || "",
        occasion: safeOccasion || "Event",
        guests: Number(guests) || 0,
        eventDate: safeEventDate || safeDeliveryDate || "",
        eventTime: safeEventTime || safeDeliveryTimeSlot || "",
        deliveryType: safeDeliveryType || "Standard",
        pricePerPlate: Number(pricePerPlate) || 0,
        addons: Array.isArray(addons) ? addons : [],
        selections: selections || null,
        items: items || [],
        // ✅ Timestamps for downstream UIs
        orderPlacedAt,
        estimatedDeliveryAt: resolvedEstimatedDeliveryAt,
        deliveryWindowMinutes: resolvedWindowMinutes,
        // ✅ Persist geo coordinates for map pinning (only if valid numbers)
        ...(safeLat !== undefined ? { latitude: safeLat } : {}),
        ...(safeLng !== undefined ? { longitude: safeLng } : {}),
        subtotal: Number(subtotal) || 0,
        deliveryPrice: Number(deliveryPrice) || 0,
        discount: Number(discount) || 0,
        appliedCoupon: safeAppliedCoupon,
        totalAmount: numericTotal,
        advancePaidAmount: finalAdvance,
        balanceAmountToCollect: finalBalance,
        utrNumber: safeUtrNumber,
        advancePaymentScreenshot: screenshotData,
        isAdvanceVerified: false,
        paymentMethod: safePaymentMethod || "cod",
        paymentStatus: "Verification Pending",
        orderStatus: "Placed",
        // ✅ Persist special instructions for catering flow
        specialInstruction: resolvedSpecialInstruction,
        specialInstructionTag: resolvedSpecialInstructionTag,
        specialInstructionLabel: resolvedSpecialInstructionLabel,
        specialInstructionText: resolvedSpecialInstructionText,
        // ✅ PROMPT 2: attach Prompt 1 fields only when the client sent them.
        ...(includeCateringQuickDeliverySlot
          ? { quickDeliverySlot: safeQuickDeliverySlot }
          : {}),
        ...(includeCateringQuickSpecialInstructions
          ? { specialInstructions: resolvedQuickSpecialInstructions }
          : {}),
        statusTimeline: [
          { status: "Placed", timestamp: orderPlacedAt, note: `Advance submitted (UTR: ${safeUtrNumber || 'Screenshot Provided'}) - Verification Pending` },
        ],
      });

      savedOrder = await newCateringOrder.save();
    }
    else {
      // ✅ Copy coordinates onto each schedule as well so per-schedule
      // map actions can pin the exact drop location.
      const safeLat = Number.isFinite(resolvedLatitude as number) ? (resolvedLatitude as number) : undefined;
      const safeLng = Number.isFinite(resolvedLongitude as number) ? (resolvedLongitude as number) : undefined;

      // ✅ PROMPT 2: Same rule as catering — attach only if client sent them.
      const includeMealboxQuickDeliverySlot = !!safeQuickDeliverySlot;
      const includeMealboxQuickSpecialInstructions = !!resolvedQuickSpecialInstructions;

      const initialSchedules = sortedDeliveries.map((dateItem: string) => ({
        date: dateItem,
        status: "Scheduled",
        timeSlot: safeDeliveryTimeSlot || "7:00 PM - 9:00 PM",
        address: resolvedAddress,
        ...(safeLat !== undefined ? { latitude: safeLat } : {}),
        ...(safeLng !== undefined ? { longitude: safeLng } : {}),
        statusTimeline: [
          { status: "Scheduled", timestamp: orderPlacedAt, note: `Delivery scheduled for ${dateItem}` },
        ],
      }));

      const newMealBoxOrder = new MealBoxOrderModel({
        orderId: generatedOrderId,
        userId: finalUserId,
        userName: coerceToString(userName),
        userPhone: finalUserPhone,
        alternatePhone: finalAlternatePhone,
        chefId: effectiveChefId,
        chefName: effectiveChefName,
        chefPhone: resolvedChefPhone,
        serviceType: "mealbox",
        menuName: safeMenuName || "Meal Plan",
        menuImage: safeMenuImage || "",
        durationType: safeDurationType || "",
        deliveryTimeSlot: safeDeliveryTimeSlot || "7:00 PM - 9:00 PM",
        addressDetails: resolvedAddress,
        deliveryDate: safeDeliveryDate || "",
        upcomingDeliveries: sortedDeliveries,
        deliverySchedules: initialSchedules,
        pausedDates: [],
        selections: selections || null,
        items: items || [],
        // ✅ Timestamps for downstream UIs
        orderPlacedAt,
        estimatedDeliveryAt: resolvedEstimatedDeliveryAt,
        deliveryWindowMinutes: resolvedWindowMinutes,
        // ✅ Persist geo coordinates for map pinning (only if valid numbers)
        ...(safeLat !== undefined ? { latitude: safeLat } : {}),
        ...(safeLng !== undefined ? { longitude: safeLng } : {}),
        subtotal: Number(subtotal) || 0,
        deliveryPrice: Number(deliveryPrice) || 0,
        discount: Number(discount) || 0,
        appliedCoupon: safeAppliedCoupon,
        totalAmount: numericTotal,
        advancePaidAmount: finalAdvance,
        balanceAmountToCollect: finalBalance,
        utrNumber: safeUtrNumber,
        advancePaymentScreenshot: screenshotData,
        isAdvanceVerified: false,
        paymentMethod: safePaymentMethod || "cod",
        paymentStatus: "Verification Pending",
        orderStatus: "Placed",
        // ✅ Persist special instructions for mealbox flow
        specialInstruction: resolvedSpecialInstruction,
        specialInstructionTag: resolvedSpecialInstructionTag,
        specialInstructionLabel: resolvedSpecialInstructionLabel,
        specialInstructionText: resolvedSpecialInstructionText,
        // ✅ PROMPT 2: attach Prompt 1 fields only when the client sent them.
        ...(includeMealboxQuickDeliverySlot
          ? { quickDeliverySlot: safeQuickDeliverySlot }
          : {}),
        ...(includeMealboxQuickSpecialInstructions
          ? { specialInstructions: resolvedQuickSpecialInstructions }
          : {}),
        // ✅ Persist delivery type for mealbox flow
        deliveryType: safeDeliveryType,
        statusTimeline: [
          { status: "Placed", timestamp: orderPlacedAt, note: `Advance submitted (UTR: ${safeUtrNumber || 'Screenshot Provided'}) - Verification Pending` },
        ],
      });

      savedOrder = await newMealBoxOrder.save();
    }

    if (finalUserId && mongoose.Types.ObjectId.isValid(finalUserId)) {
      await User.findByIdAndUpdate(finalUserId, {
        $addToSet: { orderHistory: savedOrder._id },
      });
    }

    if (effectiveChefId) {
      if (mongoose.Types.ObjectId.isValid(effectiveChefId)) {
        await Chef.findByIdAndUpdate(effectiveChefId, {
          $addToSet: { orderHistory: savedOrder._id },
        });
        await Chef.findOneAndUpdate(
          { user: effectiveChefId },
          { $addToSet: { orderHistory: savedOrder._id } }
        );
      } else {
        await Chef.findOneAndUpdate(
          { name: effectiveChefName },
          { $addToSet: { orderHistory: savedOrder._id } }
        );
      }
    }

    if (finalUserId && mongoose.Types.ObjectId.isValid(finalUserId)) {
      await Cart.updateMany({ user: finalUserId, status: "in-cart" }, { $set: { status: "ordered" } });
    }

    try {
      if (finalUserId) {
        io.to(finalUserId).emit("new_order_placed", savedOrder);
        const customerDoc = await User.findById(finalUserId);
        if (customerDoc?.pushToken) {
          await sendExpoPushNotification(
            customerDoc.pushToken,
            "Order Placed - Verification Pending 🕒",
            `Your order #${savedOrder.orderId} advance payment is being verified by admin.`,
            { orderId: savedOrder.orderId, screen: "orders" }
          );
        }
      }

      io.emit("new_order_placed", savedOrder);

      /* ──────────────────────────────────────────────────────────
         ✅ Notify EVERY admin with the alarm sound.
         • Runs AFTER the order is safely saved.
         • Uses the batch endpoint so all admins are notified
           in a single HTTP call.
         • Sound = alarm.mp3, channel = admin_orders_alarm,
           priority = "max", data.role = "admin".
         • Never throws — wrapped in its own try/catch.
         ────────────────────────────────────────────────────────── */
      try {
        const admins = await User.find({
          isAdmin: true,
          pushToken: { $exists: true, $ne: "" },
        }).select("pushToken name");

        const validAdmins = admins.filter((a: any) =>
          isValidExpoToken(a.pushToken)
        );

        if (validAdmins.length > 0) {
          const adminPayloads = validAdmins.map((admin: any) => ({
            token: String(admin.pushToken),
            title: `🚨 New Order ${savedOrder.orderId}`,
            body: `${savedOrder.userName || "A customer"} placed an order of ₹${savedOrder.totalAmount}. Tap to review.`,
            data: {
              orderId: savedOrder.orderId,
              screen: "admin-orders",
              role: "admin",
            },
            sound: ORDER_ALARM_SOUND,
            channelId: ADMIN_ORDER_CHANNEL_ID,
            priority: "max" as const,
            vibrate: [0, 600, 300, 600, 300],
          }));

          await sendExpoPushBatch(adminPayloads);
          console.log(
            `[createOrder] Sent admin alarm push to ${validAdmins.length} admin(s)`
          );
        }
      } catch (adminPushErr) {
        console.log("Admin push notification error:", adminPushErr);
      }
    } catch (e) {
      console.log("Order creation notification emit warning:", e);
    }

    return res.status(201).json({
      success: true,
      message: "Order placed successfully. Advance verification pending.",
      order: savedOrder,
    });
  } catch (error: any) {
    console.error("Error placing order:", error);
    console.error("Error name:", error?.name);
    console.error("Error message:", error?.message);
    console.error("Error stack:", error?.stack);
    try {
      console.error("Error details:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    } catch (jsonErr) {
      console.error("Error details (non-serializable):", error);
    }
    return res.status(500).json({
      success: false,
      message: "Failed to place order",
      error: error.message,
      errorName: error?.name,
      errorStack: error?.stack,
    });
  }
};

/**
 * PATCH /api/orders/:orderId/verify-advance
 *
 * ✅ UPDATED: The push to the assigned chef now uses the bundled
 *    alarm.mp3 sound + chef_orders_alarm channel + priority "max",
 *    and includes data.role = "chef" and data.chefId so the client
 *    can route + alarm correctly even when the app is closed.
 */
export const verifyAdvancePayment = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findOne({ orderId });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    order.isAdvanceVerified = true;
    order.paymentStatus = "Advance Paid (Verified)";
    order.statusTimeline = order.statusTimeline || [];
    order.statusTimeline.push({
      status: "Advance Verified",
      timestamp: new Date(),
      note: `Admin verified advance payment of ₹${order.advancePaidAmount}`,
    });

    const updatedOrder = await order.save();

    try {
      io.emit("advance_payment_verified", updatedOrder);
      io.emit("order_updated", updatedOrder);

      if (order.userId) {
        io.to(order.userId).emit("advance_payment_verified", updatedOrder);
        io.to(order.userId).emit("order_updated", updatedOrder);
        const userDoc = await User.findById(order.userId);
        if (userDoc?.pushToken) {
          await sendExpoPushNotification(
            userDoc.pushToken,
            "Advance Payment Verified! 🎉",
            `Your advance payment for order #${order.orderId} has been verified by the team.`,
            { orderId: order.orderId, screen: "orders" }
          );
        }
      }

      const chefIdentifier = order.chefId;
      let chefUserDoc: any = null;
      let resolvedChefUserId: string | null = null;

      if (chefIdentifier && mongoose.Types.ObjectId.isValid(chefIdentifier)) {
        const chefDoc = await Chef.findById(chefIdentifier);
        if (chefDoc?.user) {
          chefUserDoc = await User.findById(chefDoc.user);
          resolvedChefUserId = String(chefDoc.user);
          io.to(String(chefDoc.user)).emit("new_chef_order", updatedOrder);
        }
      }
      if (!chefUserDoc && order.chefName) {
        const chefDoc = await Chef.findOne({ name: order.chefName });
        if (chefDoc?.user) {
          chefUserDoc = await User.findById(chefDoc.user);
          resolvedChefUserId = String(chefDoc.user);
          io.to(String(chefDoc.user)).emit("new_chef_order", updatedOrder);
        }
      }
      if (chefIdentifier) {
        io.to(String(chefIdentifier)).emit("new_chef_order", updatedOrder);
        io.to(String(chefIdentifier)).emit("order_updated", updatedOrder);
      }

      /* ──────────────────────────────────────────────────────────
         ✅ Chef push now uses the bundled alarm sound,
         the chef alarm channel, priority "max", and carries
         data.role = "chef" + data.chefId for client-side routing
         and chef-scoped alarms.
         ────────────────────────────────────────────────────────── */
      if (chefUserDoc?.pushToken && isValidExpoToken(chefUserDoc.pushToken)) {
        await sendExpoPush({
          token: String(chefUserDoc.pushToken),
          title: `🔔 New Verified Order ${order.orderId}`,
          body: `${order.userName || "Customer"} → ₹${order.totalAmount}. Tap to accept now!`,
          data: {
            orderId: order.orderId,
            screen: "chef-orders",
            role: "chef",
            chefId: resolvedChefUserId || String(chefUserDoc._id || ""),
          },
          sound: ORDER_ALARM_SOUND,
          channelId: CHEF_ORDER_CHANNEL_ID,
          priority: "max",
          vibrate: [0, 600, 300, 600, 300],
        });
      }
    } catch (e) {
      console.log("Socket emit warning:", e);
    }

    return res.status(200).json({
      success: true,
      message: "Advance payment verified successfully",
      order: updatedOrder,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/orders/chef-orders
 *
 * ✅ UPDATED — Each returned order is enriched with commission fields:
 *    chefOrderIndex, commissionRate, isCommissionFree,
 *    commissionAmount, commissionNote, commissionLabel.
 *
 * The chef's orders are indexed by their OWN chronological sequence
 * (oldest = order 1). The frontend does not need to do any math —
 * it just renders the fields.
 */
export const getChefOrders = async (req: AuthRequest, res: Response) => {
  try {
    const rawUserId = req.user?.userId || req.user?._id || req.user?.id;
    if (!rawUserId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const chefProfile = await Chef.findOne({ user: rawUserId }).populate({
      path: "orderHistory",
      options: { sort: { createdAt: -1 } },
    });

    const queryChefIds: any[] = [];
    if (chefProfile) {
      queryChefIds.push(chefProfile._id.toString());
      queryChefIds.push(chefProfile._id);
    }
    queryChefIds.push(String(rawUserId));
    if (mongoose.Types.ObjectId.isValid(String(rawUserId))) {
      queryChefIds.push(new mongoose.Types.ObjectId(String(rawUserId)));
    }

    // ✅ Fetch ASCENDING so we can assign the 1-based chronological index
    //    (order 1 = oldest) for commission calculation.
    const ordersAsc = await Order.find({
      $or: [
        { chefId: { $in: queryChefIds } },
        { chefName: chefProfile?.name || "" },
        { _id: { $in: chefProfile?.orderHistory || [] } },
      ],
    }).sort({ createdAt: 1 });

    // ✅ Build orderId → 1-based index map
    const indexMap: Record<string, number> = {};
    ordersAsc.forEach((o: any, idx: number) => {
      indexMap[o.orderId] = idx + 1;
    });

    // ✅ Enrich each order with its commission info (additive fields only)
    const enrichedAsc = ordersAsc.map((o: any) => {
      const idx = indexMap[o.orderId] || 1;
      return enrichOrderWithCommission(o, idx);
    });

    // ✅ Return in DESCENDING order (newest first) to preserve the
    //    existing UI behaviour of the chef /all-orders screen.
    const enrichedDesc = enrichedAsc.slice().sort(
      (a: any, b: any) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return res.status(200).json({
      success: true,
      orders: enrichedDesc,
      chef: chefProfile || null,
    });
  } catch (error: any) {
    console.error("Error fetching chef orders:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch chef orders",
      error: error.message,
    });
  }
};

/**
 * PATCH /api/orders/:orderId/status
 *
 * ✅ UPDATED: Now uses an ATOMIC findOneAndUpdate guarded by the
 *    expected previous status. This makes the chef-accept / chef-cancel
 *    path concurrency-safe against the customer cancel endpoint:
 *
 *      • Only ONE of { chef accepts / starts preparing } and
 *        { customer cancels } can win the race.
 *      • The loser receives a clear 409 response and the client
 *        can simply refresh.
 *
 *    ✅ Also sets cancellationSource = "cancelled by chef" and the
 *       refund patch whenever status becomes "Cancelled" — this
 *       covers BOTH the chef tapping Decline AND the admin tapping
 *       "Cancelled" in the dropdown (per product decision: admin
 *       cancellations use the same source string as chef cancellations).
 *
 *    ✅ The request shape (body: { status }) and the response shape
 *       ({ success, message, order }) are UNCHANGED — every existing
 *       caller keeps working without modifications.
 *
 *    ✅ Still sends the customer push notification on every status
 *       change (works whether the customer's app is open, backgrounded,
 *       or killed).
 */
export const updateOrderStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    if (!orderId || !status) {
      return res.status(400).json({ success: false, message: "orderId and status are required." });
    }

    const normalized = String(status).trim();
    const normalizedLower = normalized.toLowerCase();

    const isCashCollected =
      normalizedLower === "cash collected" ||
      normalizedLower === "cash_collected" ||
      normalizedLower === "collected" ||
      normalizedLower === "balance collected";

    const isCancelledStatus = normalizedLower === "cancelled" || normalizedLower === "canceled";

    // ✅ Fetch the CURRENT document first so we can:
    //    • decide the correct expected-previous-status guard
    //    • build the refund patch from the actual payment state
    //    • reuse existing logic for targetDeliveryTime etc.
    const existingOrder = await Order.findOne({ orderId });
    if (!existingOrder) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // ✅ If the order is ALREADY cancelled, refuse to transition it
    //    again (no double cancellation / no resurrection).
    const existingStatusLower = String(existingOrder.orderStatus || "").toLowerCase();
    if (existingStatusLower === "cancelled" || existingStatusLower === "canceled") {
      return res.status(409).json({
        success: false,
        message: "Order is already cancelled.",
        order: existingOrder,
      });
    }

    // ✅ Build the $set payload (mirrors the previous save()-based behaviour).
    const now = new Date();
    const setPayload: any = {};

    const timelinePush: any = {
      status: isCashCollected ? "Balance Collected" : normalized,
      timestamp: now,
      note: isCashCollected
        ? `Balance amount of ₹${existingOrder.balanceAmountToCollect || 0} collected upon delivery`
        : `Order status changed to ${normalized}`,
    };

    if (isCancelledStatus) {
      // ✅ Only two cancellation sources exist: customer + chef.
      //    The admin dropdown uses the same PATCH endpoint as the chef,
      //    so its cancellations are recorded as "cancelled by chef" per
      //    product decision.
      const existingSource = String(existingOrder.cancellationSource || "").trim();
      const resolvedSource = existingSource || CANCELLATION_SOURCE_CHEF;

      setPayload.orderStatus = "Cancelled";
      setPayload.cancellationSource = resolvedSource;
      setPayload.cancellationReason =
        String(existingOrder.cancellationReason || "").trim() || resolvedSource;
      setPayload.cancelledAt = existingOrder.cancelledAt || now;

      // ✅ Refund patch (full advance refund if advance > 0, else ₹0).
      const refundPatch = buildCancellationRefundPatch(existingOrder);
      setPayload.cancellationFee = refundPatch.cancellationFee;
      setPayload.refundAmount = refundPatch.refundAmount;
      setPayload.refundStatus = refundPatch.refundStatus;
    } else if (isCashCollected) {
      setPayload.paymentStatus = "Fully Paid (Balance Collected)";
      setPayload.paymentCaptured = true;
      setPayload.paidAt = now;
      setPayload.orderStatus = "Completed";
      if (!existingOrder.actualDeliveredAt) {
        setPayload.actualDeliveredAt = now;
      }

      // ✅ Auto-mark all still-open schedules as delivered (mirrors old logic).
      if (Array.isArray(existingOrder.deliverySchedules) && existingOrder.deliverySchedules.length > 0) {
        const updatedSchedules = existingOrder.deliverySchedules.map((schedule: any) => {
          const sStatus = String(schedule.status || "").toLowerCase();
          if (
            sStatus !== "delivered" &&
            sStatus !== "completed" &&
            sStatus !== "cash collected"
          ) {
            const timeline = Array.isArray(schedule.statusTimeline) ? schedule.statusTimeline.slice() : [];
            timeline.push({
              status: "Delivered",
              timestamp: now,
              note: "Auto-marked delivered upon balance collection",
            });
            return {
              ...(schedule.toObject ? schedule.toObject() : schedule),
              status: "Delivered",
              actualDeliveredAt: schedule.actualDeliveredAt || now,
              statusTimeline: timeline,
            };
          }
          return schedule.toObject ? schedule.toObject() : schedule;
        });
        setPayload.deliverySchedules = updatedSchedules;
      }
    } else {
      setPayload.orderStatus = normalized;

      if (normalized === "Preparing" || normalized === "Accepted") {
        if (!existingOrder.prepStartedAt) {
          setPayload.prepStartedAt = now;
        }
        if (!existingOrder.targetDeliveryTime) {
          if (existingOrder.estimatedDeliveryAt) {
            setPayload.targetDeliveryTime = existingOrder.estimatedDeliveryAt;
          } else {
            setPayload.targetDeliveryTime = calculateSlotTargetTime(
              (existingOrder as any).deliveryDate || (existingOrder as any).eventDate || "",
              (existingOrder as any).deliveryTimeSlot || (existingOrder as any).eventTime || ""
            );
          }
        }
      }

      if (normalized === "Delivered" || normalized === "Completed") {
        const deliveredAt = existingOrder.actualDeliveredAt || now;
        const target = existingOrder.targetDeliveryTime
          ? new Date(existingOrder.targetDeliveryTime).getTime()
          : now.getTime();
        const graceMs = (existingOrder.gracePeriodMinutes || 0) * 60 * 1000;
        setPayload.actualDeliveredAt = deliveredAt;
        setPayload.deliveredOnTime = now.getTime() <= target + graceMs;
      }
    }

    // ✅ ATOMIC update guarded by the CURRENT status we just read. If
    //    another request (e.g. customer cancel) changed the status in the
    //    tiny window between our read and this update, the update will
    //    match 0 documents and we return a 409 without corrupting state.
    const updatedOrder = await Order.findOneAndUpdate(
      { orderId, orderStatus: existingOrder.orderStatus },
      {
        $set: setPayload,
        $push: { statusTimeline: timelinePush },
      },
      { new: true }
    );

    if (!updatedOrder) {
      const latest = await Order.findOne({ orderId });
      return res.status(409).json({
        success: false,
        message:
          "Order status changed by another request. Please refresh and retry.",
        order: latest,
      });
    }

    try {
      io.emit("order_status_updated", updatedOrder);
      io.emit("order_updated", updatedOrder);
      if (updatedOrder.userId) {
        io.to(updatedOrder.userId).emit("order_status_updated", updatedOrder);
        io.to(updatedOrder.userId).emit("order_updated", updatedOrder);
      }
      if (updatedOrder.chefId) {
        io.to(String(updatedOrder.chefId)).emit("order_status_updated", updatedOrder);
        io.to(String(updatedOrder.chefId)).emit("order_updated", updatedOrder);
      }
    } catch (e) {
      console.log("Socket emit warning:", e);
    }

    /* ──────────────────────────────────────────────────────────
       ✅ Push notification to the CUSTOMER on every status
       change (by chef or admin). Works when the customer's app
       is open, backgrounded, or fully killed.

       • Uses the DEFAULT phone sound (NOT alarm.mp3).
       • data.screen === "orders" → tap opens the customer's Orders tab.
       • data.role === "customer" → lets any customer-side listener
         filter out non-customer pushes.
       • Never throws — wrapped in its own try/catch.
       ────────────────────────────────────────────────────────── */
    try {
      if (updatedOrder.userId && mongoose.Types.ObjectId.isValid(updatedOrder.userId)) {
        const customerDoc = await User.findById(updatedOrder.userId);
        if (customerDoc?.pushToken && isValidExpoToken(customerDoc.pushToken)) {
          const msg = getCustomerStatusMessage(normalized, updatedOrder.orderId);
          await sendExpoPush({
            token: String(customerDoc.pushToken),
            title: msg.title,
            body: msg.body,
            data: {
              orderId: updatedOrder.orderId,
              screen: "orders",
              role: "customer",
              status: normalized,
            },
            sound: "default",
            priority: "high",
          });
        }
      }
    } catch (customerPushErr) {
      console.log("Customer status push error:", customerPushErr);
    }

    return res.status(200).json({
      success: true,
      message: `Order updated successfully`,
      order: updatedOrder,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PATCH /api/orders/:orderId/cancel
 *
 * ✅ Customer-initiated cancellation.
 *
 * Rules enforced here (in addition to the frontend's UX gating):
 *   • Only the authenticated owner can cancel their own order.
 *   • Only an order still in `Placed` status can be cancelled.
 *     (The `Accepted` stage is intentionally blocked — the customer
 *     is directed to contact support instead; the same guard is
 *     enforced by the mobile app's disabled button.)
 *   • `Preparing` (and any later status) is refused with the exact
 *     message the mobile app shows to the customer, plus the
 *     professional disclosure note.
 *   • Concurrency-safe via atomic findOneAndUpdate on { orderId, userId,
 *     orderStatus: "Placed" }.
 *   • Cancellation is idempotent for the SAME customer: if the order is
 *     already cancelled by them, we return 200 with the current state
 *     instead of a confusing error.
 *   • Writes the refund patch (full advancePaidAmount when advance > 0,
 *     fee ₹0, refundStatus = "Refund Initiated (3–4 hrs)").
 *   • Emits the existing `order_updated` + `order_status_updated` events
 *     so all three screens refresh (no new event name needed).
 *   • Sends the standard customer push notification.
 */
export const cancelOrderByCustomer = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId } = req.params;
    const rawUserId = req.user?.userId || req.user?._id || req.user?.id;

    if (!rawUserId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!orderId) {
      return res.status(400).json({ success: false, message: "orderId is required." });
    }

    const userIdStr = String(rawUserId);

    // ✅ Ownership-safe ownership clause — mirrors getMyOrders exactly,
    //    so any user who can SEE the order can also cancel it (if Placed).
    const ownershipClauses: any[] = [{ userId: userIdStr }];
    if (mongoose.Types.ObjectId.isValid(userIdStr)) {
      ownershipClauses.push({ userId: new mongoose.Types.ObjectId(userIdStr) });
    }

    // ✅ Read current state once for good error messages (idempotency,
    //    preparing refusal, not-found vs not-owned disambiguation).
    const preflightOrder = await Order.findOne({
      orderId,
      $or: ownershipClauses,
    });

    if (!preflightOrder) {
      // Disambiguate "not found at all" vs "not owned by this user"
      const anyOrder = await Order.findOne({ orderId });
      if (!anyOrder) {
        return res.status(404).json({ success: false, message: "Order not found" });
      }
      return res.status(403).json({
        success: false,
        message: "You are not allowed to cancel this order.",
      });
    }

    const currentStatusLower = String(preflightOrder.orderStatus || "").toLowerCase();

    // ✅ Idempotency — if it is ALREADY cancelled by this customer, return
    //    the current document with 200 instead of a confusing error.
    if (currentStatusLower === "cancelled" || currentStatusLower === "canceled") {
      const alreadySource = String(preflightOrder.cancellationSource || "").toLowerCase();
      if (alreadySource === CANCELLATION_SOURCE_CUSTOMER) {
        return res.status(200).json({
          success: true,
          message: "Order is already cancelled.",
          order: preflightOrder,
        });
      }
      return res.status(409).json({
        success: false,
        message: "Order is already cancelled.",
        order: preflightOrder,
      });
    }

    // ✅ Refuse once the chef has accepted or begun preparing (or anything after).
    //    The customer is directed to support with the professional disclosure.
    if (
      currentStatusLower === "preparing" ||
      currentStatusLower === "prep" ||
      currentStatusLower === "accepted"
    ) {
      return res.status(400).json({
        success: false,
        message: `${CANCELLATION_NOT_PERMITTED_MESSAGE}\n\n${CANCELLATION_NOT_PERMITTED_NOTE}`,
        order: preflightOrder,
      });
    }

    // ✅ Refuse every other non-cancellable status (Packed, Out for Delivery,
    //    Delivered, Completed, Cash Collected, etc).
    if (currentStatusLower !== "placed") {
      return res.status(400).json({
        success: false,
        message: `${CANCELLATION_NOT_PERMITTED_MESSAGE}\n\n${CANCELLATION_NOT_PERMITTED_NOTE}`,
        order: preflightOrder,
      });
    }

    // ✅ Build the refund patch from the CURRENT document.
    const refundPatch = buildCancellationRefundPatch(preflightOrder);

    const now = new Date();

    // ✅ ATOMIC update guarded by { orderId, userId, orderStatus: "Placed" }.
    //    If the chef's updateOrderStatus has just transitioned this order
    //    out of `Placed`, this update matches 0 docs and we return 409 so
    //    the client simply refreshes.
    const updatedOrder = await Order.findOneAndUpdate(
      {
        orderId,
        orderStatus: "Placed",
        $or: ownershipClauses,
      },
      {
        $set: {
          orderStatus: "Cancelled",
          cancellationSource: CANCELLATION_SOURCE_CUSTOMER,
          cancellationReason: CANCELLATION_SOURCE_CUSTOMER,
          cancelledAt: now,
          cancellationFee: refundPatch.cancellationFee,
          refundAmount: refundPatch.refundAmount,
          refundStatus: refundPatch.refundStatus,
        },
        $push: {
          statusTimeline: {
            status: "Cancelled",
            timestamp: now,
            note: `Order cancelled by customer before preparation started. Refund amount: ₹${refundPatch.refundAmount}.`,
          },
        },
      },
      { new: true }
    );

    if (!updatedOrder) {
      // Lost the race, or the order moved on. Return the fresh state so
      // the client can render the correct status immediately.
      const latest = await Order.findOne({ orderId });
      const latestStatusLower = String(latest?.orderStatus || "").toLowerCase();
      if (
        latestStatusLower === "preparing" ||
        latestStatusLower === "prep" ||
        latestStatusLower === "accepted"
      ) {
        return res.status(400).json({
          success: false,
          message: `${CANCELLATION_NOT_PERMITTED_MESSAGE}\n\n${CANCELLATION_NOT_PERMITTED_NOTE}`,
          order: latest,
        });
      }
      return res.status(409).json({
        success: false,
        message:
          "Order status changed by another request. Please refresh and retry.",
        order: latest,
      });
    }

    // ✅ Broadcast to every screen that already listens for these events.
    try {
      io.emit("order_updated", updatedOrder);
      io.emit("order_status_updated", updatedOrder);
      if (updatedOrder.userId) {
        io.to(updatedOrder.userId).emit("order_updated", updatedOrder);
        io.to(updatedOrder.userId).emit("order_status_updated", updatedOrder);
      }
      if (updatedOrder.chefId) {
        io.to(String(updatedOrder.chefId)).emit("order_updated", updatedOrder);
        io.to(String(updatedOrder.chefId)).emit("order_status_updated", updatedOrder);
      }
    } catch (e) {
      console.log("Socket emit warning:", e);
    }

    // ✅ Customer push — same shape as every other status-change push.
    try {
      if (updatedOrder.userId && mongoose.Types.ObjectId.isValid(updatedOrder.userId)) {
        const customerDoc = await User.findById(updatedOrder.userId);
        if (customerDoc?.pushToken && isValidExpoToken(customerDoc.pushToken)) {
          const msg = getCustomerStatusMessage("Cancelled", updatedOrder.orderId);
          await sendExpoPush({
            token: String(customerDoc.pushToken),
            title: msg.title,
            body: msg.body,
            data: {
              orderId: updatedOrder.orderId,
              screen: "orders",
              role: "customer",
              status: "Cancelled",
              cancellationSource: CANCELLATION_SOURCE_CUSTOMER,
            },
            sound: "default",
            priority: "high",
          });
        }
      }
    } catch (customerPushErr) {
      console.log("Customer cancel push error:", customerPushErr);
    }

    return res.status(200).json({
      success: true,
      message: "Order cancelled successfully.",
      order: updatedOrder,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PATCH /api/orders/:orderId/refund
 *
 * ✅ NEW — Admin-only refund processor.
 *
 * When the admin taps "Process Refund" on the admin /all-orders screen
 * for a cancelled order with refundAmount > 0, this endpoint sets:
 *   • refundStatus = "Refunded"
 *   • refundedAt   = new Date()
 *   • statusTimeline entry
 *
 * The customer's Bill Summary then switches from
 * "Refund initiated — 3–4 hrs" to "Advance amount refunded".
 *
 * The actual money movement (Razorpay / UPI refund) is handled by the
 * ops team outside the app — this endpoint only records the completion.
 */
export const processRefund = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId } = req.params;
    const rawUserId = req.user?.userId || req.user?._id || req.user?.id;

    if (!rawUserId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (!orderId) {
      return res.status(400).json({ success: false, message: "orderId is required." });
    }

    // ✅ Verify the caller is an admin.
    let isAdminCaller = false;
    if (mongoose.Types.ObjectId.isValid(String(rawUserId))) {
      const caller = await User.findById(rawUserId).select("isAdmin");
      isAdminCaller = !!caller?.isAdmin;
    }
    if (!isAdminCaller) {
      return res.status(403).json({ success: false, message: "Admin access required." });
    }

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const statusLower = String(order.orderStatus || "").toLowerCase();
    if (statusLower !== "cancelled" && statusLower !== "canceled") {
      return res.status(400).json({
        success: false,
        message: "Refund can only be processed for a cancelled order.",
        order,
      });
    }

    const refundAmountNum = Number(order.refundAmount || 0);
    if (refundAmountNum <= 0) {
      return res.status(400).json({
        success: false,
        message: "No refund amount due for this order.",
        order,
      });
    }

    const existingRefundStatus = String(order.refundStatus || "").trim();
    if (existingRefundStatus === REFUND_STATUS_REFUNDED) {
      return res.status(200).json({
        success: true,
        message: "Refund already processed.",
        order,
      });
    }

    const now = new Date();

    const updatedOrder = await Order.findOneAndUpdate(
      {
        orderId,
        refundStatus: { $ne: REFUND_STATUS_REFUNDED },
      },
      {
        $set: {
          refundStatus: REFUND_STATUS_REFUNDED,
          refundedAt: now,
        },
        $push: {
          statusTimeline: {
            status: "Refund Processed",
            timestamp: now,
            note: `Refund of ₹${refundAmountNum} processed by admin.`,
          },
        },
      },
      { new: true }
    );

    if (!updatedOrder) {
      const latest = await Order.findOne({ orderId });
      return res.status(409).json({
        success: false,
        message: "Refund state changed by another request. Please refresh.",
        order: latest,
      });
    }

    // ✅ Broadcast to every screen that already listens for these events.
    try {
      io.emit("order_updated", updatedOrder);
      io.emit("order_status_updated", updatedOrder);
      if (updatedOrder.userId) {
        io.to(updatedOrder.userId).emit("order_updated", updatedOrder);
        io.to(updatedOrder.userId).emit("order_status_updated", updatedOrder);
      }
      if (updatedOrder.chefId) {
        io.to(String(updatedOrder.chefId)).emit("order_updated", updatedOrder);
        io.to(String(updatedOrder.chefId)).emit("order_status_updated", updatedOrder);
      }
    } catch (e) {
      console.log("Socket emit warning:", e);
    }

    // ✅ Customer push — informs the customer their refund has been processed.
    try {
      if (updatedOrder.userId && mongoose.Types.ObjectId.isValid(updatedOrder.userId)) {
        const customerDoc = await User.findById(updatedOrder.userId);
        if (customerDoc?.pushToken && isValidExpoToken(customerDoc.pushToken)) {
          await sendExpoPush({
            token: String(customerDoc.pushToken),
            title: "💸 Refund Processed",
            body: `Your refund of ₹${refundAmountNum} for order #${updatedOrder.orderId} has been processed.`,
            data: {
              orderId: updatedOrder.orderId,
              screen: "orders",
              role: "customer",
              status: "Refunded",
            },
            sound: "default",
            priority: "high",
          });
        }
      }
    } catch (customerPushErr) {
      console.log("Customer refund push error:", customerPushErr);
    }

    return res.status(200).json({
      success: true,
      message: "Refund processed successfully.",
      order: updatedOrder,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PATCH /api/orders/:orderId/schedule-status
 *
 * ✅ UPDATED: Now also sends a push notification to the customer
 *    whenever an individual scheduled delivery (meal-box orders)
 *    changes status (chef or admin). Works whether the customer's
 *    app is open, backgrounded, or killed.
 */
export const updateScheduleStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId } = req.params;
    const { dateStr, status } = req.body;

    if (!dateStr || !status) {
      return res.status(400).json({ success: false, message: "dateStr and status required." });
    }

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const normalizedStatus = String(status).trim();
    const normalizedStatusLower = normalizedStatus.toLowerCase();
    const isCashCollectedForSchedule =
      normalizedStatusLower === "cash collected" ||
      normalizedStatusLower === "cash_collected" ||
      normalizedStatusLower === "collected";

    if (!order.deliverySchedules) {
      order.deliverySchedules = [];
    }

    const foundIndex = order.deliverySchedules.findIndex((s) => s.date === dateStr);

    if (foundIndex === -1) {
      order.deliverySchedules.push({
        date: dateStr,
        status: isCashCollectedForSchedule ? "Delivered" : normalizedStatus,
        timeSlot: (order as any).deliveryTimeSlot || "7:00 PM - 9:00 PM",
        address: (order as any).addressDetails || (order as any).deliveryAddress || "",
        latitude: (order as any).latitude,
        longitude: (order as any).longitude,
        statusTimeline: [
          {
            status: isCashCollectedForSchedule ? "Delivered" : normalizedStatus,
            timestamp: new Date(),
            note: `Delivery status for ${dateStr} changed to ${normalizedStatus}`,
          },
        ],
        actualDeliveredAt:
          isCashCollectedForSchedule || normalizedStatus === "Delivered" ? new Date() : undefined,
      } as any);
    } else {
      const schedule = order.deliverySchedules[foundIndex];
      schedule.status = isCashCollectedForSchedule ? "Delivered" : normalizedStatus;
      if (!schedule.statusTimeline) schedule.statusTimeline = [];
      schedule.statusTimeline.push({
        status: isCashCollectedForSchedule ? "Delivered" : normalizedStatus,
        timestamp: new Date(),
        note: `Delivery status for ${dateStr} changed to ${normalizedStatus}`,
      });
      if (isCashCollectedForSchedule || normalizedStatus === "Delivered") {
        schedule.actualDeliveredAt = new Date();
      }
    }

    if (isCashCollectedForSchedule) {
      order.paymentStatus = "Fully Paid (Balance Collected)";
      order.paymentCaptured = true;
      order.paidAt = new Date();
      if (!order.actualDeliveredAt) order.actualDeliveredAt = new Date();
    }

    order.markModified("deliverySchedules");
    const updatedOrder = await order.save();

    try {
      io.emit("schedule_status_updated", { orderId, dateStr, status: normalizedStatus, order: updatedOrder });
      io.emit("order_updated", updatedOrder);
      if (order.userId) {
        io.to(order.userId).emit("schedule_status_updated", { orderId, dateStr, status: normalizedStatus, order: updatedOrder });
        io.to(order.userId).emit("order_updated", updatedOrder);
      }
    } catch (e) {
      console.log("Socket emit warning:", e);
    }

    /* ──────────────────────────────────────────────────────────
       ✅ Push notification to the CUSTOMER for THIS scheduled
       delivery's status change. Works when the customer's app is
       open, backgrounded, or fully killed.

       • Uses the DEFAULT phone sound (NOT alarm.mp3).
       • Includes the affected date in the title so the customer
         knows which delivery changed.
       • data.screen === "orders" → tap opens the customer's Orders tab.
       • data.role === "customer".
       • Never throws — wrapped in its own try/catch.
       ────────────────────────────────────────────────────────── */
    try {
      if (order.userId && mongoose.Types.ObjectId.isValid(order.userId)) {
        const customerDoc = await User.findById(order.userId);
        if (customerDoc?.pushToken && isValidExpoToken(customerDoc.pushToken)) {
          const baseMsg = getCustomerStatusMessage(normalizedStatus, order.orderId);
          await sendExpoPush({
            token: String(customerDoc.pushToken),
            title: `${baseMsg.title} • ${dateStr}`,
            body: baseMsg.body,
            data: {
              orderId: order.orderId,
              screen: "orders",
              role: "customer",
              status: normalizedStatus,
              scheduleDate: dateStr,
            },
            sound: "default",
            priority: "high",
          });
        }
      }
    } catch (customerPushErr) {
      console.log("Customer schedule push error:", customerPushErr);
    }

    return res.status(200).json({ success: true, message: "Delivery schedule updated", order: updatedOrder });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PATCH /api/orders/:orderId/extend-timer
 */
export const extendOrderTimer = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId } = req.params;
    const { additionalMinutes = 5 } = req.body;

    const order = await Order.findOne({ orderId });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    order.gracePeriodMinutes = (order.gracePeriodMinutes || 0) + Number(additionalMinutes);
    if (order.targetDeliveryTime) {
      const currentTarget = new Date(order.targetDeliveryTime).getTime();
      order.targetDeliveryTime = new Date(currentTarget + Number(additionalMinutes) * 60 * 1000);
    }

    const updatedOrder = await order.save();
    return res.status(200).json({ success: true, message: "Timer extended", order: updatedOrder });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/orders/my-orders
 */
export const getMyOrders = async (req: AuthRequest, res: Response) => {
  try {
    const rawUserId = req.user?.userId || req.user?._id || req.user?.id;
    if (!rawUserId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const userIdStr = String(rawUserId);
    const queryConditions: any[] = [{ userId: userIdStr }];

    if (mongoose.Types.ObjectId.isValid(userIdStr)) {
      queryConditions.push({ userId: new mongoose.Types.ObjectId(userIdStr) });
    }

    const userDoc = await User.findById(rawUserId);
    if (userDoc && userDoc.phone) {
      queryConditions.push({ phone: userDoc.phone });
      queryConditions.push({ userPhone: userDoc.phone });
      queryConditions.push({ userName: userDoc.name });
    } else if (req.user?.phone) {
      queryConditions.push({ phone: req.user.phone });
      queryConditions.push({ userPhone: req.user.phone });
    }

    const orders = await Order.find({ $or: queryConditions }).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, orders });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PATCH /api/orders/:orderId/pause
 */
export const pauseOrderDelivery = async (req: AuthRequest, res: Response) => {
  try {
    const rawUserId = req.user?.userId || req.user?._id || req.user?.id;
    const { orderId } = req.params;
    const { dateStr } = req.body;
    if (!rawUserId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const order = await Order.findOne({ orderId, $or: [{ userId: String(rawUserId) }, { userId: rawUserId }] });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    if (dateStr) {
      const pausedList = (order as any).pausedDates || [];
      if (!pausedList.includes(dateStr)) pausedList.push(dateStr);
      (order as any).pausedDates = pausedList;

      if (!order.deliverySchedules) order.deliverySchedules = [];
      const foundIdx = order.deliverySchedules.findIndex((s) => s.date === dateStr);
      if (foundIdx !== -1) {
        order.deliverySchedules[foundIdx].status = "Paused";
      } else {
        order.deliverySchedules.push({
          date: dateStr,
          status: "Paused",
          timeSlot: (order as any).deliveryTimeSlot || "7:00 PM - 9:00 PM",
          address: (order as any).addressDetails || "",
          latitude: (order as any).latitude,
          longitude: (order as any).longitude,
          statusTimeline: [{ status: "Paused", timestamp: new Date() }],
        } as any);
      }
      order.markModified("deliverySchedules");
    }

    const updatedOrder = await order.save();
    return res.status(200).json({ success: true, message: "Paused successfully", order: updatedOrder });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PATCH /api/orders/:orderId/unpause
 */
export const unpauseOrderDelivery = async (req: AuthRequest, res: Response) => {
  try {
    const rawUserId = req.user?.userId || req.user?._id || req.user?.id;
    const { orderId } = req.params;
    const { dateStr } = req.body;
    if (!rawUserId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const order = await Order.findOne({ orderId, $or: [{ userId: String(rawUserId) }, { userId: rawUserId }] });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    if (dateStr && Array.isArray((order as any).pausedDates)) {
      (order as any).pausedDates = (order as any).pausedDates.filter((d: string) => d !== dateStr);
    }
    if (dateStr && order.deliverySchedules) {
      const foundIdx = order.deliverySchedules.findIndex((s) => s.date === dateStr);
      if (foundIdx !== -1) {
        order.deliverySchedules[foundIdx].status = "Scheduled";
        order.markModified("deliverySchedules");
      }
    }

    const updatedOrder = await order.save();
    return res.status(200).json({ success: true, message: "Unpaused successfully", order: updatedOrder });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PATCH /api/orders/:orderId/reschedule
 */
export const rescheduleOrderDelivery = async (req: AuthRequest, res: Response) => {
  try {
    const rawUserId = req.user?.userId || req.user?._id || req.user?.id;
    const { orderId } = req.params;
    const { oldDate, newDate, upcomingDeliveries, address } = req.body;
    if (!rawUserId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const order = await Order.findOne({ orderId, $or: [{ userId: String(rawUserId) }, { userId: rawUserId }] });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    if (Array.isArray(upcomingDeliveries)) {
      (order as any).upcomingDeliveries = sortDatesAscending(upcomingDeliveries);
    } else if (oldDate && newDate && Array.isArray((order as any).upcomingDeliveries)) {
      const updatedDeliveries = (order as any).upcomingDeliveries.map((d: string) => d === oldDate ? newDate : d);
      (order as any).upcomingDeliveries = sortDatesAscending(updatedDeliveries);
    }

    const updatedOrder = await order.save();
    return res.status(200).json({ success: true, message: "Rescheduled successfully", order: updatedOrder });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/orders/:orderId/feedback
 */
export const submitOrderFeedback = async (req: AuthRequest, res: Response) => {
  try {
    const rawUserId = req.user?.userId || req.user?._id || req.user?.id;
    const { orderId } = req.params;
    const { rating, comment } = req.body;
    if (!rawUserId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const order = await Order.findOne({ orderId });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    const parsedRating = Number(rating);
    const files = (req.files as Express.Multer.File[]) || [];
    const uploadedImages: Array<{ url: string; cloudinaryId: string }> = [];

    for (const file of files) {
      const uploadRes = await uploadBufferToCloudinary(file.buffer);
      uploadedImages.push({ url: uploadRes.secure_url, cloudinaryId: uploadRes.public_id });
    }

    const trimmedComment = String(comment || "").trim();

    order.feedback = {
      rating: parsedRating,
      comment: trimmedComment,
      images: uploadedImages,
      isSubmitted: true,
      submittedAt: new Date(),
    };

    const updatedOrder = await order.save();

    try {
      const chefIdentifier = order.chefId;
      const chefNameStr = order.chefName;

      let chefDoc: any = null;

      if (chefIdentifier && mongoose.Types.ObjectId.isValid(chefIdentifier)) {
        chefDoc = await Chef.findById(chefIdentifier);
        if (!chefDoc) {
          chefDoc = await Chef.findOne({ user: chefIdentifier });
        }
      }
      if (!chefDoc && chefNameStr) {
        chefDoc = await Chef.findOne({ name: chefNameStr });
      }

      if (chefDoc) {
        const existingReviews: any[] = Array.isArray(chefDoc.reviews) ? chefDoc.reviews : [];
        const alreadyExists = existingReviews.some((r: any) => r && r.orderId === order.orderId);

        if (!alreadyExists) {
          let userNameForReview = order.userName || "Customer";
          let userAvatarForReview = "";

          if (order.userId && mongoose.Types.ObjectId.isValid(order.userId)) {
            try {
              const customerDoc = await User.findById(order.userId);
              if (customerDoc) {
                if (customerDoc.name) userNameForReview = customerDoc.name;
                if (customerDoc.avatar) userAvatarForReview = customerDoc.avatar;
              }
            } catch (userLookupErr) {
              // Silently ignore
            }
          }

          const newReviewItem = {
            orderId: order.orderId,
            userId: String(order.userId || ""),
            userName: userNameForReview,
            userAvatar: userAvatarForReview,
            rating: parsedRating,
            comment: trimmedComment,
            images: uploadedImages.map((img) => ({
              url: img.url,
              cloudinaryId: img.cloudinaryId || "",
            })),
            createdAt: new Date(),
          };

          if (!Array.isArray(chefDoc.reviews)) {
            chefDoc.reviews = [];
          }
          chefDoc.reviews.push(newReviewItem);

          await chefDoc.save();

          try {
            await recalculateChefRating(chefDoc._id);
          } catch (recalcErr) {
            console.log("Recalculate chef rating warning:", recalcErr);
          }

          try {
            const chefUserId = chefDoc.user ? String(chefDoc.user) : null;
            if (chefUserId) {
              io.to(chefUserId).emit("new_chef_review", {
                chefId: String(chefDoc._id),
                orderId: order.orderId,
                rating: parsedRating,
                comment: trimmedComment,
                userName: userNameForReview,
                userAvatar: userAvatarForReview,
                images: uploadedImages,
                createdAt: newReviewItem.createdAt,
              });
            }
          } catch (emitErr) {
            console.log("Socket emit warning (new_chef_review):", emitErr);
          }
        }
      }
    } catch (chefReviewErr) {
      console.log("Error mirroring feedback into Chef document:", chefReviewErr);
    }

    return res.status(200).json({ success: true, message: "Feedback submitted", order: updatedOrder });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/orders/:orderId
 */
export const getOrderById = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findOne({ orderId });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    return res.status(200).json({ success: true, order });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/admin/orders
 *
 * ✅ UPDATED — Each returned order is enriched with commission fields
 *    (chefOrderIndex, commissionRate, isCommissionFree,
 *    commissionAmount, commissionNote, commissionLabel).
 *
 * Indexing is per-chef: each chef's orders are sorted chronologically
 * (oldest = order 1) and the same commission rule is applied. This
 * lets the admin screen show the 18% commission amount (₹) that
 * applies to that specific order from that chef's perspective.
 */
export const getAllOrders = async (req: AuthRequest, res: Response) => {
  try {
    const rawUserId = req.user?.userId || req.user?._id || req.user?.id;
    if (!rawUserId) return res.status(401).json({ success: false, message: "Unauthorized" });

    // ✅ Fetch ASCENDING so we can group by chef and assign the 1-based
    //    chronological index (order 1 = oldest) within each chef's own
    //    sequence of orders.
    const allOrdersAsc = await Order.find({}).sort({ createdAt: 1 });

    // ✅ Group by chef (prefer chefId; fall back to chefName; else "unassigned")
    const chefGroups: Record<string, any[]> = {};
    allOrdersAsc.forEach((o: any) => {
      const key = String(o.chefId || o.chefName || "unassigned");
      if (!chefGroups[key]) chefGroups[key] = [];
      chefGroups[key].push(o);
    });

    // ✅ Build orderId → 1-based index map (per chef)
    const indexMap: Record<string, number> = {};
    Object.values(chefGroups).forEach((group) => {
      group.forEach((o: any, idx: number) => {
        indexMap[o.orderId] = idx + 1;
      });
    });

    // ✅ Enrich each order with its commission info
    const enrichedAsc = allOrdersAsc.map((o: any) => {
      const idx = indexMap[o.orderId] || 1;
      return enrichOrderWithCommission(o, idx);
    });

    // ✅ Return in DESCENDING order (newest first) to preserve the
    //    existing UI behaviour of the admin /all-orders screen.
    const enrichedDesc = enrichedAsc.slice().sort(
      (a: any, b: any) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return res.status(200).json({
      success: true,
      count: enrichedDesc.length,
      orders: enrichedDesc,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};