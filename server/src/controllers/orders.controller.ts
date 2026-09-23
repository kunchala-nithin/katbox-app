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
 *    ✅ After the order is saved, EVERY user with isAdmin === true
 *       receives an Expo push with the bundled alarm.mp3 sound +
 *       admin_orders_alarm channel + data.role = "admin". This makes
 *       the admin's phone ring even when the app is fully closed.
 *
 * ✅ NEW (Option A): Homemade & QuickBites orders are AUTO-VERIFIED
 *    inside this handler. Because these flows don't require a manual
 *    45% advance:
 *      • If the user paid the full amount online via Cashfree, the
 *        order lands with paymentStatus = "Paid" (Cashfree already
 *        verified server-side).
 *      • If the user chose Cash on Delivery, the order lands with
 *        paymentStatus = "Payment Pending (COD)" and isAdvanceVerified
 *        = true (nothing to verify).
 *    In BOTH cases we immediately:
 *      • flip isAdvanceVerified to true
 *      • emit "advance_payment_verified", "new_chef_order" and
 *        "order_updated" socket events
 *      • fire the chef alarm push (alarm.mp3 + chef_orders_alarm
 *        channel + priority "max")
 *    Mealbox & Catering orders are UNAFFECTED — they still require
 *    the admin to tap "Payment Received" to notify the chef.
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
    } = req.body;

    // ✅ Normalize coordinates once (works for JSON and multipart/form-data)
    const resolvedLatitude = parseNumberOrUndefined(latitude);
    const resolvedLongitude = parseNumberOrUndefined(longitude);

    const finalUserId = String(rawUserId || userId || "");

    let finalUserPhone = String(
      userPhone ||
      phone ||
      orderDetails?.contactPhone ||
      cart?.userPhone ||
      cart?.orderDetails?.contactPhone ||
      req.user?.phone ||
      ""
    );

    let finalAlternatePhone = String(
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
            finalUserPhone = String(userCart.userPhone || userCart.orderDetails?.contactPhone || "");
          }
          if (!finalAlternatePhone) {
            finalAlternatePhone = String(userCart.alternatePhone || userCart.orderDetails?.alternatePhone || "");
          }
        }
      }

      if (!finalUserPhone) {
        const userObj = await User.findById(finalUserId);
        if (userObj && userObj.phone) {
          finalUserPhone = userObj.phone;
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
    const effectiveChefId = String(chefId || "");
    const effectiveChefName = chefName || restaurantName || "";
    const effectiveRestaurantName = restaurantName || chefName || "";

    // ✅ Normalize the incoming serviceType to lowercase so we always
    // compare apples-to-apples when choosing the correct discriminator.
    const resolvedServiceType = serviceType ? String(serviceType).toLowerCase() : "mealbox";

    const resolvedAddress = String(deliveryAddress || addressDetails || "");

    const numericTotal = Number(totalAmount) || 0;
    const finalAdvance = advancePaidAmount !== undefined ? Number(advancePaidAmount) : Math.round(numericTotal * 0.45 * 100) / 100;
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
    let finalDeliverySlotLabel = String(deliverySlot || deliveryTimeSlot || "").trim();
    let finalDeliveryDateLabel = String(deliveryDate || "").trim();

    if (resolvedEstimatedDeliveryAt) {
      const timeStr = formatTimeShort(resolvedEstimatedDeliveryAt);
      const dateStr = formatDateShort(orderPlacedAt);

      if (quickBitesFlag) {
        // ✅ Just the time, e.g. "4:30 PM"
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

    // ✅ Compute auto-verification flags for Homemade/QuickBites.
    //    These flows don't require a manual 45% advance check:
    //      • If the user paid online (Cashfree) → payment already verified server-side.
    //      • If the user chose COD → nothing to verify.
    const isHomemadeOrQuickBites =
      resolvedServiceType === "homemade" ||
      resolvedServiceType === "quickbites";

    // Determine the persisted paymentMethod for the new order.
    // For Homemade/QuickBites the client sends either "online" (Cashfree full
    // payment — the Cashfree verify endpoint would have been used, but for the
    // direct-order path we treat the incoming flag as authoritative) or "cod".
    const incomingPaymentMethod = String(paymentMethod || "").toLowerCase();
    const isCodOrder = incomingPaymentMethod === "cod";

    // Compute the initial paymentStatus based on the flow:
    //  - Homemade/QuickBites COD      → "Payment Pending (COD)"
    //  - Homemade/QuickBites online   → "Paid"
    //  - Mealbox/Catering             → "Verification Pending" (unchanged)
    let initialPaymentStatus = "Verification Pending";
    let initialIsAdvanceVerified = false;

    if (isHomemadeOrQuickBites) {
      initialIsAdvanceVerified = true;
      initialPaymentStatus = isCodOrder ? "Payment Pending (COD)" : "Paid";
    }

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

      const newHomemadeOrder = new ModelToUse({
        orderId: generatedOrderId,
        userId: finalUserId,
        userName: userName || "",
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
        // ✅ Persist geo coordinates for map pinning
        latitude: resolvedLatitude,
        longitude: resolvedLongitude,
        subtotal: Number(subtotal) || 0,
        deliveryPrice: Number(deliveryPrice) || 0,
        discount: Number(discount) || 0,
        appliedCoupon: appliedCoupon || "",
        totalAmount: numericTotal,
        // ✅ For Homemade/QuickBites online (Cashfree), the full amount is
        // paid at order time → advance = total, balance = 0.
        // For COD, advance = 0, balance = total.
        // The client (CheckOutScreen) sends the correct values in
        // `advancePaidAmount` and `balanceAmountToCollect` — we honour them
        // but fall back to computing them correctly if missing.
        advancePaidAmount: isCodOrder
          ? 0
          : (advancePaidAmount !== undefined
              ? Number(advancePaidAmount)
              : numericTotal),
        balanceAmountToCollect: isCodOrder
          ? (balanceAmountToCollect !== undefined
              ? Number(balanceAmountToCollect)
              : numericTotal)
          : (balanceAmountToCollect !== undefined
              ? Number(balanceAmountToCollect)
              : 0),
        utrNumber: utrNumber || "",
        advancePaymentScreenshot: screenshotData,
        // ✅ Auto-verify for Homemade/QuickBites
        isAdvanceVerified: initialIsAdvanceVerified,
        paymentMethod: paymentMethod || (isCodOrder ? "cod" : "online"),
        paymentStatus: initialPaymentStatus,
        orderStatus: "Placed",
        statusTimeline: [
          {
            status: "Placed",
            timestamp: orderPlacedAt,
            note: isHomemadeOrQuickBites
              ? (isCodOrder
                  ? "COD order placed - payment to be collected on delivery"
                  : "Online payment confirmed - order placed")
              : `Advance submitted (UTR: ${utrNumber || 'Screenshot Provided'}) - Verification Pending`,
          },
        ],
      });

      savedOrder = await newHomemadeOrder.save();
    }
    else if (resolvedServiceType === "catering") {
      const newCateringOrder = new CateringOrderModel({
        orderId: generatedOrderId,
        userId: finalUserId,
        userName: userName || "",
        userPhone: finalUserPhone,
        alternatePhone: finalAlternatePhone,
        chefId: effectiveChefId,
        chefName: effectiveChefName,
        chefPhone: resolvedChefPhone,
        serviceType: "catering",
        menuName: menuName || "Catering Platter",
        menuImage: menuImage || restaurantImage || "",
        addressDetails: resolvedAddress,
        restaurantName: effectiveRestaurantName,
        restaurantImage: restaurantImage || menuImage || "",
        occasion: occasion || "Event",
        guests: Number(guests) || 0,
        eventDate: eventDate || deliveryDate || "",
        eventTime: eventTime || deliveryTimeSlot || "",
        deliveryType: deliveryType || "Standard",
        pricePerPlate: Number(pricePerPlate) || 0,
        addons: Array.isArray(addons) ? addons : [],
        selections: selections || null,
        items: items || [],
        // ✅ Timestamps for downstream UIs
        orderPlacedAt,
        estimatedDeliveryAt: resolvedEstimatedDeliveryAt,
        deliveryWindowMinutes: resolvedWindowMinutes,
        // ✅ Persist geo coordinates for map pinning
        latitude: resolvedLatitude,
        longitude: resolvedLongitude,
        subtotal: Number(subtotal) || 0,
        deliveryPrice: Number(deliveryPrice) || 0,
        discount: Number(discount) || 0,
        appliedCoupon: appliedCoupon || "",
        totalAmount: numericTotal,
        advancePaidAmount: finalAdvance,
        balanceAmountToCollect: finalBalance,
        utrNumber: utrNumber || "",
        advancePaymentScreenshot: screenshotData,
        isAdvanceVerified: false,
        paymentMethod: paymentMethod || "cod",
        paymentStatus: "Verification Pending",
        orderStatus: "Placed",
        statusTimeline: [
          { status: "Placed", timestamp: orderPlacedAt, note: `Advance submitted (UTR: ${utrNumber || 'Screenshot Provided'}) - Verification Pending` },
        ],
      });

      savedOrder = await newCateringOrder.save();
    }
    else {
      // ✅ Copy coordinates onto each schedule as well so per-schedule
      // map actions can pin the exact drop location.
      const initialSchedules = sortedDeliveries.map((dateItem: string) => ({
        date: dateItem,
        status: "Scheduled",
        timeSlot: deliveryTimeSlot || "7:00 PM - 9:00 PM",
        address: resolvedAddress,
        latitude: resolvedLatitude,
        longitude: resolvedLongitude,
        statusTimeline: [
          { status: "Scheduled", timestamp: orderPlacedAt, note: `Delivery scheduled for ${dateItem}` },
        ],
      }));

      const newMealBoxOrder = new MealBoxOrderModel({
        orderId: generatedOrderId,
        userId: finalUserId,
        userName: userName || "",
        userPhone: finalUserPhone,
        alternatePhone: finalAlternatePhone,
        chefId: effectiveChefId,
        chefName: effectiveChefName,
        chefPhone: resolvedChefPhone,
        serviceType: "mealbox",
        menuName: menuName || "Meal Plan",
        menuImage: menuImage || "",
        durationType: durationType || "",
        deliveryTimeSlot: deliveryTimeSlot || "7:00 PM - 9:00 PM",
        addressDetails: resolvedAddress,
        deliveryDate: deliveryDate || "",
        upcomingDeliveries: sortedDeliveries,
        deliverySchedules: initialSchedules,
        pausedDates: [],
        selections: selections || null,
        items: items || [],
        // ✅ Timestamps for downstream UIs
        orderPlacedAt,
        estimatedDeliveryAt: resolvedEstimatedDeliveryAt,
        deliveryWindowMinutes: resolvedWindowMinutes,
        // ✅ Persist geo coordinates for map pinning
        latitude: resolvedLatitude,
        longitude: resolvedLongitude,
        subtotal: Number(subtotal) || 0,
        deliveryPrice: Number(deliveryPrice) || 0,
        discount: Number(discount) || 0,
        appliedCoupon: appliedCoupon || "",
        totalAmount: numericTotal,
        advancePaidAmount: finalAdvance,
        balanceAmountToCollect: finalBalance,
        utrNumber: utrNumber || "",
        advancePaymentScreenshot: screenshotData,
        isAdvanceVerified: false,
        paymentMethod: paymentMethod || "cod",
        paymentStatus: "Verification Pending",
        orderStatus: "Placed",
        statusTimeline: [
          { status: "Placed", timestamp: orderPlacedAt, note: `Advance submitted (UTR: ${utrNumber || 'Screenshot Provided'}) - Verification Pending` },
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
            isHomemadeOrQuickBites
              ? (isCodOrder ? "Order Placed - Cash on Delivery 🕒" : "Order Placed - Payment Confirmed ✅")
              : "Order Placed - Verification Pending 🕒",
            isHomemadeOrQuickBites
              ? (isCodOrder
                  ? `Your order #${savedOrder.orderId} has been placed. Please keep ₹${savedOrder.balanceAmountToCollect} ready for delivery.`
                  : `Your order #${savedOrder.orderId} has been placed successfully.`)
              : `Your order #${savedOrder.orderId} advance payment is being verified by admin.`,
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

      /* ──────────────────────────────────────────────────────────
         ✅ NEW (Option A) — Auto-notify the chef for
         Homemade / QuickBites orders.

         Because these flows don't require manual admin verification
         of a 45% advance, we skip the admin-verify step entirely and
         immediately trigger the same socket events + chef alarm push
         that `verifyAdvancePayment` fires for Mealbox/Catering.

         Mealbox & Catering are UNAFFECTED — they still wait for the
         admin to tap "Payment Received".
         ────────────────────────────────────────────────────────── */
      if (isHomemadeOrQuickBites && savedOrder) {
        try {
          // Emit the same socket events that verifyAdvancePayment emits
          io.emit("advance_payment_verified", savedOrder);
          io.emit("order_updated", savedOrder);

          if (savedOrder.userId) {
            io.to(String(savedOrder.userId)).emit("advance_payment_verified", savedOrder);
            io.to(String(savedOrder.userId)).emit("order_updated", savedOrder);
          }

          // Resolve the chef's user document to find their push token
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

          // Fire the chef alarm push — same config used by verifyAdvancePayment
          if (chefUserDoc?.pushToken && isValidExpoToken(chefUserDoc.pushToken)) {
            await sendExpoPush({
              token: String(chefUserDoc.pushToken),
              title: `🔔 New ${resolvedServiceType === "quickbites" ? "QuickBites" : "Homemade"} Order ${savedOrder.orderId}`,
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
              `[createOrder] Auto-notified chef for ${resolvedServiceType} order ${savedOrder.orderId}`
            );
          }
        } catch (autoChefNotifyErr) {
          console.log("Auto chef-notify error (Homemade/QuickBites):", autoChefNotifyErr);
        }
      }
    } catch (e) {
      console.log("Order creation notification emit warning:", e);
    }

    return res.status(201).json({
      success: true,
      message: isHomemadeOrQuickBites
        ? (isCodOrder
            ? "Order placed successfully. Payment to be collected on delivery."
            : "Order placed successfully. Payment confirmed.")
        : "Order placed successfully. Advance verification pending.",
      order: savedOrder,
    });
  } catch (error: any) {
    console.error("Error placing order:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to place order",
      error: error.message,
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

    const orders = await Order.find({
      $or: [
        { chefId: { $in: queryChefIds } },
        { chefName: chefProfile?.name || "" },
        { _id: { $in: chefProfile?.orderHistory || [] } },
      ],
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      orders,
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
 * ✅ UPDATED: Now also sends a push notification to the customer
 *    whenever the order status changes (chef or admin). Works
 *    whether the customer's app is open, backgrounded, or killed.
 */
export const updateOrderStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const normalized = String(status).trim();
    const normalizedLower = normalized.toLowerCase();
    order.statusTimeline = order.statusTimeline || [];

    const isCashCollected =
      normalizedLower === "cash collected" ||
      normalizedLower === "cash_collected" ||
      normalizedLower === "collected" ||
      normalizedLower === "balance collected";

    if (isCashCollected) {
      order.paymentStatus = "Fully Paid (Balance Collected)";
      order.paymentCaptured = true;
      order.paidAt = new Date();
      order.orderStatus = "Completed";
      if (!order.actualDeliveredAt) {
        order.actualDeliveredAt = new Date();
      }
      order.statusTimeline.push({
        status: "Balance Collected",
        timestamp: new Date(),
        note: `Balance amount of ₹${order.balanceAmountToCollect || 0} collected upon delivery`,
      });

      if (Array.isArray(order.deliverySchedules) && order.deliverySchedules.length > 0) {
        order.deliverySchedules.forEach((schedule: any) => {
          const sStatus = String(schedule.status || "").toLowerCase();
          if (sStatus !== "delivered" && sStatus !== "completed" && sStatus !== "cash collected") {
            schedule.status = "Delivered";
            if (!schedule.actualDeliveredAt) {
              schedule.actualDeliveredAt = new Date();
            }
            if (!schedule.statusTimeline) schedule.statusTimeline = [];
            schedule.statusTimeline.push({
              status: "Delivered",
              timestamp: new Date(),
              note: "Auto-marked delivered upon balance collection",
            });
          }
        });
        order.markModified("deliverySchedules");
      }
    } else {
      order.orderStatus = normalized;
      order.statusTimeline.push({
        status: normalized,
        timestamp: new Date(),
        note: `Order status changed to ${normalized}`,
      });

      if (normalized === "Preparing" || normalized === "Accepted") {
        if (!order.prepStartedAt) {
          order.prepStartedAt = new Date();
        }
        if (!order.targetDeliveryTime) {
          // ✅ Prefer the persisted estimatedDeliveryAt if we have one
          if (order.estimatedDeliveryAt) {
            order.targetDeliveryTime = order.estimatedDeliveryAt;
          } else {
            order.targetDeliveryTime = calculateSlotTargetTime(
              (order as any).deliveryDate || (order as any).eventDate || "",
              (order as any).deliveryTimeSlot || (order as any).eventTime || ""
            );
          }
        }
      }

      if (normalized === "Delivered" || normalized === "Completed") {
        order.actualDeliveredAt = order.actualDeliveredAt || new Date();
        const target = order.targetDeliveryTime ? new Date(order.targetDeliveryTime).getTime() : Date.now();
        const graceMs = (order.gracePeriodMinutes || 0) * 60 * 1000;
        order.deliveredOnTime = Date.now() <= target + graceMs;
      }
    }

    const updatedOrder = await order.save();

    try {
      io.emit("order_status_updated", updatedOrder);
      io.emit("order_updated", updatedOrder);
      if (order.userId) {
        io.to(order.userId).emit("order_status_updated", updatedOrder);
        io.to(order.userId).emit("order_updated", updatedOrder);
      }
      if (order.chefId) {
        io.to(String(order.chefId)).emit("order_status_updated", updatedOrder);
        io.to(String(order.chefId)).emit("order_updated", updatedOrder);
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
      if (order.userId && mongoose.Types.ObjectId.isValid(order.userId)) {
        const customerDoc = await User.findById(order.userId);
        if (customerDoc?.pushToken && isValidExpoToken(customerDoc.pushToken)) {
          const msg = getCustomerStatusMessage(normalized, order.orderId);
          await sendExpoPush({
            token: String(customerDoc.pushToken),
            title: msg.title,
            body: msg.body,
            data: {
              orderId: order.orderId,
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
 */
export const getAllOrders = async (req: AuthRequest, res: Response) => {
  try {
    const rawUserId = req.user?.userId || req.user?._id || req.user?.id;
    if (!rawUserId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const orders = await Order.find({}).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, count: orders.length, orders });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};