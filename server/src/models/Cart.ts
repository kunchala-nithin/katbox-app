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
  totalItems: number;
  totalPrice: number;
  extraItems: number; // ✅ NEW
  type: 'veg' | 'nonveg';
  status: 'in-cart' | 'ordered';
  // ✅ Homemade & Mealbox Fields Added Optional to Guarantee Backward Compatibility
  serviceType?: 'catering' | 'homemade' | 'mealbox';
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
}

const CartSchema = new Schema<ICart>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    userPhone: { type: String, default: '' },
    alternatePhone: { type: String, default: '' },
    restaurant: { type: Schema.Types.Mixed, required: false }, // Made optional for homemade / mealbox
    menu: { type: Schema.Types.Mixed, required: false },       // Made optional for homemade / mealbox
    selections: { type: Schema.Types.Mixed, required: false }, // Made optional for homemade / mealbox (stores weekday objects)
    addons: [{ type: Schema.Types.Mixed }],                     // ✅ ADDED MULTI-VENDOR CATERING ADDONS STATE INSTANCE
    orderDetails: { type: Schema.Types.Mixed, required: false }, // Made optional for homemade / mealbox

    specialInstructions: {
      spice: { type: String, default: '' },
      noOnionsGarlic: { type: Boolean, default: false },
      notes: { type: String, default: '' },
    },

    totalItems: { type: Number, required: true },
    totalPrice: { type: Number, required: true },

    // ✅🔥 NEW FIELD
    extraItems: { type: Number, default: 0 },

    type: { type: String, enum: ['veg', 'nonveg'], required: false, default: 'veg' },
    status: { type: String, enum: ['in-cart', 'ordered'], default: 'in-cart' },

    // ✅ Homemade & Mealbox Structure Additions
    serviceType: { type: String, enum: ['catering', 'homemade', 'mealbox'], default: 'catering' },
    chefId: { type: String },
    chefName: { type: String },
    items: { type: [Schema.Types.Mixed], default: [] },

    // ✅ Coupon Tracking Field Definitions
    couponCode: { type: String, default: null },
    discount: { type: Number, default: 0 },
    totalPriceAfterDiscount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export default mongoose.model<ICart>('Cart', CartSchema);