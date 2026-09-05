import { Request, Response } from "express";
import mongoose from "mongoose";
import Order from "../models/Orders";
import User from "../models/User";
import Chef from "../models/Chef";
import Cart from "../models/Cart";
import { io } from "..";

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

/**
 * Calculates end of delivery slot from slot string
 */
const calculateSlotTargetTime = (dateStr: string, slotStr: string): Date => {
  const now = new Date();
  try {
    let target = new Date();
    if (slotStr && slotStr.includes("-")) {
      const parts = slotStr.split("-");
      const endPart = parts[1].trim(); // e.g. "9:00 PM" or "09:00 AM"
      const [time, modifier] = endPart.split(" ");
      let [hours, minutes] = time.split(":").map(Number);
      if (modifier?.toUpperCase() === "PM" && hours < 12) hours += 12;
      if (modifier?.toUpperCase() === "AM" && hours === 12) hours = 0;
      target.setHours(hours, minutes || 0, 0, 0);
      if (target.getTime() <= now.getTime()) {
        target = new Date(now.getTime() + 45 * 60 * 1000); // 45 min default preparation window
      }
    } else {
      target = new Date(now.getTime() + 45 * 60 * 1000);
    }
    return target;
  } catch (e) {
    return new Date(now.getTime() + 45 * 60 * 1000);
  }
};

/**
 * POST /api/orders/create
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
      addressDetails,
      deliveryDate,
      upcomingDeliveries,
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

    const generatedOrderId = "KB" + Date.now().toString().slice(-8);
    const sortedDeliveries = Array.isArray(upcomingDeliveries) ? sortDatesAscending(upcomingDeliveries) : [];
    const effectiveChefId = String(chefId || "");
    const effectiveChefName = chefName || restaurantName || "";
    const effectiveRestaurantName = restaurantName || chefName || "";

    const newOrder = new Order({
      orderId: generatedOrderId,
      userId: finalUserId,
      userName: userName || "",
      userPhone: finalUserPhone,
      alternatePhone: finalAlternatePhone,
      chefId: effectiveChefId,
      chefName: effectiveChefName,
      serviceType: serviceType || "mealbox",
      menuName: menuName || "Meal Plan",
      menuImage: menuImage || restaurantImage || "",
      durationType: durationType || "",
      deliveryTimeSlot: deliveryTimeSlot || eventTime || "7:00 PM - 9:00 PM",
      addressDetails: addressDetails || "",
      deliveryDate: deliveryDate || eventDate || "",
      upcomingDeliveries: sortedDeliveries,
      pausedDates: [],
      subtotal: Number(subtotal) || 0,
      deliveryPrice: Number(deliveryPrice) || 0,
      discount: Number(discount) || 0,
      appliedCoupon: appliedCoupon || "",
      totalAmount: Number(totalAmount) || 0,
      paymentMethod: paymentMethod || "cod",
      paymentStatus: paymentMethod === "cod" ? "Pending Cash Collection" : "Paid",
      orderStatus: "Placed",
      statusTimeline: [{ status: "Placed", timestamp: new Date(), note: "Order placed by customer" }],
      selections: selections || null,
      items: items || [],
      restaurantName: effectiveRestaurantName,
      restaurantImage: restaurantImage || menuImage || "",
      occasion: occasion || "",
      guests: Number(guests) || 0,
      eventDate: eventDate || deliveryDate || "",
      eventTime: eventTime || deliveryTimeSlot || "",
      deliveryType: deliveryType || "Standard",
      pricePerPlate: Number(pricePerPlate) || 0,
      addons: Array.isArray(addons) ? addons : [],
    });

    const savedOrder = await newOrder.save();

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
      if (effectiveChefId) {
        io.to(effectiveChefId).emit("new_chef_order", savedOrder);
      }
      io.emit("new_order_placed", savedOrder);
    } catch (e) {
      console.log("Socket emit warning:", e);
    }

    return res.status(201).json({
      success: true,
      message: "Order placed successfully",
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
 * GET /api/orders/chef-orders
 */
export const getChefOrders = async (req: AuthRequest, res: Response) => {
  try {
    const rawUserId = req.user?.userId || req.user?._id || req.user?.id;

    if (!rawUserId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
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
 * Handles dynamic transitions: Accepted, Preparing, Prepared and Packing, Out for Delivery, Delivered, Cash Collected
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
    order.statusTimeline = order.statusTimeline || [];

    if (normalized === "Cash Collected" || normalized === "cash_collected") {
      order.paymentStatus = "Collected";
      order.paymentCaptured = true;
      order.paidAt = new Date();
      order.statusTimeline.push({
        status: "Payment Collected",
        timestamp: new Date(),
        note: "Cash collected by delivery person / chef",
      });
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
            order.deliveryDate || order.eventDate || "",
            order.deliveryTimeSlot || order.eventTime || ""
          );
        }
      }

      if (normalized === "Delivered") {
        order.actualDeliveredAt = new Date();
        const target = order.targetDeliveryTime ? new Date(order.targetDeliveryTime).getTime() : Date.now();
        const graceMs = (order.gracePeriodMinutes || 0) * 60 * 1000;
        order.deliveredOnTime = Date.now() <= target + graceMs;
      }
    }

    const updatedOrder = await order.save();

    try {
      io.emit("order_status_updated", updatedOrder);
      if (order.userId) {
        io.to(order.userId).emit("order_status_updated", updatedOrder);
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
 * PATCH /api/orders/:orderId/extend-timer
 * Extends order delivery buffer by 5 minutes when getting late
 */
export const extendOrderTimer = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId } = req.params;
    const { additionalMinutes = 5 } = req.body;

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    order.gracePeriodMinutes = (order.gracePeriodMinutes || 0) + Number(additionalMinutes);
    if (order.targetDeliveryTime) {
      const currentTarget = new Date(order.targetDeliveryTime).getTime();
      order.targetDeliveryTime = new Date(currentTarget + Number(additionalMinutes) * 60 * 1000);
    }

    const updatedOrder = await order.save();

    try {
      io.emit("order_timer_extended", updatedOrder);
      if (order.userId) {
        io.to(order.userId).emit("order_timer_extended", updatedOrder);
      }
    } catch (e) {
      console.log("Socket emit warning:", e);
    }

    return res.status(200).json({
      success: true,
      message: `Timer extended by ${additionalMinutes} mins`,
      order: updatedOrder,
    });
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

    if (!rawUserId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

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

    return res.status(200).json({
      success: true,
      orders,
    });
  } catch (error: any) {
    console.error("Error fetching user orders:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user orders",
      error: error.message,
    });
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

    if (!rawUserId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const userIdStr = String(rawUserId);

    const order = await Order.findOne({
      orderId,
      $or: [{ userId: userIdStr }, { userId: rawUserId }],
    });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    order.orderStatus = "Paused";

    if (dateStr) {
      if (!Array.isArray(order.pausedDates)) order.pausedDates = [];
      if (!order.pausedDates.includes(dateStr)) order.pausedDates.push(dateStr);
    }

    const updatedOrder = await order.save();

    return res.status(200).json({
      success: true,
      message: "Order date paused successfully",
      order: updatedOrder,
    });
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

    if (!rawUserId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const userIdStr = String(rawUserId);

    const order = await Order.findOne({
      orderId,
      $or: [{ userId: userIdStr }, { userId: rawUserId }],
    });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (dateStr && Array.isArray(order.pausedDates)) {
      order.pausedDates = order.pausedDates.filter((d: string) => d !== dateStr);
    }

    if (!order.pausedDates || order.pausedDates.length === 0) {
      order.orderStatus = "Placed";
    }

    const updatedOrder = await order.save();

    return res.status(200).json({
      success: true,
      message: "Order date unpaused successfully",
      order: updatedOrder,
    });
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
    const { oldDate, newDate, upcomingDeliveries } = req.body;

    if (!rawUserId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const userIdStr = String(rawUserId);

    const order = await Order.findOne({
      orderId,
      $or: [{ userId: userIdStr }, { userId: rawUserId }],
    });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (Array.isArray(upcomingDeliveries)) {
      order.upcomingDeliveries = sortDatesAscending(upcomingDeliveries);
    } else if (oldDate && newDate) {
      const updatedDeliveries = order.upcomingDeliveries.map((dateStr: string) =>
        dateStr === oldDate ? newDate : dateStr
      );
      order.upcomingDeliveries = sortDatesAscending(updatedDeliveries);

      if (order.deliveryDate === oldDate) order.deliveryDate = newDate;
    }

    if (order.selections && typeof order.selections === "object" && oldDate && newDate) {
      const oldDayName = oldDate.split(" ")[0].replace(",", "");
      const newDayName = newDate.split(" ")[0].replace(",", "");

      if (order.selections[oldDayName] && !order.selections[newDayName]) {
        order.selections[newDayName] = order.selections[oldDayName];
        order.markModified("selections");
      }
    }

    if (oldDate && Array.isArray(order.pausedDates)) {
      order.pausedDates = order.pausedDates.filter((d: string) => d !== oldDate && d !== newDate);
    }

    if (!order.pausedDates || order.pausedDates.length === 0) {
      order.orderStatus = "Placed";
    }

    const updatedOrder = await order.save();

    return res.status(200).json({
      success: true,
      message: "Order delivery rescheduled successfully",
      order: updatedOrder,
    });
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

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    return res.status(200).json({ success: true, order });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};