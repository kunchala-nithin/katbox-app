import mongoose, { Schema, Document } from "mongoose";
import { cleanupChefData } from "../controllers/chef.controller";

export interface IBannerImage {
  url: string;
  cloudinaryId: string;
}

export interface ICouponItem {
  code: string;
  type: "percent" | "flat";
  value: string;
  description: string;
}

export interface IChef extends Document {
  user: mongoose.Types.ObjectId;
  name: string;
  exp: string;
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
    code: { type: String, required: true },
    type: { type: String, enum: ["percent", "flat"], default: "percent" },
    value: { type: String, required: true },
    description: { type: String, default: "" },
  },
  { _id: true }
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