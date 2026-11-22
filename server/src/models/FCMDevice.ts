
import mongoose, { Schema, Document } from "mongoose";

export type FCMAppType = "customer" | "chef";
export type FCMPlatform = "android" | "ios";
export type FCMUserRole = "customer" | "admin" | "chef";

export interface IFCMDevice extends Document {
  userId: mongoose.Types.ObjectId;
  token: string;
  appType: FCMAppType;
  platform: FCMPlatform;
  role: FCMUserRole;
  deviceId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const fcmDeviceSchema = new Schema<IFCMDevice>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    token: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },

    appType: {
      type: String,
      enum: ["customer", "chef"],
      required: true,
    },

    platform: {
      type: String,
      enum: ["android", "ios"],
      required: true,
    },

    role: {
      type: String,
      enum: ["customer", "admin", "chef"],
      required: true,
    },

    deviceId: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

fcmDeviceSchema.index({ userId: 1, appType: 1 });

export default mongoose.models.FCMDevice ||
  mongoose.model<IFCMDevice>("FCMDevice", fcmDeviceSchema);
