// payments.controller.ts
import { Request, Response } from "express";
import Razorpay from "razorpay";
import crypto from "crypto";
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
import { io } from "..";
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

const razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "",
});

/* ─────────────────────────────────────────────────────────────────
   ✅ HELPER — Verify Razorpay payment signature using HMAC-SHA256
   ───────────────────────────────────────────────────────────────── */
const verifyRazorpaySignature = ({
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
}: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): boolean => {
  const secret = process.env.RAZORPAY_KEY_SECRET || "";
  if (!secret) {
    console.error("CRITICAL ERROR: Missing RAZORPAY_KEY_SECRET in environment variables.");
    return false;
  }
  const generatedSignature = crypto
    .createHmac("sha256", secret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");
  return generatedSignature === razorpaySignature;
};

/* ─────────────────────────────────────────────────────────────────
   ✅ HELPER — Safe parsers (mirror orders.controller.ts)
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

const parseNumberOrUndefined = (val: any): number | undefined => {
  if (val === undefined || val === null || val === "") return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
};

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

const formatDateShort = (d: Date): string => {
  try {
    const day = d.getDate();
    const month = d.toLocaleDateString("en-US", { month: "short" });
    return `${day} ${month}`;
  } catch {
    return "";
  }
};

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
  if (!spice && !noOnionsGarlic && !notes) return null;
  return { spice, noOnionsGarlic, notes };
};

const MONTHS_MAP: { [key: string]: number } = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
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

/* ─────────────────────────────────────────────────────────────────
   POST /api/payments/create-order
   Creates a Razorpay order for the FULL total amount.
   ───────────────────────────────────────────────────────────────── */
export const createPaymentOrder = async (req: Request, res: Response) => {
  try {
    const { amount, currency = "INR", receipt, notes } = req.body;

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid or non-positive order amount provided.",
      });
    }

    const amountInPaise = Math.round(numericAmount * 100);
    const receiptKey = receipt || `rcpt_${Date.now().toString().slice(-8)}`;

    const options: any = {
      amount: amountInPaise,
      currency,
      receipt: receiptKey,
      payment_capture: 1,
      notes: notes || {},
    };

    const razorpayOrder = await razorpayInstance.orders.create(options);

    return res.status(200).json({
      success: true,
      keyId: process.env.RAZORPAY_KEY_ID,
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      receipt: razorpayOrder.receipt,
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

/* ─────────────────────────────────────────────────────────────────
   POST /api/payments/verify
   Verifies Razorpay signature and creates the order in MongoDB
   with paymentCaptured: true + isAdvanceVerified: true so chefs
   see the order immediately (no admin manual verification).
   ───────────────────────────────────────────────────────────────── */
export const verifyPaymentAndCreateOrder = async (req: AuthRequest, res: Response) => {
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

    const {
      userId,
      userName,
      userPhone,
      alternatePhone,
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
      scheduledDatesFormatted,
      scheduledDatesList,
      subtotal,
      deliveryPrice,
      discount,
      appliedCoupon,
      totalAmount,
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
      specialInstruction,
      specialInstructionTag,
      specialInstructionLabel,
      specialInstructionText,
      quickDeliverySlot,
      specialInstructions,
      deliveryDistanceKm,
      distanceDeliveryFee,
      deliveryPricingRuleVersion,
    } = orderPayload || {};

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
    const safePaymentMethod = coerceToString(paymentMethod) || "razorpay";
    const safeRestaurantName = coerceToString(restaurantName);
    const safeRestaurantImage = coerceToString(restaurantImage);
    const safeOccasion = coerceToString(occasion);
    const safeEventDate = coerceToString(eventDate);
    const safeEventTime = coerceToString(eventTime);
    const safeDeliveryType = coerceToString(deliveryType);
    const safeQuickDeliverySlot = coerceToString(quickDeliverySlot);

    let parsedSpecialInstruction: any = null;
    try {
      if (specialInstruction !== undefined && specialInstruction !== null && specialInstruction !== "") {
        if (typeof specialInstruction === "string") {
          const trimmed = specialInstruction.trim();
          if (trimmed.length > 0) parsedSpecialInstruction = JSON.parse(trimmed);
        } else if (typeof specialInstruction === "object") {
          parsedSpecialInstruction = specialInstruction;
        }
      }
    } catch {
      parsedSpecialInstruction = null;
    }

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

    const resolvedSpecialInstruction = {
      tag: resolvedSpecialInstructionTag,
      label: resolvedSpecialInstructionLabel,
      text: resolvedSpecialInstructionText,
    };

    const resolvedQuickSpecialInstructions = parseQuickSpecialInstructions(specialInstructions);

    const finalUserId = String(userId || req.user?.userId || req.user?._id || "");
    let finalUserPhone = coerceToString(userPhone || req.user?.phone || "");
    let finalAlternatePhone = coerceToString(alternatePhone || "");

    if (finalUserId && mongoose.Types.ObjectId.isValid(finalUserId) && !finalUserPhone) {
      const userObj = await User.findById(finalUserId);
      if (userObj?.phone) finalUserPhone = coerceToString(userObj.phone);
    }

    let resolvedChefPhone = "";
    try {
      const effectiveChefId = coerceToString(chefId);
      let chefDoc: any = null;
      if (effectiveChefId && mongoose.Types.ObjectId.isValid(effectiveChefId)) {
        chefDoc = await Chef.findById(effectiveChefId);
      }
      if (!chefDoc && effectiveChefId) {
        chefDoc = await Chef.findOne({ user: effectiveChefId });
      }
      if (!chefDoc && chefName) {
        chefDoc = await Chef.findOne({ name: coerceToString(chefName) });
      }
      if (chefDoc?.phone) resolvedChefPhone = String(chefDoc.phone).trim();
    } catch (e) {
      console.log("Chef lookup warning:", e);
    }

    const generatedOrderId = "KB" + Date.now().toString().slice(-8);

    const parsedUpcomingDeliveries = parseIfJsonString(upcomingDeliveries, []);
    const parsedScheduledDatesFormatted = parseIfJsonString(scheduledDatesFormatted, []);
    const parsedScheduledDatesList = parseIfJsonString(scheduledDatesList, []);

    let deliveryDateCandidates: any[] = Array.isArray(parsedUpcomingDeliveries) ? parsedUpcomingDeliveries : [];
    if (deliveryDateCandidates.length === 0 && Array.isArray(parsedScheduledDatesFormatted)) {
      deliveryDateCandidates = parsedScheduledDatesFormatted;
    }
    if (deliveryDateCandidates.length === 0 && Array.isArray(parsedScheduledDatesList)) {
      deliveryDateCandidates = parsedScheduledDatesList.map((item: any) => {
        if (typeof item === "string") return item;
        if (item?.dayName && item?.dayNumber && item?.monthName) {
          return `${item.dayName}, ${item.dayNumber} ${item.monthName}`;
        }
        if (item?.fullDateString) return String(item.fullDateString);
        return String(item ?? "");
      }).filter((item: string) => item.trim().length > 0);
    }

    const sortedDeliveries = sortDatesAscending(
      deliveryDateCandidates
        .map((item: any) => (typeof item === "string" ? item.trim() : String(item ?? "").trim()))
        .filter((item: string) => item.length > 0)
    );

    const resolvedServiceType = safeServiceType ? safeServiceType.toLowerCase() : "mealbox";
    const resolvedAddress = String(safeDeliveryAddress || safeAddressDetails || "");

    const numericTotal = Number(totalAmount) || 0;
    const finalAdvance = numericTotal;
    const finalBalance = 0;
    const orderPlacedAt = new Date();

    const resolvedLatitude = parseNumberOrUndefined(latitude);
    const resolvedLongitude = parseNumberOrUndefined(longitude);
    const safeLat = Number.isFinite(resolvedLatitude as number) ? (resolvedLatitude as number) : undefined;
    const safeLng = Number.isFinite(resolvedLongitude as number) ? (resolvedLongitude as number) : undefined;

    const quickBitesFlag =
      resolvedServiceType === "quickbites" ||
      String(isQuickBites || "").toLowerCase() === "true";

    let resolvedWindowMinutes = Number(deliveryWindowMinutes) || 0;
    let resolvedEstimatedDeliveryAt: Date | undefined = undefined;
    if (quickBitesFlag) {
      if (!resolvedWindowMinutes || resolvedWindowMinutes <= 0) resolvedWindowMinutes = 75;
      resolvedEstimatedDeliveryAt = new Date(orderPlacedAt.getTime() + resolvedWindowMinutes * 60 * 1000);
    } else if (estimatedDeliveryAtMs !== undefined && estimatedDeliveryAtMs !== null && estimatedDeliveryAtMs !== "") {
      const parsedMs = Number(estimatedDeliveryAtMs);
      if (Number.isFinite(parsedMs) && parsedMs > 0) resolvedEstimatedDeliveryAt = new Date(parsedMs);
    }

    let finalDeliverySlotLabel = String(safeDeliverySlot || safeDeliveryTimeSlot || "").trim();
    let finalDeliveryDateLabel = String(safeDeliveryDate || "").trim();
    if (resolvedEstimatedDeliveryAt) {
      const timeStr = formatTimeShort(resolvedEstimatedDeliveryAt);
      const dateStr = formatDateShort(orderPlacedAt);
      if (quickBitesFlag) {
        finalDeliveryDateLabel = `Today, ${dateStr}`;
        finalDeliverySlotLabel = timeStr;
      } else if (!finalDeliverySlotLabel) {
        finalDeliverySlotLabel = timeStr;
      }
      if (!finalDeliveryDateLabel) finalDeliveryDateLabel = dateStr;
    }

    const resolvedQuickDeliverySlot = safeQuickDeliverySlot || finalDeliverySlotLabel || "";
    const includeQuickDeliverySlot =
      !!resolvedQuickDeliverySlot && (resolvedServiceType === "homemade" || resolvedServiceType === "quickbites");
    const includeQuickSpecialInstructions =
      !!resolvedQuickSpecialInstructions && (resolvedServiceType === "homemade" || resolvedServiceType === "quickbites");

    let savedOrder: any = null;

    if (resolvedServiceType === "homemade" || resolvedServiceType === "quickbites") {
      const parsedItemsRaw = parseIfJsonString(items, []);
      const sanitizedItems = Array.isArray(parsedItemsRaw)
        ? parsedItemsRaw.map((it: any) => ({
            id: String(it.id || it._id || Math.random().toString()),
            name: String(it.name || "Special Dish"),
            image: String(it.image || it.imageUrl || ""),
            price: Number(it.price) || 0,
            quantity: Number(it.quantity) || 1,
            selectedQtyConfig: String(it.selectedQtyConfig || it.sizeLabel || it.size || "Standard Serving"),
            isVeg: it.isVeg !== undefined ? Boolean(it.isVeg) : true,
            ...(it.isComboComponent !== undefined ? { isComboComponent: Boolean(it.isComboComponent) } : {}),
            ...(it.comboName ? { comboName: String(it.comboName) } : {}),
            ...(it.comboId ? { comboId: String(it.comboId) } : {}),
            ...(it.comboKey ? { comboKey: String(it.comboKey) } : {}),
            ...(it.comboComponent ? { comboComponent: String(it.comboComponent) } : {}),
          }))
        : [];

      const resolvedHomemadeSlot = finalDeliverySlotLabel || "";
      const ModelToUse = resolvedServiceType === "quickbites" ? QuickBitesOrderModel : HomemadeOrderModel;

      const newHomemadeOrder = new ModelToUse({
        orderId: generatedOrderId,
        userId: finalUserId,
        userName: coerceToString(userName),
        userPhone: finalUserPhone,
        alternatePhone: finalAlternatePhone,
        chefId: coerceToString(chefId),
        chefName: coerceToString(chefName) || safeRestaurantName,
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
        ...(safeLat !== undefined ? { latitude: safeLat } : {}),
        ...(safeLng !== undefined ? { longitude: safeLng } : {}),
        subtotal: Number(subtotal) || 0,
        deliveryPrice: Number(deliveryPrice) || 0,
        deliveryDistanceKm: Number(deliveryDistanceKm) || undefined,
        distanceDeliveryFee: Number(distanceDeliveryFee) || undefined,
        deliveryPricingRuleVersion: coerceToString(deliveryPricingRuleVersion) || undefined,
        discount: Number(discount) || 0,
        appliedCoupon: safeAppliedCoupon,
        totalAmount: numericTotal,
        advancePaidAmount: finalAdvance,
        balanceAmountToCollect: finalBalance,
        utrNumber: razorpay_payment_id,
        isAdvanceVerified: true,
        paymentMethod: safePaymentMethod || "razorpay",
        paymentStatus: "Paid",
        orderStatus: "Placed",
        specialInstruction: resolvedSpecialInstruction,
        specialInstructionTag: resolvedSpecialInstructionTag,
        specialInstructionLabel: resolvedSpecialInstructionLabel,
        specialInstructionText: resolvedSpecialInstructionText,
        ...(includeQuickDeliverySlot ? { quickDeliverySlot: resolvedQuickDeliverySlot } : {}),
        ...(includeQuickSpecialInstructions ? { specialInstructions: resolvedQuickSpecialInstructions } : {}),
        deliveryType: safeDeliveryType,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        paymentCaptured: true,
        paidAt: new Date(),
        statusTimeline: [
          {
            status: "Placed",
            timestamp: orderPlacedAt,
            note: `Paid ₹${numericTotal} via Razorpay (${razorpay_payment_id})`,
          },
        ],
      });

      savedOrder = await newHomemadeOrder.save();
    } else if (resolvedServiceType === "catering") {
      const includeCateringQuickDeliverySlot = !!safeQuickDeliverySlot;
      const includeCateringQuickSpecialInstructions = !!resolvedQuickSpecialInstructions;

      const newCateringOrder = new CateringOrderModel({
        orderId: generatedOrderId,
        userId: finalUserId,
        userName: coerceToString(userName),
        userPhone: finalUserPhone,
        alternatePhone: finalAlternatePhone,
        chefId: coerceToString(chefId),
        chefName: coerceToString(chefName) || safeRestaurantName,
        chefPhone: resolvedChefPhone,
        serviceType: "catering",
        menuName: safeMenuName || "Catering Platter",
        menuImage: safeMenuImage || safeRestaurantImage || "",
        addressDetails: resolvedAddress,
        restaurantName: safeRestaurantName,
        restaurantImage: safeRestaurantImage || safeMenuImage || "",
        occasion: safeOccasion || "Event",
        guests: Number(guests) || 0,
        eventDate: safeEventDate || safeDeliveryDate || "",
        eventTime: safeEventTime || safeDeliveryTimeSlot || "",
        deliveryType: safeDeliveryType || "Standard",
        pricePerPlate: Number(pricePerPlate) || 0,
        addons: Array.isArray(addons) ? addons : parseIfJsonString(addons, []),
        selections: parseIfJsonString(selections, null),
        items: parseIfJsonString(items, []),
        orderPlacedAt,
        estimatedDeliveryAt: resolvedEstimatedDeliveryAt,
        deliveryWindowMinutes: resolvedWindowMinutes,
        ...(safeLat !== undefined ? { latitude: safeLat } : {}),
        ...(safeLng !== undefined ? { longitude: safeLng } : {}),
        subtotal: Number(subtotal) || 0,
        deliveryPrice: Number(deliveryPrice) || 0,
        deliveryDistanceKm: Number(deliveryDistanceKm) || undefined,
        distanceDeliveryFee: Number(distanceDeliveryFee) || undefined,
        deliveryPricingRuleVersion: coerceToString(deliveryPricingRuleVersion) || undefined,
        discount: Number(discount) || 0,
        appliedCoupon: safeAppliedCoupon,
        totalAmount: numericTotal,
        advancePaidAmount: finalAdvance,
        balanceAmountToCollect: finalBalance,
        utrNumber: razorpay_payment_id,
        isAdvanceVerified: true,
        paymentMethod: safePaymentMethod || "razorpay",
        paymentStatus: "Paid",
        orderStatus: "Placed",
        specialInstruction: resolvedSpecialInstruction,
        specialInstructionTag: resolvedSpecialInstructionTag,
        specialInstructionLabel: resolvedSpecialInstructionLabel,
        specialInstructionText: resolvedSpecialInstructionText,
        ...(includeCateringQuickDeliverySlot ? { quickDeliverySlot: safeQuickDeliverySlot } : {}),
        ...(includeCateringQuickSpecialInstructions ? { specialInstructions: resolvedQuickSpecialInstructions } : {}),
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        paymentCaptured: true,
        paidAt: new Date(),
        statusTimeline: [
          {
            status: "Placed",
            timestamp: orderPlacedAt,
            note: `Paid ₹${numericTotal} via Razorpay (${razorpay_payment_id})`,
          },
        ],
      });

      savedOrder = await newCateringOrder.save();
    } else {
      let effectiveUpcomingDeliveries: string[] = Array.isArray(sortedDeliveries) ? sortedDeliveries.slice() : [];
      if (effectiveUpcomingDeliveries.length === 0 && typeof safeDeliveryDate === "string" && safeDeliveryDate.trim().length > 0) {
        effectiveUpcomingDeliveries = [safeDeliveryDate.trim()];
      }

      const includeMealboxQuickDeliverySlot = !!safeQuickDeliverySlot;
      const includeMealboxQuickSpecialInstructions = !!resolvedQuickSpecialInstructions;

      const initialSchedules = effectiveUpcomingDeliveries.map((dateItem: string) => ({
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
        chefId: coerceToString(chefId),
        chefName: coerceToString(chefName) || safeRestaurantName,
        chefPhone: resolvedChefPhone,
        serviceType: "mealbox",
        menuName: safeMenuName || "Meal Plan",
        menuImage: safeMenuImage || "",
        durationType: safeDurationType || "",
        deliveryTimeSlot: safeDeliveryTimeSlot || "7:00 PM - 9:00 PM",
        addressDetails: resolvedAddress,
        deliveryDate: safeDeliveryDate || "",
        upcomingDeliveries: effectiveUpcomingDeliveries,
        deliverySchedules: initialSchedules,
        pausedDates: [],
        selections: parseIfJsonString(selections, null),
        items: parseIfJsonString(items, []),
        orderPlacedAt,
        estimatedDeliveryAt: resolvedEstimatedDeliveryAt,
        deliveryWindowMinutes: resolvedWindowMinutes,
        ...(safeLat !== undefined ? { latitude: safeLat } : {}),
        ...(safeLng !== undefined ? { longitude: safeLng } : {}),
        subtotal: Number(subtotal) || 0,
        deliveryPrice: Number(deliveryPrice) || 0,
        deliveryDistanceKm: Number(deliveryDistanceKm) || undefined,
        distanceDeliveryFee: Number(distanceDeliveryFee) || undefined,
        deliveryPricingRuleVersion: coerceToString(deliveryPricingRuleVersion) || undefined,
        discount: Number(discount) || 0,
        appliedCoupon: safeAppliedCoupon,
        totalAmount: numericTotal,
        advancePaidAmount: finalAdvance,
        balanceAmountToCollect: finalBalance,
        utrNumber: razorpay_payment_id,
        isAdvanceVerified: true,
        paymentMethod: safePaymentMethod || "razorpay",
        paymentStatus: "Paid",
        orderStatus: "Placed",
        specialInstruction: resolvedSpecialInstruction,
        specialInstructionTag: resolvedSpecialInstructionTag,
        specialInstructionLabel: resolvedSpecialInstructionLabel,
        specialInstructionText: resolvedSpecialInstructionText,
        ...(includeMealboxQuickDeliverySlot ? { quickDeliverySlot: safeQuickDeliverySlot } : {}),
        ...(includeMealboxQuickSpecialInstructions ? { specialInstructions: resolvedQuickSpecialInstructions } : {}),
        deliveryType: safeDeliveryType,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        paymentCaptured: true,
        paidAt: new Date(),
        statusTimeline: [
          {
            status: "Placed",
            timestamp: orderPlacedAt,
            note: `Paid ₹${numericTotal} via Razorpay (${razorpay_payment_id})`,
          },
        ],
      });

      savedOrder = await newMealBoxOrder.save();
    }

    if (finalUserId && mongoose.Types.ObjectId.isValid(finalUserId)) {
      await User.findByIdAndUpdate(finalUserId, { $addToSet: { orderHistory: savedOrder._id } });
    }

    const effectiveChefId = coerceToString(chefId);
    if (effectiveChefId) {
      if (mongoose.Types.ObjectId.isValid(effectiveChefId)) {
        await Chef.findByIdAndUpdate(effectiveChefId, { $addToSet: { orderHistory: savedOrder._id } });
        await Chef.findOneAndUpdate({ user: effectiveChefId }, { $addToSet: { orderHistory: savedOrder._id } });
      } else {
        await Chef.findOneAndUpdate({ name: coerceToString(chefName) }, { $addToSet: { orderHistory: savedOrder._id } });
      }
    }

    if (finalUserId && mongoose.Types.ObjectId.isValid(finalUserId)) {
      await Cart.updateMany({ user: finalUserId, status: "in-cart" }, { $set: { status: "ordered" } });
    }

    try {
      if (finalUserId) {
        io.to(finalUserId).emit("new_order_placed", savedOrder);
        io.to(finalUserId).emit("order_updated", savedOrder);
      }
      io.emit("new_order_placed", savedOrder);
      io.emit("order_updated", savedOrder);

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

      if (finalUserId && mongoose.Types.ObjectId.isValid(finalUserId)) {
        const customerDoc = await User.findById(finalUserId);
        if (customerDoc?.pushToken && isValidExpoToken(customerDoc.pushToken)) {
          await sendExpoPush({
            token: String(customerDoc.pushToken),
            title: "✅ Payment Successful",
            body: `Your order #${savedOrder.orderId} is confirmed and being prepared.`,
            data: { orderId: savedOrder.orderId, screen: "orders", role: "customer" },
            sound: "default",
            priority: "high",
          });
        }
      }

      if (chefUserDoc?.pushToken && isValidExpoToken(chefUserDoc.pushToken)) {
        await sendExpoPush({
          token: String(chefUserDoc.pushToken),
          title: `🔔 New Paid Order ${savedOrder.orderId}`,
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
      }

      try {
        const admins = await User.find({ isAdmin: true, pushToken: { $exists: true, $ne: "" } }).select("pushToken name");
        const validAdmins = admins.filter((a: any) => isValidExpoToken(a.pushToken));
        if (validAdmins.length > 0) {
          const adminPayloads = validAdmins.map((admin: any) => ({
            token: String(admin.pushToken),
            title: `🚨 New Paid Order ${savedOrder.orderId}`,
            body: `${savedOrder.userName || "A customer"} paid ₹${savedOrder.totalAmount}. Tap to review.`,
            data: { orderId: savedOrder.orderId, screen: "admin-orders", role: "admin" },
            sound: ORDER_ALARM_SOUND,
            channelId: ADMIN_ORDER_CHANNEL_ID,
            priority: "max" as const,
            vibrate: [0, 600, 300, 600, 300],
          }));
          await sendExpoPushBatch(adminPayloads);
        }
      } catch (adminPushErr) {
        console.log("Admin push error:", adminPushErr);
      }
    } catch (e) {
      console.log("Socket/push warning:", e);
    }

    return res.status(201).json({
      success: true,
      message: "Payment verified successfully & order placed.",
      order: savedOrder,
    });
  } catch (error: any) {
    console.error("Error verifying payment:", error);
    console.error("Error stack:", error?.stack);
    return res.status(500).json({
      success: false,
      message: "Server error during payment verification",
      error: error.message,
    });
  }
};