// orders.controller.ts
import { Request, Response } from "express";
import mongoose from "mongoose";
import Order, {
  HomemadeOrderModel,
  CateringOrderModel,
  MealBoxOrderModel,
} from "../models/Orders";
import User from "../models/User";
import Chef from "../models/Chef";
import Cart from "../models/Cart";
import cloudinary from "../config/cloudinary";
import { io } from "..";
import { recalculateChefRating } from "./chef.controller";

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

const sendExpoPushNotification = async (pushToken: string, title: string, body: string, data: any = {}) => {
  if (!pushToken || typeof pushToken !== 'string' || !pushToken.startsWith('ExponentPushToken[')) return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: pushToken,
        sound: 'default',
        title,
        body,
        data,
      }),
    });
  } catch (err) {
    console.log('Expo push notification error:', err);
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
 * IMPORTANT: When an order is created, it goes ONLY to the Admin.
 * The chef is NOT notified here. Chef receives the order only after
 * admin verifies advance payment via /verify-advance.
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
    } = req.body;

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
    const resolvedServiceType = serviceType ? String(serviceType).toLowerCase() : "mealbox";
    const resolvedAddress = String(deliveryAddress || addressDetails || "");

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

    let savedOrder: any = null;

    if (resolvedServiceType === "homemade") {
      /* ─────────────────────────────────────────────────────────
         ✅ FIX — Parse the incoming `items` (which arrives as a
         JSON string via multipart/form-data) before sanitizing.
         This is the ONLY change to the homemade branch.
         ───────────────────────────────────────────────────────── */
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

      // ✅ Resolve the delivery slot label for homemade — prefer the new
      // top-level `deliverySlot` param, fall back to legacy `deliveryTimeSlot`.
      const resolvedHomemadeSlot = String(deliverySlot || deliveryTimeSlot || "30–45 min");

      const newHomemadeOrder = new HomemadeOrderModel({
        orderId: generatedOrderId,
        userId: finalUserId,
        userName: userName || "",
        userPhone: finalUserPhone,
        alternatePhone: finalAlternatePhone,
        chefId: effectiveChefId,
        chefName: effectiveChefName,
        chefPhone: resolvedChefPhone,
        serviceType: "homemade",
        items: sanitizedItems,
        deliveryAddress: resolvedAddress,
        deliveryTimeSlot: resolvedHomemadeSlot,
        // ✅ Persist the same slot under the new dedicated field so chef/admin
        // order screens can read either key without breaking older records.
        deliverySlot: resolvedHomemadeSlot,
        deliveryDate: deliveryDate || "Today",
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
          { status: "Placed", timestamp: new Date(), note: `Advance submitted (UTR: ${utrNumber || 'Screenshot Provided'}) - Verification Pending` },
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
          { status: "Placed", timestamp: new Date(), note: `Advance submitted (UTR: ${utrNumber || 'Screenshot Provided'}) - Verification Pending` },
        ],
      });

      savedOrder = await newCateringOrder.save();
    }
    else {
      const initialSchedules = sortedDeliveries.map((dateItem: string) => ({
        date: dateItem,
        status: "Scheduled",
        timeSlot: deliveryTimeSlot || "7:00 PM - 9:00 PM",
        address: resolvedAddress,
        statusTimeline: [
          { status: "Scheduled", timestamp: new Date(), note: `Delivery scheduled for ${dateItem}` },
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
          { status: "Placed", timestamp: new Date(), note: `Advance submitted (UTR: ${utrNumber || 'Screenshot Provided'}) - Verification Pending` },
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

      // ────────────────────────────────────────────────────────────────
      // IMPORTANT: Chef is NOT notified at order creation time.
      // The order stays with ADMIN first. Once admin verifies the advance
      // payment via `/verify-advance`, only then is `new_chef_order`
      // emitted to the chef (see verifyAdvancePayment below).
      // ────────────────────────────────────────────────────────────────
      io.emit("new_order_placed", savedOrder);
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
 * Called when Admin clicks "Payment Received".
 * After verification, the order is dispatched to the assigned chef.
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

      // Notify the customer
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

      // ────────────────────────────────────────────────────────────────
      // NOW send the order to the CHEF (only after admin verification).
      // This is the moment the chef's app will start showing the order
      // and playing the alarm.
      // ────────────────────────────────────────────────────────────────
      const chefIdentifier = order.chefId;
      let chefUserDoc: any = null;

      if (chefIdentifier && mongoose.Types.ObjectId.isValid(chefIdentifier)) {
        const chefDoc = await Chef.findById(chefIdentifier);
        if (chefDoc?.user) {
          chefUserDoc = await User.findById(chefDoc.user);
          io.to(String(chefDoc.user)).emit("new_chef_order", updatedOrder);
        }
      }
      if (!chefUserDoc && order.chefName) {
        const chefDoc = await Chef.findOne({ name: order.chefName });
        if (chefDoc?.user) {
          chefUserDoc = await User.findById(chefDoc.user);
          io.to(String(chefDoc.user)).emit("new_chef_order", updatedOrder);
        }
      }
      if (chefIdentifier) {
        io.to(String(chefIdentifier)).emit("new_chef_order", updatedOrder);
        io.to(String(chefIdentifier)).emit("order_updated", updatedOrder);
      }

      if (chefUserDoc?.pushToken) {
        await sendExpoPushNotification(
          chefUserDoc.pushToken,
          "🎉 New Verified Order!",
          `Order #${order.orderId} (₹${order.totalAmount}) payment received. Start preparing now!`,
          { orderId: order.orderId, screen: "chef-orders" }
        );
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
          order.targetDeliveryTime = calculateSlotTargetTime(
            (order as any).deliveryDate || (order as any).eventDate || "",
            (order as any).deliveryTimeSlot || (order as any).eventTime || ""
          );
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
 *
 * ✅ FIXED: Now ALSO mirrors the review into the corresponding Chef
 * document's `reviews[]` array (creating the review, preventing
 * duplicates by orderId), recalculates the chef's `averageRating`
 * and `totalReviews`, and emits a live socket event to the chef's
 * user room so their app can refresh in real-time.
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

    // ────────────────────────────────────────────────────────────────
    // ✅ MIRROR THE REVIEW INTO THE CHEF DOCUMENT'S `reviews[]` ARRAY
    // ────────────────────────────────────────────────────────────────
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
          // Resolve customer name / avatar from User doc when available
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
              // Silently ignore — fallback values already set
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

          // Recalculate averageRating & totalReviews based on the new reviews array
          try {
            await recalculateChefRating(chefDoc._id);
          } catch (recalcErr) {
            console.log("Recalculate chef rating warning:", recalcErr);
          }

          // Emit real-time notification to the chef's user room
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
      // Never fail the customer response because of chef-mirror errors
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