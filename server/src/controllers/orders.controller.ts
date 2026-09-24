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
   ✅ HELPER — Safely parse a value that may arrive as a JSON
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
   ✅ HELPER — Safely parse a numeric coordinate value.
   ───────────────────────────────────────────────────────────────── */
const parseNumberOrUndefined = (val: any): number | undefined => {
  if (val === undefined || val === null || val === "") return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
};

/* ─────────────────────────────────────────────────────────────────
   ✅ HELPER — Format an absolute Date into "4:30 PM".
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
   ✅ HELPER — Format an absolute Date into "17 Sep".
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
   ✅ HELPER — Determine whether a service type is advance-based.
   ───────────────────────────────────────────────────────────────── */
const isAdvanceBasedService = (serviceType: string): boolean => {
  const s = String(serviceType || "").toLowerCase();
  return s === "catering" || s === "mealbox";
};

const isHomemadeLikeService = (serviceType: string): boolean => {
  const s = String(serviceType || "").toLowerCase();
  return s === "homemade" || s === "quickbites";
};

/* ─────────────────────────────────────────────────────────────────
   ✅ HELPER — Build the initial orderStatus for a freshly-created
   order based on service type and payment method.

   ✅ REVISED BUSINESS RULE:
     • Any ONLINE-paid order (Cashfree success) is AUTO-ACCEPTED
       immediately. The chef is notified right away — the admin does
       NOT need to tap "Accept".
         → orderStatus = "Accepted"
         → adminAcceptedAt = orderPlacedAt
         → adminAcceptedBy = "system:cashfree"

     • Any COD order (Homemade/QuickBites only) starts as "Placed"
       and waits for the ADMIN to accept. The chef is NOT notified
       until the admin accepts.
         → orderStatus = "Placed"
         → adminAcceptedAt = null
         → adminAcceptedBy = ""

   The `autoAccepted` boolean returned by this helper tells the
   caller whether it should immediately notify the chef.
   ───────────────────────────────────────────────────────────────── */
const buildInitialStatuses = (
  serviceType: string,
  paymentMethod: string,
  totalAmount: number,
  advancePaidAmount: number
): {
  orderStatus: string;
  paymentStatus: string;
  isAdvanceVerified: boolean;
  autoAccepted: boolean;
} => {
  const isAdvance = isAdvanceBasedService(serviceType);
  const isHomemadeLike = isHomemadeLikeService(serviceType);
  const isOnline = String(paymentMethod || "").toLowerCase() === "online";

  if (isAdvance) {
    // Catering / Mealbox — always online (Cashfree advance), auto-accept.
    if (isOnline && advancePaidAmount > 0) {
      return {
        orderStatus: "Accepted",
        paymentStatus: "Advance Paid (Verified)",
        isAdvanceVerified: true,
        autoAccepted: true,
      };
    }
    // Fallback (should not happen in the new flow)
    return {
      orderStatus: "Placed",
      paymentStatus: "Verification Pending",
      isAdvanceVerified: false,
      autoAccepted: false,
    };
  }

  if (isHomemadeLike) {
    if (isOnline) {
      // Homemade / QuickBites online — auto-accept (paid in full).
      return {
        orderStatus: "Accepted",
        paymentStatus: "Paid",
        isAdvanceVerified: true,
        autoAccepted: true,
      };
    }
    // COD — wait for admin acceptance.
    return {
      orderStatus: "Placed",
      paymentStatus: "Payment Pending (COD)",
      isAdvanceVerified: true,
      autoAccepted: false,
    };
  }

  // Fallback for unknown service types
  return {
    orderStatus: "Placed",
    paymentStatus: "Verification Pending",
    isAdvanceVerified: false,
    autoAccepted: false,
  };
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
   ✅ Wrapper delegating to the centralized `sendExpoPush` helper.
   Uses the OS default sound (NOT the alarm).
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
   ✅ HELPER — Human-readable title + body for customer-facing
   order status push notifications.
   ───────────────────────────────────────────────────────────────── */
const getCustomerStatusMessage = (
  rawStatus: string,
  orderId: string
): { title: string; body: string } => {
  const s = String(rawStatus || "").trim().toLowerCase();
  const shortId = orderId ? `#${orderId}` : "";

  if (s === "advance paid" || s === "advance paid (verified)") {
    return {
      title: "✅ Advance Payment Received",
      body: `We've received your advance for order ${shortId}. Your order is confirmed and being prepared.`,
    };
  }

  if (s === "full amount paid" || s === "paid") {
    return {
      title: "✅ Payment Received in Full",
      body: `Your full payment for order ${shortId} was successful. Your order is confirmed and being prepared.`,
    };
  }

  if (s === "accepted") {
    return {
      title: "✅ Order Accepted",
      body: `Your order ${shortId} has been accepted and will be prepared shortly.`,
    };
  }

  if (s === "preparing" || s === "prep") {
    return {
      title: "👨‍🍳 Order Being Prepared",
      body: `Great news! Your order ${shortId} is now being prepared.`,
    };
  }

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

  if (s === "out for delivery" || s === "out_for_delivery" || s === "dispatched") {
    return {
      title: "🚴 Out for Delivery",
      body: `Your order ${shortId} is on its way! Please be ready to receive it.`,
    };
  }

  if (s === "delivered" || s === "completed") {
    return {
      title: "🎉 Order Delivered",
      body: `Your order ${shortId} has been delivered. Enjoy your meal!`,
    };
  }

  if (s === "cancelled" || s === "canceled") {
    return {
      title: "❌ Order Cancelled",
      body: `Your order ${shortId} has been cancelled. If this was unexpected, please contact support.`,
    };
  }

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

  return {
    title: "📋 Order Update",
    body: `Your order ${shortId} status: ${rawStatus}`,
  };
};

/* ─────────────────────────────────────────────────────────────────
   ✅ HELPER — Resolve the chef's user document and push token.
   ───────────────────────────────────────────────────────────────── */
const resolveChefUser = async (
  order: any
): Promise<{ chefUserDoc: any | null; resolvedChefUserId: string | null }> => {
  const chefIdentifier = order?.chefId;
  let chefUserDoc: any = null;
  let resolvedChefUserId: string | null = null;

  if (chefIdentifier && mongoose.Types.ObjectId.isValid(chefIdentifier)) {
    const chefDoc = await Chef.findById(chefIdentifier);
    if (chefDoc?.user) {
      chefUserDoc = await User.findById(chefDoc.user);
      resolvedChefUserId = String(chefDoc.user);
    }
  }
  if (!chefUserDoc && order?.chefName) {
    const chefDoc = await Chef.findOne({ name: order.chefName });
    if (chefDoc?.user) {
      chefUserDoc = await User.findById(chefDoc.user);
      resolvedChefUserId = String(chefDoc.user);
    }
  }
  return { chefUserDoc, resolvedChefUserId };
};

/* ─────────────────────────────────────────────────────────────────
   ✅ HELPER — Fire the chef alarm push for an order.
   ───────────────────────────────────────────────────────────────── */
const notifyChefAboutOrder = async (order: any) => {
  try {
    const { chefUserDoc, resolvedChefUserId } = await resolveChefUser(order);
    const chefIdentifier = order?.chefId;

    io.emit("new_chef_order", order);
    io.emit("order_updated", order);

    if (chefUserDoc?._id) {
      io.to(String(chefUserDoc._id)).emit("new_chef_order", order);
      io.to(String(chefUserDoc._id)).emit("order_updated", order);
    }
    if (chefIdentifier) {
      io.to(String(chefIdentifier)).emit("new_chef_order", order);
      io.to(String(chefIdentifier)).emit("order_updated", order);
    }
    if (order?.userId) {
      io.to(String(order.userId)).emit("order_updated", order);
    }

    if (chefUserDoc?.pushToken && isValidExpoToken(chefUserDoc.pushToken)) {
      await sendExpoPush({
        token: String(chefUserDoc.pushToken),
        title: `🔔 New Order ${order.orderId}`,
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
  } catch (err) {
    console.log("notifyChefAboutOrder warning:", err);
  }
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
 * ✅ REVISED (Auto-Accept for Cashfree payments):
 *
 * 1) ONLINE-PAID ORDERS (Cashfree success) ARE AUTO-ACCEPTED:
 *    Regardless of service type, when the Cashfree payment succeeds:
 *      → orderStatus = "Accepted"
 *      → adminAcceptedAt = now
 *      → adminAcceptedBy = "system:cashfree"
 *      → CHEF IS NOTIFIED IMMEDIATELY (alarm push + socket)
 *    This applies to:
 *      • Catering / Mealbox  (45% advance paid)
 *      • Homemade / QuickBites (100% paid online)
 *
 * 2) COD ORDERS (Homemade / QuickBites only) STILL WAIT FOR ADMIN:
 *      → orderStatus = "Placed"
 *      → adminAcceptedAt = null
 *      → chef is NOT notified until the admin taps "Accept"
 *
 * 3) ADMIN ALARM STILL FIRES:
 *    Every admin always receives the alarm push on new orders
 *    (whether online or COD) so they know an order has arrived.
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
      isQuickBites,
      estimatedDeliveryAtMs,
      deliveryWindowMinutes,
      latitude,
      longitude,
    } = req.body;

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
    // Compute absolute delivery timestamps
    // ────────────────────────────────────────────────────────────────
    const orderPlacedAt = new Date();
    const quickBitesFlag =
      resolvedServiceType === "quickbites" ||
      String(isQuickBites || "").toLowerCase() === "true" ||
      String(req.body?.category || "").trim().toLowerCase().replace(/\s+/g, "") === "quickbites";

    let resolvedWindowMinutes = Number(deliveryWindowMinutes) || 0;
    let resolvedEstimatedDeliveryAt: Date | undefined = undefined;

    if (quickBitesFlag) {
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

    let finalDeliverySlotLabel = String(deliverySlot || deliveryTimeSlot || "").trim();
    let finalDeliveryDateLabel = String(deliveryDate || "").trim();

    if (resolvedEstimatedDeliveryAt) {
      const timeStr = formatTimeShort(resolvedEstimatedDeliveryAt);
      const dateStr = formatDateShort(orderPlacedAt);

      if (quickBitesFlag) {
        finalDeliveryDateLabel = `Today, ${dateStr}`;
        finalDeliverySlotLabel = timeStr;
      } else if (!finalDeliverySlotLabel) {
        finalDeliverySlotLabel = timeStr;
      }
      if (!finalDeliveryDateLabel) {
        finalDeliveryDateLabel = dateStr;
      }
    }

    // ────────────────────────────────────────────────────────────────
    // ✅ REVISED: Compute initial statuses. Online payments are now
    // AUTO-ACCEPTED (orderStatus = "Accepted"). COD orders stay "Placed"
    // and wait for admin acceptance.
    // ────────────────────────────────────────────────────────────────
    const incomingPaymentMethod = String(paymentMethod || "").toLowerCase();
    const initialStatuses = buildInitialStatuses(
      resolvedServiceType,
      incomingPaymentMethod,
      numericTotal,
      finalAdvance
    );

    const isOnline = incomingPaymentMethod === "online";
    const isAutoAccepted = initialStatuses.autoAccepted;

    // Compute the admin-acceptance timestamps:
    //   • Auto-accepted (online) → adminAcceptedAt = orderPlacedAt
    //   • COD                    → null (waits for real admin)
    const resolvedAdminAcceptedAt = isAutoAccepted ? orderPlacedAt : null;
    const resolvedAdminAcceptedBy = isAutoAccepted ? "system:cashfree" : "";

    const statusAdvancedPaidAt =
      isAdvanceBasedService(resolvedServiceType) && isOnline && finalAdvance > 0
        ? orderPlacedAt
        : null;
    const fullPaymentPaidAt =
      isHomemadeLikeService(resolvedServiceType) && isOnline
        ? orderPlacedAt
        : null;

    let savedOrder: any = null;

    // ────────────────────────────────────────────────────────────────
    // Branch 1: Homemade / QuickBites
    // ────────────────────────────────────────────────────────────────
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

      const resolvedHomemadeSlot = finalDeliverySlotLabel || "";
      const ModelToUse = resolvedServiceType === "quickbites"
        ? QuickBitesOrderModel
        : HomemadeOrderModel;

      const isCodOrder = incomingPaymentMethod === "cod";

      const newHomemadeOrder = new ModelToUse({
        orderId: generatedOrderId,
        userId: finalUserId,
        userName: userName || "",
        userPhone: finalUserPhone,
        alternatePhone: finalAlternatePhone,
        chefId: effectiveChefId,
        chefName: effectiveChefName,
        chefPhone: resolvedChefPhone,
        serviceType: resolvedServiceType,
        items: sanitizedItems,
        deliveryAddress: resolvedAddress,
        deliveryTimeSlot: resolvedHomemadeSlot,
        deliverySlot: resolvedHomemadeSlot,
        deliveryDate: finalDeliveryDateLabel || "Today",
        isQuickBites: quickBitesFlag,
        orderPlacedAt,
        estimatedDeliveryAt: resolvedEstimatedDeliveryAt,
        deliveryWindowMinutes: resolvedWindowMinutes,
        latitude: resolvedLatitude,
        longitude: resolvedLongitude,
        subtotal: Number(subtotal) || 0,
        deliveryPrice: Number(deliveryPrice) || 0,
        discount: Number(discount) || 0,
        appliedCoupon: appliedCoupon || "",
        totalAmount: numericTotal,
        advancePaidAmount: isCodOrder ? 0 : numericTotal,
        balanceAmountToCollect: isCodOrder
          ? (balanceAmountToCollect !== undefined
              ? Number(balanceAmountToCollect)
              : numericTotal)
          : 0,
        utrNumber: utrNumber || "",
        advancePaymentScreenshot: screenshotData,
        isAdvanceVerified: initialStatuses.isAdvanceVerified,
        paymentMethod: incomingPaymentMethod || (isCodOrder ? "cod" : "online"),
        paymentStatus: initialStatuses.paymentStatus,
        orderStatus: initialStatuses.orderStatus,
        statusAdvancedPaidAt: null,
        fullPaymentPaidAt: fullPaymentPaidAt,
        // ✅ Auto-accepted for online; null for COD
        adminAcceptedAt: resolvedAdminAcceptedAt,
        adminAcceptedBy: resolvedAdminAcceptedBy,
        statusTimeline: [
          {
            status: initialStatuses.orderStatus,
            timestamp: orderPlacedAt,
            note: isAutoAccepted
              ? "Online payment confirmed — order auto-accepted and chef notified"
              : "COD order placed — awaiting admin acceptance",
          },
        ],
      });

      savedOrder = await newHomemadeOrder.save();
    }
    // ────────────────────────────────────────────────────────────────
    // Branch 2: Catering
    // ────────────────────────────────────────────────────────────────
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
        orderPlacedAt,
        estimatedDeliveryAt: resolvedEstimatedDeliveryAt,
        deliveryWindowMinutes: resolvedWindowMinutes,
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
        isAdvanceVerified: initialStatuses.isAdvanceVerified,
        paymentMethod: incomingPaymentMethod || "cod",
        paymentStatus: initialStatuses.paymentStatus,
        orderStatus: initialStatuses.orderStatus,
        statusAdvancedPaidAt: statusAdvancedPaidAt,
        fullPaymentPaidAt: null,
        // ✅ Auto-accepted for online; null for COD
        adminAcceptedAt: resolvedAdminAcceptedAt,
        adminAcceptedBy: resolvedAdminAcceptedBy,
        statusTimeline: [
          {
            status: initialStatuses.orderStatus,
            timestamp: orderPlacedAt,
            note: isAutoAccepted
              ? `Advance of ₹${finalAdvance} paid via Cashfree — order auto-accepted and chef notified`
              : "Advance pending — awaiting admin verification",
          },
        ],
      });

      savedOrder = await newCateringOrder.save();
    }
    // ────────────────────────────────────────────────────────────────
    // Branch 3: Mealbox
    // ────────────────────────────────────────────────────────────────
    else {
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
        orderPlacedAt,
        estimatedDeliveryAt: resolvedEstimatedDeliveryAt,
        deliveryWindowMinutes: resolvedWindowMinutes,
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
        isAdvanceVerified: initialStatuses.isAdvanceVerified,
        paymentMethod: incomingPaymentMethod || "cod",
        paymentStatus: initialStatuses.paymentStatus,
        orderStatus: initialStatuses.orderStatus,
        statusAdvancedPaidAt: statusAdvancedPaidAt,
        fullPaymentPaidAt: null,
        // ✅ Auto-accepted for online; null for COD
        adminAcceptedAt: resolvedAdminAcceptedAt,
        adminAcceptedBy: resolvedAdminAcceptedBy,
        statusTimeline: [
          {
            status: initialStatuses.orderStatus,
            timestamp: orderPlacedAt,
            note: isAutoAccepted
              ? `Advance of ₹${finalAdvance} paid via Cashfree — order auto-accepted and chef notified`
              : "Advance pending — awaiting admin verification",
          },
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

    // ────────────────────────────────────────────────────────────────
    // ✅ Socket + push notifications
    //
    // Customer gets a confirmation push.
    // Admin gets the alarm push (always — online or COD).
    // Chef is notified IMMEDIATELY if the order was auto-accepted
    //   (i.e. Cashfree payment succeeded); otherwise the chef is
    //   notified later via `acceptOrderByAdmin`.
    // ────────────────────────────────────────────────────────────────
    try {
      if (finalUserId) {
        io.to(finalUserId).emit("new_order_placed", savedOrder);
        const customerDoc = await User.findById(finalUserId);
        if (customerDoc?.pushToken) {
          let customerTitle = "Order Placed 🕒";
          let customerBody = `Your order #${savedOrder.orderId} has been placed.`;

          if (isAutoAccepted && isAdvanceBasedService(resolvedServiceType)) {
            customerTitle = "Advance Payment Received ✅";
            customerBody = `We've received your advance of ₹${savedOrder.advancePaidAmount} for order #${savedOrder.orderId}. Your order is confirmed and being prepared.`;
          } else if (isAutoAccepted && isHomemadeLikeService(resolvedServiceType)) {
            customerTitle = "Payment Received in Full ✅";
            customerBody = `Your full payment of ₹${savedOrder.totalAmount} for order #${savedOrder.orderId} was successful. Your order is confirmed and being prepared.`;
          } else if (String(savedOrder.paymentMethod).toLowerCase() === "cod") {
            customerTitle = "Order Placed - Cash on Delivery 🕒";
            customerBody = `Your order #${savedOrder.orderId} has been placed. Please keep ₹${savedOrder.balanceAmountToCollect} ready for delivery.`;
          }

          await sendExpoPushNotification(
            customerDoc.pushToken,
            customerTitle,
            customerBody,
            { orderId: savedOrder.orderId, screen: "orders" }
          );
        }
      }

      io.emit("new_order_placed", savedOrder);

      // Notify every admin with the alarm sound (always)
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
            body: isAutoAccepted
              ? `${savedOrder.userName || "A customer"} paid ₹${savedOrder.totalAmount}. Order auto-accepted.`
              : `${savedOrder.userName || "A customer"} placed a COD order of ₹${savedOrder.totalAmount}. Tap to review & accept.`,
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

      // ✅ Notify the chef IMMEDIATELY if the order was auto-accepted
      //    (Cashfree success). For COD orders, the chef will be
      //    notified later via `/admin-accept`.
      if (isAutoAccepted && savedOrder) {
        await notifyChefAboutOrder(savedOrder);
        console.log(
          `[createOrder] Auto-notified chef for order ${savedOrder.orderId} (Cashfree success)`
        );
      }
    } catch (e) {
      console.log("Order creation notification emit warning:", e);
    }

    return res.status(201).json({
      success: true,
      message: isAutoAccepted
        ? "Order placed successfully. Payment received and chef notified."
        : "Order placed successfully. Awaiting admin acceptance.",
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
 * PATCH /api/orders/:orderId/admin-accept
 *
 * ✅ NEW ENDPOINT — used primarily for COD orders.
 *
 * When the admin taps "Accept" on a COD order, this endpoint:
 *   1) Sets `adminAcceptedAt = now` and `adminAcceptedBy = <adminId>`.
 *   2) Moves orderStatus from "Placed" to "Accepted".
 *   3) Appends a status timeline entry.
 *   4) Notifies the assigned CHEF (alarm push + `new_chef_order`).
 *   5) Emits `order_updated` so all UIs refresh.
 *   6) Sends a customer-facing "Order Accepted" push.
 *
 * NOTE: This endpoint is idempotent — calling it on an already-accepted
 * order is a no-op (returns success).
 */
export const acceptOrderByAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const rawAdminId = req.user?.userId || req.user?._id || req.user?.id;
    const { orderId } = req.params;

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const currentStatus = String(order.orderStatus || "Placed");
    const s = currentStatus.toLowerCase();

    if (s === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Cancelled orders cannot be accepted.",
      });
    }
    if (order.adminAcceptedAt) {
      return res.status(200).json({
        success: true,
        message: "Order was already accepted.",
        order,
      });
    }

    const now = new Date();
    order.adminAcceptedAt = now;
    order.adminAcceptedBy = String(rawAdminId || "");
    order.orderStatus = "Accepted";
    order.statusTimeline = order.statusTimeline || [];
    order.statusTimeline.push({
      status: "Accepted",
      timestamp: now,
      note: `Admin accepted order${rawAdminId ? ` (admin: ${rawAdminId})` : ""}`,
    });

    const updatedOrder = await order.save();

    // ✅ Notify the chef
    await notifyChefAboutOrder(updatedOrder);

    // Emit order_updated so admin & customer UIs refresh
    try {
      io.emit("order_updated", updatedOrder);
      io.emit("order_status_updated", updatedOrder);
      if (updatedOrder.userId) {
        io.to(String(updatedOrder.userId)).emit("order_updated", updatedOrder);
        io.to(String(updatedOrder.userId)).emit("order_status_updated", updatedOrder);
      }
    } catch (e) {
      console.log("Socket emit warning (admin-accept):", e);
    }

    // Customer-facing "Order Accepted" push
    try {
      if (updatedOrder.userId && mongoose.Types.ObjectId.isValid(updatedOrder.userId)) {
        const customerDoc = await User.findById(updatedOrder.userId);
        if (customerDoc?.pushToken && isValidExpoToken(customerDoc.pushToken)) {
          const msg = getCustomerStatusMessage("Accepted", updatedOrder.orderId);
          await sendExpoPush({
            token: String(customerDoc.pushToken),
            title: msg.title,
            body: msg.body,
            data: {
              orderId: updatedOrder.orderId,
              screen: "orders",
              role: "customer",
              status: "Accepted",
            },
            sound: "default",
            priority: "high",
          });
        }
      }
    } catch (customerPushErr) {
      console.log("Customer accept push error:", customerPushErr);
    }

    return res.status(200).json({
      success: true,
      message: "Order accepted and chef notified.",
      order: updatedOrder,
    });
  } catch (error: any) {
    console.error("Error in acceptOrderByAdmin:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PATCH /api/orders/:orderId/verify-advance
 *
 * Manual advance verification (screenshot / UTR flows). NO chef
 * notification here — for auto-accepted online orders the chef has
 * already been notified in `createOrder`; for COD orders the chef is
 * notified later via `/admin-accept`.
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

    if (!order.statusAdvancedPaidAt) {
      order.statusAdvancedPaidAt = new Date();
    }

    const updatedOrder = await order.save();

    try {
      io.emit("advance_payment_verified", updatedOrder);
      io.emit("order_updated", updatedOrder);
      io.emit("order_status_updated", updatedOrder);

      if (order.userId) {
        io.to(order.userId).emit("advance_payment_verified", updatedOrder);
        io.to(order.userId).emit("order_updated", updatedOrder);
        io.to(order.userId).emit("order_status_updated", updatedOrder);
      }
    } catch (e) {
      console.log("Socket emit warning (verify-advance):", e);
    }

    try {
      if (order.userId && mongoose.Types.ObjectId.isValid(order.userId)) {
        const userDoc = await User.findById(order.userId);
        if (userDoc?.pushToken && isValidExpoToken(userDoc.pushToken)) {
          await sendExpoPushNotification(
            userDoc.pushToken,
            "Advance Payment Verified! 🎉",
            `Your advance payment for order #${order.orderId} has been verified.`,
            { orderId: order.orderId, screen: "orders" }
          );
        }
      }
    } catch (custErr) {
      console.log("Customer verify-advance push warning:", custErr);
    }

    return res.status(200).json({
      success: true,
      message: "Advance payment verified successfully.",
      order: updatedOrder,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/orders/chef-orders
 *
 * ✅ Only returns orders the ADMIN has accepted (or that were
 * auto-accepted via Cashfree). Cancelled orders are always excluded.
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
      $and: [
        {
          $or: [
            { chefId: { $in: queryChefIds } },
            { chefName: chefProfile?.name || "" },
            { _id: { $in: chefProfile?.orderHistory || [] } },
          ],
        },
        // ✅ Only orders the admin has accepted (or auto-accepted)
        { adminAcceptedAt: { $ne: null } },
        // ✅ Never show cancelled orders
        { orderStatus: { $nin: ["Cancelled", "cancelled"] } },
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
 * Handles all status transitions including the new flow.
 */
export const updateOrderStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    const rawAdminId = req.user?.userId || req.user?._id || req.user?.id;

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const normalized = String(status).trim();
    const normalizedLower = normalized.toLowerCase();
    order.statusTimeline = order.statusTimeline || [];

    const now = new Date();

    if (normalizedLower === "advance paid") {
      order.orderStatus = "Advance Paid";
      order.isAdvanceVerified = true;
      if (!order.statusAdvancedPaidAt) {
        order.statusAdvancedPaidAt = now;
      }
      if (!String(order.paymentStatus || "").toLowerCase().includes("advance paid")) {
        order.paymentStatus = "Advance Paid (Verified)";
      }
      order.statusTimeline.push({
        status: "Advance Paid",
        timestamp: now,
        note: `Advance of ₹${order.advancePaidAmount || 0} marked as paid`,
      });
    } else if (normalizedLower === "full amount paid") {
      order.orderStatus = "Full Amount Paid";
      order.isAdvanceVerified = true;
      if (!order.fullPaymentPaidAt) {
        order.fullPaymentPaidAt = now;
      }
      order.paymentStatus = "Paid";
      order.paymentCaptured = true;
      order.paidAt = order.paidAt || now;
      order.statusTimeline.push({
        status: "Full Amount Paid",
        timestamp: now,
        note: `Full payment of ₹${order.totalAmount || 0} received`,
      });
    } else if (normalizedLower === "accepted") {
      order.orderStatus = "Accepted";
      if (!order.adminAcceptedAt) {
        order.adminAcceptedAt = now;
        order.adminAcceptedBy = String(rawAdminId || "");
      }
      order.statusTimeline.push({
        status: "Accepted",
        timestamp: now,
        note: "Order accepted",
      });
    } else if (
      normalizedLower === "cash collected" ||
      normalizedLower === "cash_collected" ||
      normalizedLower === "collected" ||
      normalizedLower === "balance collected"
    ) {
      order.paymentStatus = "Fully Paid (Balance Collected)";
      order.paymentCaptured = true;
      order.paidAt = now;
      order.orderStatus = "Completed";
      if (!order.actualDeliveredAt) {
        order.actualDeliveredAt = now;
      }
      order.statusTimeline.push({
        status: "Balance Collected",
        timestamp: now,
        note: `Balance amount of ₹${order.balanceAmountToCollect || 0} collected upon delivery`,
      });

      if (Array.isArray(order.deliverySchedules) && order.deliverySchedules.length > 0) {
        order.deliverySchedules.forEach((schedule: any) => {
          const sStatus = String(schedule.status || "").toLowerCase();
          if (sStatus !== "delivered" && sStatus !== "completed" && sStatus !== "cash collected") {
            schedule.status = "Delivered";
            if (!schedule.actualDeliveredAt) {
              schedule.actualDeliveredAt = now;
            }
            if (!schedule.statusTimeline) schedule.statusTimeline = [];
            schedule.statusTimeline.push({
              status: "Delivered",
              timestamp: now,
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
        timestamp: now,
        note: `Order status changed to ${normalized}`,
      });

      if (normalized === "Preparing" || normalized === "Accepted") {
        if (!order.prepStartedAt) {
          order.prepStartedAt = now;
        }
        if (!order.targetDeliveryTime) {
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
        order.actualDeliveredAt = order.actualDeliveredAt || now;
        const target = order.targetDeliveryTime ? new Date(order.targetDeliveryTime).getTime() : Date.now();
        const graceMs = (order.gracePeriodMinutes || 0) * 60 * 1000;
        order.deliveredOnTime = Date.now() <= target + graceMs;
      }

      if (normalizedLower === "cancelled" || normalizedLower === "canceled") {
        order.orderStatus = "Cancelled";
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

    if (String(order.orderStatus || "").toLowerCase() === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Cannot update schedules on a cancelled order.",
      });
    }

    const normalizedStatus = String(status).trim();
    const normalizedStatusLower = normalizedStatus.toLowerCase();
    const now = new Date();
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
            timestamp: now,
            note: `Delivery status for ${dateStr} changed to ${normalizedStatus}`,
          },
        ],
        actualDeliveredAt:
          isCashCollectedForSchedule || normalizedStatus === "Delivered" ? now : undefined,
      } as any);
    } else {
      const schedule = order.deliverySchedules[foundIndex];
      schedule.status = isCashCollectedForSchedule ? "Delivered" : normalizedStatus;
      if (!schedule.statusTimeline) schedule.statusTimeline = [];
      schedule.statusTimeline.push({
        status: isCashCollectedForSchedule ? "Delivered" : normalizedStatus,
        timestamp: now,
        note: `Delivery status for ${dateStr} changed to ${normalizedStatus}`,
      });
      if (isCashCollectedForSchedule || normalizedStatus === "Delivered") {
        schedule.actualDeliveredAt = now;
      }
    }

    if (isCashCollectedForSchedule) {
      order.paymentStatus = "Fully Paid (Balance Collected)";
      order.paymentCaptured = true;
      order.paidAt = now;
      if (!order.actualDeliveredAt) order.actualDeliveredAt = now;
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