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

// ✅ NEW: Persisted special-instruction block (mirrors what the review screen builds)
export interface ISpecialInstruction {
  tag?: string;
  label?: string;
  text?: string;
}

// ✅ NEW (Prompt 2): Persisted quick-bites / homemade special-instructions block.
// This mirrors the EXACT shape that Prompt 1 stores on Cart.specialInstructions:
//   { spice: string, noOnionsGarlic: boolean, notes: string }
// It is additive and does NOT replace the legacy ISpecialInstruction block above.
export interface IQuickSpecialInstructions {
  spice?: string;
  noOnionsGarlic?: boolean;
  notes?: string;
}

// ✅ NEW: Catering menu structures.
// These describe the exact shape the catering review screen sends and that the
// orders screen ("Menu Items" preview) reads back. They are stored in Mixed
// fields, so the interfaces below are for type-safety/documentation only.
export interface ICateringSelectedItem {
  id?: string;
  name: string;
  // The client may send either `imageUrl` or `image`; both are supported on read.
  imageUrl?: string;
  image?: string;
  // Only meaningful for items that are charged extra (per plate).
  price?: number;
  // Optional category label if the item was sent in a flat list.
  category?: string;
  section?: string;
}

export interface ICateringSelectionCategory {
  // Category / course name shown as the card title (e.g. "Starters", "Main Course")
  category: string;
  // Max number of items included in the base price for this category
  max?: number;
  // Items included in the base plate price
  selected?: ICateringSelectedItem[];
  // Items picked beyond `max` (charged extra per plate)
  extraSelected?: ICateringSelectedItem[];
}

export interface ICateringAddon {
  id?: string;
  name: string;
  imageUrl?: string;
  image?: string;
  price?: number;
  // number of plates / units for this add-on
  count?: number;
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
  // ✅ absolute timestamps computed at order placement time
  orderPlacedAt?: Date;
  estimatedDeliveryAt?: Date;
  deliveryWindowMinutes?: number;
  // ✅ Geo coordinates for accurate map pinning
  latitude?: number;
  longitude?: number;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  paymentCaptured?: boolean;
  paidAt?: Date;

  // ✅ NEW: Special instructions block (persisted for all flows)
  specialInstruction?: ISpecialInstruction;
  specialInstructionTag?: string;
  specialInstructionLabel?: string;
  specialInstructionText?: string;

  // ✅ NEW (Prompt 2): Prompt 1's exact authoritative cart fields carried
  // forward onto the order for homemade / quickbites flows.
  // - quickDeliverySlot: the exact slot string stored on the cart (cart.deliverySlot).
  // - specialInstructions: the exact sub-doc shape stored on the cart
  //   (cart.specialInstructions = { spice, noOnionsGarlic, notes }).
  // These are ADDITIVE. The legacy specialInstruction* fields above remain
  // untouched for backward compatibility.
  quickDeliverySlot?: string;
  specialInstructions?: IQuickSpecialInstructions;

  // ✅ NEW: Delivery service type string (Standard / Doorstep / Doorstep + Service)
  deliveryType?: string;

  // ✅ NEW: Customer / chef order cancellation + refund tracking.
  // Only two sources are ever written by the backend:
  //   • "cancelled by customer"  → set by PATCH /:orderId/cancel
  //   • "cancelled by chef"      → set by the existing
  //                                PATCH /:orderId/status when status = "Cancelled"
  //                                (covers both chef decline AND admin override)
  cancellationReason?: string;
  cancellationSource?: string;
  cancelledAt?: Date;
  // COD rules: on a placed-stage cancellation, fee = 0 and refund = 0
  // because no customer payment has been collected. Never mark an unpaid
  // COD order as refunded.
  cancellationFee?: number;
  refundAmount?: number;
  refundStatus?: string;

  createdAt: Date;
  updatedAt: Date;
}

// 1. Separate Dedicated Interface for Homemade Orders ONLY.
// ✅ Also reused by QuickBites orders (which share the same schema).
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
  // ✅ QuickBites shares the homemade shape; only the discriminator differs.
  serviceType: "homemade" | "quickbites";
  items: IHomemadeOrderItem[];
  deliveryAddress: string;
  deliveryTimeSlot?: string;
  // ✅ New top-level delivery slot label for homemade orders (e.g. "9:00 AM - 11:00 AM")
  deliverySlot?: string;
  deliveryDate?: string;
  // ✅ QuickBites flag (persisted for downstream screens to render "arriving by X")
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
  // ✅ UPDATED: `selections` is persisted differently per service type:
  //    • catering → ICateringSelectionCategory[]  (category cards with selected/extraSelected)
  //    • mealbox  → Record<dayKey, any[]>          (e.g. { Mon: [...], Tue: [...] })
  //    Stored as Mixed so both shapes are accepted by the same discriminator schema.
  selections?: ICateringSelectionCategory[] | Record<string, any[]> | any;
  items?: any[];
  restaurantName?: string;
  restaurantImage?: string;
  occasion?: string;
  guests?: number;
  eventDate?: string;
  eventTime?: string;
  deliveryType?: string;
  pricePerPlate?: number;
  // ✅ UPDATED: typed catering add-ons (still stored as Mixed array)
  addons?: ICateringAddon[] | any[];
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

// ✅ NEW: Special instruction sub-schema (used to persist the exact
// tag/label/text built by the catering review screen)
const SpecialInstructionSchema = new Schema(
  {
    tag: { type: String, default: "" },
    label: { type: String, default: "" },
    text: { type: String, default: "" },
  },
  { _id: false }
);

// ✅ NEW (Prompt 2): Sub-schema mirroring the exact Cart.specialInstructions
// shape from Prompt 1. Purely additive — does NOT replace
// SpecialInstructionSchema above (that one continues to serve catering).
const QuickSpecialInstructionsSchema = new Schema(
  {
    spice: { type: String, default: "" },
    noOnionsGarlic: { type: Boolean, default: false },
    notes: { type: String, default: "" },
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
    // ✅ absolute timestamps computed at order placement time
    orderPlacedAt: { type: Date },
    estimatedDeliveryAt: { type: Date },
    deliveryWindowMinutes: { type: Number, default: 0 },
    // ✅ Geo coordinates for accurate map pinning
    latitude: { type: Number },
    longitude: { type: Number },
    razorpayOrderId: { type: String, default: "" },
    razorpayPaymentId: { type: String, default: "" },
    razorpaySignature: { type: String, default: "" },
    paymentCaptured: { type: Boolean, default: false },
    paidAt: { type: Date },

    // ✅ NEW: Special instruction persistence (all flows)
    specialInstruction: { type: SpecialInstructionSchema, default: { tag: "", label: "", text: "" } },
    specialInstructionTag: { type: String, default: "" },
    specialInstructionLabel: { type: String, default: "" },
    specialInstructionText: { type: String, default: "" },

    // ✅ NEW (Prompt 2): Prompt 1's authoritative cart fields carried forward.
    // Declared ONLY here on the base schema (same rule as deliveryType) to
    // avoid Mongoose "Cannot use duplicate schema path" errors from child
    // discriminators. `default: undefined` keeps older orders valid — a
    // missing field stays missing rather than being coerced into an empty
    // string/object, preserving backward compatibility.
    quickDeliverySlot: { type: String, default: undefined },
    specialInstructions: { type: QuickSpecialInstructionsSchema, default: undefined },

    // ✅ NEW: Delivery service type (Standard / Doorstep / Doorstep + Service)
    // ✅ IMPORTANT: This field MUST ONLY be declared here on the base schema.
    //    Declaring it again on child discriminator schemas causes Mongoose
    //    to throw a "Cannot use duplicate schema path" error at save() time.
    deliveryType: { type: String, default: "" },

    // ✅ NEW: Cancellation + refund tracking.
    // ✅ IMPORTANT: Declared ONLY on the base schema, matching the same
    //    duplicate-path rule as `deliveryType` / `quickDeliverySlot` /
    //    `specialInstructions`. Child discriminators must NOT redeclare
    //    these — doing so triggers Mongoose duplicate schema path errors.
    // Only two values are ever written for `cancellationSource`:
    //    • "cancelled by customer"
    //    • "cancelled by chef"
    cancellationReason: { type: String, default: "" },
    cancellationSource: { type: String, default: "" },
    cancelledAt: { type: Date },
    // COD policy: fee = 0 and refund = 0 on placed-stage cancellations
    // because no customer payment has been collected yet.
    cancellationFee: { type: Number, default: 0 },
    refundAmount: { type: Number, default: 0 },
    refundStatus: { type: String, default: "" },
  },
  {
    discriminatorKey: "serviceType",
    timestamps: true,
    // ✅ NEW: Keep empty objects/arrays inside Mixed fields (e.g. an empty
    //    `selections` object) instead of silently stripping them on save.
    minimize: false,
  }
);

const Order: Model<IBaseOrder> =
  mongoose.models.Order || mongoose.model<IBaseOrder>("Order", BaseOrderSchema);

// 3. HOMEMADE SCHEMA (also reused by QuickBites)
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

// ✅ IMPORTANT: Do NOT redeclare `deliveryType`, `quickDeliverySlot`,
//    `specialInstructions`, or any cancellation/refund field here — they
//    are already on the BaseOrderSchema. Redeclaring causes Mongoose
//    discriminator conflicts.
const HomemadeOrderSchema = new Schema({
  items: { type: [HomemadeItemSubSchema], required: true, default: [] },
  deliveryAddress: { type: String, required: true, default: "" },
  deliveryTimeSlot: { type: String, default: "30–45 min" },
  // ✅ Human-readable delivery slot label selected by user on the review screen
  deliverySlot: { type: String, default: "" },
  deliveryDate: { type: String, default: "Today" },
  // ✅ Persist the QuickBites flag so downstream UIs can render the live "arriving by X" banner
  isQuickBites: { type: Boolean, default: false },
});

// 4. MEALBOX & CATERING SCHEMA
// ✅ IMPORTANT: Do NOT redeclare `deliveryType`, `specialInstruction*`,
//    `quickDeliverySlot`, `specialInstructions`, or any cancellation/refund
//    field here. They already live on the BaseOrderSchema. Redeclaring
//    causes save() errors.
//
// ✅ NOTE ON CATERING MENU ITEMS:
//    `selections` (category cards → selected / extraSelected), `items` (flat list
//    fallback) and `addons` are all Mixed so the exact payload sent by the
//    catering review screen is persisted untouched and returned as-is by
//    GET /api/orders/my-orders. The orders screen reads them dynamically for the
//    "Menu Items" preview. If you ever mutate them in place on an existing
//    document, call `order.markModified("selections")` (or "items"/"addons")
//    before `order.save()`.
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
  pricePerPlate: { type: Number, default: 0 },
  addons: { type: [Schema.Types.Mixed], default: [] },
});

// Register Discriminators safely
export const HomemadeOrderModel =
  Order.discriminators && Order.discriminators["homemade"]
    ? (Order.discriminators["homemade"] as Model<IHomemadeOrder>)
    : Order.discriminator<IHomemadeOrder>("homemade", HomemadeOrderSchema);

// ✅ QuickBites is a dedicated discriminator reusing the homemade schema,
// so quickbites orders are stored with serviceType = "quickbites" on the
// SAME collection, keeping the data model unified.
export const QuickBitesOrderModel =
  Order.discriminators && Order.discriminators["quickbites"]
    ? (Order.discriminators["quickbites"] as Model<IHomemadeOrder>)
    : Order.discriminator<IHomemadeOrder>("quickbites", HomemadeOrderSchema);

export const CateringOrderModel =
  Order.discriminators && Order.discriminators["catering"]
    ? (Order.discriminators["catering"] as Model<IMealBoxOrCateringOrder>)
    : Order.discriminator<IMealBoxOrCateringOrder>("catering", MealBoxOrCateringSchema);

export const MealBoxOrderModel =
  Order.discriminators && Order.discriminators["mealbox"]
    ? (Order.discriminators["mealbox"] as Model<IMealBoxOrCateringOrder>)
    : Order.discriminator<IMealBoxOrCateringOrder>("mealbox", MealBoxOrCateringSchema);

export default Order;