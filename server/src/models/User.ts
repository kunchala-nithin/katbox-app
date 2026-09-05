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
  name: string;
  phone: string;
  email?: string;
  /** Legacy string field kept in sync with activeAddress for backward compatibility */
  address?: string;
  activeAddress?: IActiveAddress;
  savedAddresses: ISavedAddress[];
  isChef: boolean;
  orderHistory: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const savedAddressSchema = new Schema<ISavedAddress>(
  {
    id: { type: String },
    title: { type: String, required: true },
    houseDetails: { type: String, default: "" },
    fullAddress: { type: String, required: true },
    latitude: { type: Number, default: 0 },
    longitude: { type: Number, default: 0 },
    tag: { type: String, enum: ["Home", "Work", "Other"], default: "Home" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const activeAddressSchema = new Schema<IActiveAddress>(
  {
    id: { type: String },
    title: { type: String, default: "Current Location" },
    houseDetails: { type: String, default: "" },
    fullAddress: { type: String, default: "" },
    latitude: { type: Number, default: 0 },
    longitude: { type: Number, default: 0 },
    tag: { type: String, enum: ["Home", "Work", "Other"], default: "Home" },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    email: { type: String, default: "" },
    address: { type: String, default: "" },
    activeAddress: { type: activeAddressSchema, default: null },
    savedAddresses: { type: [savedAddressSchema], default: [] },
    isChef: { type: Boolean, default: false },
    orderHistory: [
      {
        type: Schema.Types.ObjectId,
        ref: "Order",
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.models.User || mongoose.model<IUser>("User", userSchema);