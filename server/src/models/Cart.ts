import mongoose, { Schema, Document } from 'mongoose';

interface ICart extends Document {
  user: mongoose.Types.ObjectId;
  userPhone?: string;
  alternatePhone?: string;
  restaurant: any;
  menu: any;
  selections: any;
  addons: any[]; // ✅ ADDED DYNAMIC TRACKING STATE FOR ADD-ONS
  orderDetails: any;
  specialInstructions: {
    spice: string;
    noOnionsGarlic: boolean;
    notes: string;
  };
  // ✅ NEW: Single nested field containing the raw tag+label+text picked on the review screen.
  //    Populated for ALL service types (catering, mealbox, homemade, quickbites).
  specialInstruction: {
    tag: string;
    label: string;
    text: string;
  };
  totalItems: number;
  totalPrice: number;
  extraItems: number; // ✅ NEW
  type: 'veg' | 'nonveg';
  status: 'in-cart' | 'ordered';
  // ✅ Homemade, Mealbox & QuickBites Fields Added Optional to Guarantee Backward Compatibility
  serviceType?: 'catering' | 'homemade' | 'mealbox' | 'quickbites';
  chefId?: string;
  chefName?: string;
  items?: Array<{
    id: string;
    name: string;
    image: string;
    price: number;
    quantity: number;
    selectedQtyConfig: string;
  }>;
  // ✅ Coupon and Discount Tracking State Fields
  couponCode?: string;
  discount?: number;
  totalPriceAfterDiscount?: number;
  // ✅ Homemade Delivery Date & Slot Fields (Optional, Only Used By Homemade / QuickBites Flow)
  deliveryDate?: string;
  deliverySlot?: string;
  // ✅ NEW: absolute timestamps for the delivery window (only meaningful for homemade / QuickBites)
  estimatedDeliveryAt?: Date;
  deliveryWindowMinutes?: number;
  isQuickBites?: boolean;
}

const CartSchema = new Schema<ICart>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    userPhone: { type: String, default: '' },
    alternatePhone: { type: String, default: '' },
    restaurant: { type: Schema.Types.Mixed, required: false }, // Made optional for homemade / mealbox / quickbites
    menu: { type: Schema.Types.Mixed, required: false },       // Made optional for homemade / mealbox / quickbites
    selections: { type: Schema.Types.Mixed, required: false }, // Made optional for homemade / mealbox / quickbites (stores weekday objects)
    addons: [{ type: Schema.Types.Mixed }],                     // ✅ ADDED MULTI-VENDOR CATERING ADDONS STATE INSTANCE
    orderDetails: { type: Schema.Types.Mixed, required: false }, // Made optional for homemade / mealbox / quickbites

    specialInstructions: {
      spice: { type: String, default: '' },
      noOnionsGarlic: { type: Boolean, default: false },
      notes: { type: String, default: '' },
    },

    // ✅ NEW: Nested special instruction object with tag + human-readable label + free-text
    //    Populated for ALL service types.
    specialInstruction: {
      tag: { type: String, default: '' },
      label: { type: String, default: '' },
      text: { type: String, default: '' },
    },

    totalItems: { type: Number, required: true },
    totalPrice: { type: Number, required: true },

    // ✅🔥 NEW FIELD
    extraItems: { type: Number, default: 0 },

    type: { type: String, enum: ['veg', 'nonveg'], required: false, default: 'veg' },
    status: { type: String, enum: ['in-cart', 'ordered'], default: 'in-cart' },

    // ✅ Homemade, Mealbox & QuickBites Structure Additions
    serviceType: { type: String, enum: ['catering', 'homemade', 'mealbox', 'quickbites'], default: 'catering' },
    chefId: { type: String },
    chefName: { type: String },
    items: { type: [Schema.Types.Mixed], default: [] },

    // ✅ Coupon Tracking Field Definitions
    couponCode: { type: String, default: null },
    discount: { type: Number, default: 0 },
    totalPriceAfterDiscount: { type: Number, default: 0 },

    // ✅ Homemade Delivery Date & Slot Field Definitions
    // Only populated for the homemade / quickbites flow. Left empty for mealbox & catering.
    deliveryDate: { type: String, default: '' },
    deliverySlot: { type: String, default: '' },

    // ✅ NEW: Absolute timestamps for the delivery window (only meaningful for homemade / QuickBites)
    estimatedDeliveryAt: { type: Date },
    deliveryWindowMinutes: { type: Number, default: 0 },
    isQuickBites: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export default mongoose.model<ICart>('Cart', CartSchema);