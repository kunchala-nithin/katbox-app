import mongoose, { Schema, Document } from "mongoose";

export interface ISavedAddress {
  _id?: mongoose.Types.ObjectId;
  id?: string;
  title: string;
  houseDetails?: string;
  fullAddress: string;
  latitude: number;
  longitude: number;
  tag: "Home" | "Work" | "Other";
  createdAt?: Date;
}

export interface IActiveAddress {
  id?: string;
  title: string;
  houseDetails?: string;
  fullAddress: string;
  latitude: number;
  longitude: number;
  tag: "Home" | "Work" | "Other";
  updatedAt?: Date;
}

export interface IUser extends Document {
  clerkId?: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  activeAddress?: IActiveAddress;
  savedAddresses: ISavedAddress[];
  isChef: boolean;
  isAdmin: boolean;
  /** Legacy single token retained for backwards compatibility. */
  pushToken?: string;
  /** Per-app tokens prevent the customer and standalone Chef apps overwriting each other. */
  customerPushToken?: string;
  adminPushToken?: string;
  chefPushToken?: string;
  orderHistory: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const savedAddressSchema = new Schema<ISavedAddress>({
  id: { type: String },
  title: { type: String, required: true },
  houseDetails: { type: String, default: "" },
  fullAddress: { type: String, required: true },
  latitude: { type: Number, default: 0 },
  longitude: { type: Number, default: 0 },
  tag: { type: String, enum: ["Home", "Work", "Other"], default: "Home" },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const activeAddressSchema = new Schema<IActiveAddress>({
  id: { type: String },
  title: { type: String, default: "Current Location" },
  houseDetails: { type: String, default: "" },
  fullAddress: { type: String, default: "" },
  latitude: { type: Number, default: 0 },
  longitude: { type: Number, default: 0 },
  tag: { type: String, enum: ["Home", "Work", "Other"], default: "Home" },
  updatedAt: { type: Date, default: Date.now },
}, { _id: false });

const userSchema = new Schema<IUser>({
  clerkId: { type: String, unique: true, sparse: true, trim: true },
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, default: "", trim: true, index: true },
  email: { type: String, default: "", trim: true, lowercase: true },
  address: { type: String, default: "" },
  activeAddress: { type: activeAddressSchema, default: null },
  savedAddresses: { type: [savedAddressSchema], default: [] },
  isChef: { type: Boolean, default: false },
  isAdmin: { type: Boolean, default: false },
  pushToken: { type: String, default: "" },
  customerPushToken: { type: String, default: "" },
  adminPushToken: { type: String, default: "" },
  chefPushToken: { type: String, default: "" },
  orderHistory: [{ type: Schema.Types.ObjectId, ref: "Order" }],
}, { timestamps: true });

userSchema.index({ phone: 1 }, {
  unique: true,
  partialFilterExpression: { phone: { $type: "string", $gt: "" } },
  name: "uniq_nonempty_user_phone",
});
userSchema.index({ email: 1 }, {
  unique: true,
  partialFilterExpression: { email: { $type: "string", $gt: "" } },
  name: "uniq_nonempty_user_email",
});

export default mongoose.models.User || mongoose.model<IUser>("User", userSchema);
