import mongoose, { Schema, Document, Model } from "mongoose";

// Subdocument interface for tracking individual scheduled deliveries
export interface IDeliverySchedule {
  date: string;
  status: string;
  timeSlot: string;
  address: string;
  // ✅ NEW: per-schedule coordinates for precise map pinning
  latitude?: number;
  longitude?: number;
  actualDeliveredAt?: Date;
  statusTimeline: Array<{
    status: string;
    timestamp: Date;
    note?: string;
  }>;
}

// Feedback Sub-interface
export interface IOrderFeedback {
  rating: number;
  comment: string;
  images: Array<{ url: string; cloudinaryId: string }>;
  isSubmitted: boolean;
  submittedAt?: Date;
}

// Base Interface for Shared Order Properties
export interface IBaseOrder extends Document {
  orderId: string;
  userId?: string;
  userName?: string;
  userPhone?: string;
  alternatePhone?: string;
  chefId?: string;
  chefName?: string;
  chefPhone?: string;
  serviceType: string;
  subtotal: number;
  deliveryPrice: number;
  discount: number;
  appliedCoupon?: string;
  totalAmount: number;
  advancePaidAmount: number;
  balanceAmountToCollect: number;
  utrNumber?: string;
  advancePaymentScreenshot?: { url: string; cloudinaryId: string };
  isAdvanceVerified: boolean;
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  statusTimeline?: Array<{
    status: string;
    timestamp: Date;
    note?: string;
  }>;
  deliverySchedules?: IDeliverySchedule[];
  feedback?: IOrderFeedback;
  lastFeedbackNotificationAt?: Date;
  feedbackNotificationCount?: number;
  prepStartedAt?: Date;
  targetDeliveryTime?: Date;
  actualDeliveredAt?: Date;
  deliveredOnTime?: boolean;
  gracePeriodMinutes?: number;
  // ✅ NEW: absolute timestamps computed at order placement time
  orderPlacedAt?: Date;
  estimatedDeliveryAt?: Date;
  deliveryWindowMinutes?: number;
  // ✅ NEW: Geo coordinates for accurate map pinning
  latitude?: number;
  longitude?: number;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  paymentCaptured?: boolean;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// 1. Separate Dedicated Interface for Homemade Orders ONLY
export interface IHomemadeOrderItem {
  id: string;
  name: string;
  image?: string;
  price: number;
  quantity: number;
  selectedQtyConfig?: string;
  isVeg?: boolean;
}

export interface IHomemadeOrder extends IBaseOrder {
  serviceType: "homemade";
  items: IHomemadeOrderItem[];
  deliveryAddress: string;
  deliveryTimeSlot?: string;
  // ✅ New top-level delivery slot label for homemade orders (e.g. "9:00 AM - 11:00 AM")
  deliverySlot?: string;
  deliveryDate?: string;
  // ✅ NEW: QuickBites flag (persisted for downstream screens to render "arriving by X")
  isQuickBites?: boolean;
}

// 2. Separate Interface for MealBox & Catering Orders
export interface IMealBoxOrCateringOrder extends IBaseOrder {
  menuName: string;
  menuImage: string;
  durationType?: string;
  deliveryTimeSlot?: string;
  addressDetails?: string;
  deliveryDate?: string;
  upcomingDeliveries?: string[];
  pausedDates?: string[];
  selections?: any;
  items?: any[];
  restaurantName?: string;
  restaurantImage?: string;
  occasion?: string;
  guests?: number;
  eventDate?: string;
  eventTime?: string;
  deliveryType?: string;
  pricePerPlate?: number;
  addons?: any[];
}

export type IOrder = IHomemadeOrder | IMealBoxOrCateringOrder;

// Individual Schedule Sub-Schema
const DeliveryScheduleSchema = new Schema(
  {
    date: { type: String, required: true },
    status: { type: String, required: true, default: "Scheduled" },
    timeSlot: { type: String, default: "7:00 PM - 9:00 PM" },
    address: { type: String, default: "" },
    // ✅ NEW: coordinates per scheduled delivery slot
    latitude: { type: Number },
    longitude: { type: Number },
    actualDeliveredAt: { type: Date },
    statusTimeline: {
      type: [
        {
          status: { type: String },
          timestamp: { type: Date, default: Date.now },
          note: { type: String },
        },
      ],
      default: [],
    },
  },
  { _id: true }
);

// Feedback Sub-Schema
const FeedbackSchema = new Schema(
  {
    rating: { type: Number, default: 0, min: 0, max: 5 },
    comment: { type: String, default: "", trim: true },
    images: {
      type: [
        {
          url: { type: String, required: true },
          cloudinaryId: { type: String, default: "" },
        },
      ],
      default: [],
    },
    isSubmitted: { type: Boolean, default: false },
    submittedAt: { type: Date },
  },
  { _id: false }
);

// Base Schema
const BaseOrderSchema: Schema = new Schema(
  {
    orderId: { type: String, required: true, unique: true },
    userId: { type: String, default: "", index: true },
    userName: { type: String, default: "" },
    userPhone: { type: String, default: "" },
    alternatePhone: { type: String, default: "" },
    chefId: { type: String, default: "" },
    chefName: { type: String, default: "" },
    chefPhone: { type: String, default: "" },
    serviceType: { type: String, required: true, default: "mealbox" },
    subtotal: { type: Number, required: true, default: 0 },
    deliveryPrice: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    appliedCoupon: { type: String, default: "" },
    totalAmount: { type: Number, required: true, default: 0 },
    advancePaidAmount: { type: Number, default: 0 },
    balanceAmountToCollect: { type: Number, default: 0 },
    utrNumber: { type: String, default: "" },
    advancePaymentScreenshot: {
      url: { type: String, default: "" },
      cloudinaryId: { type: String, default: "" },
    },
    isAdvanceVerified: { type: Boolean, default: false },
    paymentMethod: { type: String, required: true, default: "cod" },
    paymentStatus: { type: String, default: "Verification Pending" },
    orderStatus: { type: String, default: "Placed" },
    statusTimeline: {
      type: [
        {
          status: { type: String },
          timestamp: { type: Date, default: Date.now },
          note: { type: String },
        },
      ],
      default: [],
    },
    deliverySchedules: { type: [DeliveryScheduleSchema], default: [] },
    feedback: { type: FeedbackSchema, default: { isSubmitted: false, rating: 0, comment: "", images: [] } },
    lastFeedbackNotificationAt: { type: Date },
    feedbackNotificationCount: { type: Number, default: 0 },
    prepStartedAt: { type: Date },
    targetDeliveryTime: { type: Date },
    actualDeliveredAt: { type: Date },
    deliveredOnTime: { type: Boolean, default: true },
    gracePeriodMinutes: { type: Number, default: 0 },
    // ✅ NEW: absolute timestamps computed at order placement time
    orderPlacedAt: { type: Date },
    estimatedDeliveryAt: { type: Date },
    deliveryWindowMinutes: { type: Number, default: 0 },
    // ✅ NEW: Geo coordinates for accurate map pinning
    latitude: { type: Number },
    longitude: { type: Number },
    razorpayOrderId: { type: String, default: "" },
    razorpayPaymentId: { type: String, default: "" },
    razorpaySignature: { type: String, default: "" },
    paymentCaptured: { type: Boolean, default: false },
    paidAt: { type: Date },
  },
  {
    discriminatorKey: "serviceType",
    timestamps: true,
  }
);

const Order: Model<IBaseOrder> =
  mongoose.models.Order || mongoose.model<IBaseOrder>("Order", BaseOrderSchema);

// 3. PURE HOMEMADE SCHEMA
const HomemadeItemSubSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    image: { type: String, default: "" },
    price: { type: Number, required: true, default: 0 },
    quantity: { type: Number, required: true, default: 1 },
    selectedQtyConfig: { type: String, default: "Standard Serving" },
    isVeg: { type: Boolean, default: true },
  },
  { _id: false }
);

const HomemadeOrderSchema = new Schema({
  items: { type: [HomemadeItemSubSchema], required: true, default: [] },
  deliveryAddress: { type: String, required: true, default: "" },
  deliveryTimeSlot: { type: String, default: "30–45 min" },
  // ✅ Human-readable delivery slot label selected by user on the review screen
  deliverySlot: { type: String, default: "" },
  deliveryDate: { type: String, default: "Today" },
  // ✅ NEW: Persist the QuickBites flag so downstream UIs can render the live "arriving by X" banner
  isQuickBites: { type: Boolean, default: false },
});

// 4. MEALBOX & CATERING SCHEMA
const MealBoxOrCateringSchema = new Schema({
  menuName: { type: String, default: "Meal Plan" },
  menuImage: { type: String, default: "" },
  durationType: { type: String, default: "" },
  deliveryTimeSlot: { type: String, default: "" },
  addressDetails: { type: String, default: "" },
  deliveryDate: { type: String, default: "" },
  upcomingDeliveries: { type: [String], default: [] },
  pausedDates: { type: [String], default: [] },
  selections: { type: Schema.Types.Mixed, default: null },
  items: { type: Schema.Types.Mixed, default: [] },
  restaurantName: { type: String, default: "" },
  restaurantImage: { type: String, default: "" },
  occasion: { type: String, default: "" },
  guests: { type: Number, default: 0 },
  eventDate: { type: String, default: "" },
  eventTime: { type: String, default: "" },
  deliveryType: { type: String, default: "Standard" },
  pricePerPlate: { type: Number, default: 0 },
  addons: { type: [Schema.Types.Mixed], default: [] },
});

// Register Discriminators safely
export const HomemadeOrderModel =
  Order.discriminators && Order.discriminators["homemade"]
    ? (Order.discriminators["homemade"] as Model<IHomemadeOrder>)
    : Order.discriminator<IHomemadeOrder>("homemade", HomemadeOrderSchema);

export const CateringOrderModel =
  Order.discriminators && Order.discriminators["catering"]
    ? (Order.discriminators["catering"] as Model<IMealBoxOrCateringOrder>)
    : Order.discriminator<IMealBoxOrCateringOrder>("catering", MealBoxOrCateringSchema);

export const MealBoxOrderModel =
  Order.discriminators && Order.discriminators["mealbox"]
    ? (Order.discriminators["mealbox"] as Model<IMealBoxOrCateringOrder>)
    : Order.discriminator<IMealBoxOrCateringOrder>("mealbox", MealBoxOrCateringSchema);

export default Order;