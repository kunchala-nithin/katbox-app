import mongoose, { Schema, Document } from "mongoose";
import { cleanupChefData } from "../controllers/chef.controller";

export interface IBannerImage {
  url: string;
  cloudinaryId: string;
}

export interface ICouponItem {
  _id?: string;
  code: string;
  type: "percent" | "flat";
  value: string;
  description: string;
  minOrder?: number;
  maxDiscount?: number;
}

export interface IReviewItem {
  _id?: mongoose.Types.ObjectId;
  orderId: string;
  userId?: string;
  userName: string;
  userAvatar?: string;
  rating: number;
  comment: string;
  images: Array<{ url: string; cloudinaryId: string }>;
  createdAt: Date;
}

export interface IChef extends Document {
  user: mongoose.Types.ObjectId;
  name: string;
  exp: string;
  phone: string;
  aadhar: string;
  location: string;
  specialty: string;
  price: string;
  foodType: "VEG" | "NONVEG" | "BOTH";
  fssaiNo?: string;
  avatar: string;
  avatarCloudinaryId: string;

  // COUPONS
  coupons: ICouponItem[];

  // BANNER IMAGES
  banners: IBannerImage[];

  // REVIEWS & FEEDBACK
  reviews: IReviewItem[];
  averageRating: number;
  totalReviews: number;

  // AVAILABILITY STATUS
  isAvailable: boolean;

  // CHEF ORDER HISTORY
  orderHistory: mongoose.Types.ObjectId[];

  rating?: string;
  createdAt: Date;
  updatedAt: Date;
}

const bannerImageSchema = new Schema<IBannerImage>(
  {
    url: { type: String, required: true },
    cloudinaryId: { type: String, default: "" },
  },
  { _id: false }
);

const couponItemSchema = new Schema<ICouponItem>(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    type: { type: String, enum: ["percent", "flat"], default: "percent" },
    value: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    minOrder: { type: Number, default: 0 },
    maxDiscount: { type: Number, default: 500 },
  },
  { _id: true, timestamps: true }
);

const reviewItemSchema = new Schema<IReviewItem>(
  {
    orderId: { type: String, required: true },
    userId: { type: String, default: "" },
    userName: { type: String, required: true, default: "Customer" },
    userAvatar: { type: String, default: "" },
    rating: { type: Number, required: true, min: 1, max: 5 },
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
  },
  { _id: true, timestamps: true }
);

const chefSchema = new Schema<IChef>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    name: { type: String, required: true },
    exp: { type: String, required: true },
    phone: {
      type: String,
      default: "",
      trim: true,
      validate: {
        validator: function (v: string) {
          if (!v) return true;
          return /^\d{10}$/.test(v);
        },
        message: "Phone number must be exactly 10 digits",
      },
    },
    aadhar: {
      type: String,
      default: "",
      trim: true,
      validate: {
        validator: function (v: string) {
          if (!v) return true;
          return /^\d{12}$/.test(v);
        },
        message: "Aadhar number must be exactly 12 digits",
      },
    },
    location: { type: String, required: true },
    specialty: { type: String, required: true },
    price: { type: String, required: true },
    foodType: {
      type: String,
      enum: ["VEG", "NONVEG", "BOTH"],
      default: "BOTH",
    },
    fssaiNo: { type: String, default: "" },
    avatar: { type: String, required: true },
    avatarCloudinaryId: { type: String, default: "" },

    coupons: {
      type: [couponItemSchema],
      default: [],
    },

    banners: {
      type: [bannerImageSchema],
      default: [],
    },

    reviews: {
      type: [reviewItemSchema],
      default: [],
    },
    averageRating: { type: Number, default: 4.8 },
    totalReviews: { type: Number, default: 0 },

    // AVAILABILITY CONTROLS
    isAvailable: { type: Boolean, default: true },

    // CHEF ORDER HISTORY REFERENCE
    orderHistory: [
      {
        type: Schema.Types.ObjectId,
        ref: "Order",
      },
    ],

    rating: { type: String, default: "4.8" },
  },
  { timestamps: true }
);

chefSchema.post("deleteOne", { document: true, query: false }, async function () {
  const chef = this as any;
  if (chef?._id && chef?.user) {
    await cleanupChefData(chef._id.toString(), chef.user.toString());
  }
});

chefSchema.post("findOneAndDelete", async function (doc: any) {
  if (doc?._id && doc?.user) {
    await cleanupChefData(doc._id.toString(), doc.user.toString());
  }
});

export default mongoose.models.Chef || mongoose.model<IChef>("Chef", chefSchema);