import mongoose, { Schema, Document } from "mongoose";

export interface IOrder extends Document {
  orderId: string;
  userId?: string;
  userName?: string;
  userPhone?: string;
  alternatePhone?: string;
  chefId?: string;
  chefName?: string;
  serviceType: string;
  menuName: string;
  menuImage: string;
  durationType: string;
  deliveryTimeSlot: string;
  addressDetails: string;
  deliveryDate: string;
  upcomingDeliveries: string[];
  pausedDates: string[];
  subtotal: number;
  deliveryPrice: number;
  discount: number;
  appliedCoupon?: string;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  statusTimeline?: Array<{
    status: string;
    timestamp: Date;
    note?: string;
  }>;
  prepStartedAt?: Date;
  targetDeliveryTime?: Date;
  actualDeliveredAt?: Date;
  deliveredOnTime?: boolean;
  gracePeriodMinutes?: number;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  paymentCaptured?: boolean;
  paidAt?: Date;
  selections?: any;
  items?: any[];
  // Dedicated Catering Event Fields
  restaurantName?: string;
  restaurantImage?: string;
  occasion?: string;
  guests?: number;
  eventDate?: string;
  eventTime?: string;
  deliveryType?: string;
  pricePerPlate?: number;
  addons?: any[];
  createdAt: Date;
  updatedAt: Date;
}

const OrderSchema: Schema = new Schema(
  {
    orderId: { type: String, required: true, unique: true },
    userId: { type: String, default: "", index: true },
    userName: { type: String, default: "" },
    userPhone: { type: String, default: "" },
    alternatePhone: { type: String, default: "" },
    chefId: { type: String, default: "" },
    chefName: { type: String, default: "" },
    serviceType: { type: String, default: "mealbox" },
    menuName: { type: String, required: true },
    menuImage: { type: String, default: "" },
    durationType: { type: String, default: "" },
    deliveryTimeSlot: { type: String, default: "" },
    addressDetails: { type: String, default: "" },
    deliveryDate: { type: String, default: "" },
    upcomingDeliveries: { type: [String], default: [] },
    pausedDates: { type: [String], default: [] },
    subtotal: { type: Number, required: true, default: 0 },
    deliveryPrice: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    appliedCoupon: { type: String, default: "" },
    totalAmount: { type: Number, required: true, default: 0 },
    paymentMethod: { type: String, required: true, default: "cod" },
    paymentStatus: { type: String, default: "Pending" },
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
    prepStartedAt: { type: Date },
    targetDeliveryTime: { type: Date },
    actualDeliveredAt: { type: Date },
    deliveredOnTime: { type: Boolean, default: true },
    gracePeriodMinutes: { type: Number, default: 0 },
    razorpayOrderId: { type: String, default: "" },
    razorpayPaymentId: { type: String, default: "" },
    razorpaySignature: { type: String, default: "" },
    paymentCaptured: { type: Boolean, default: false },
    paidAt: { type: Date },
    selections: { type: Schema.Types.Mixed, default: null },
    items: { type: Schema.Types.Mixed, default: [] },
    
    // Catering Specific MongoDB Schema Definition
    restaurantName: { type: String, default: "" },
    restaurantImage: { type: String, default: "" },
    occasion: { type: String, default: "" },
    guests: { type: Number, default: 0 },
    eventDate: { type: String, default: "" },
    eventTime: { type: String, default: "" },
    deliveryType: { type: String, default: "Standard" },
    pricePerPlate: { type: Number, default: 0 },
    addons: { type: [Schema.Types.Mixed], default: [] },
  },
  { timestamps: true }
);

export default mongoose.models.Order || mongoose.model<IOrder>("Order", OrderSchema);