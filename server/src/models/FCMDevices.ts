import mongoose, { Document, Schema } from "mongoose";

export type FCMDeviceRole = "customer" | "chef" | "admin";

export interface IFCMDevice extends Document {
  userId: mongoose.Types.ObjectId;
  recipientName: string;
  token: string;
  role: FCMDeviceRole;
  appId: "com.katbox.app" | "com.katbox.chef";
  platform: "android" | "ios";
  deviceId?: string;
  enabled: boolean;
  lastRegisteredAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IFCMDevice>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Stored from the authenticated User document, never trusted from the app.
    recipientName: {
      type: String,
      default: "",
      trim: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ["customer", "chef", "admin"],
      required: true,
      index: true,
    },
    appId: {
      type: String,
      enum: ["com.katbox.app", "com.katbox.chef"],
      required: true,
    },
    platform: {
      type: String,
      enum: ["android", "ios"],
      required: true,
    },
    deviceId: {
      type: String,
      default: "",
    },
    enabled: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastRegisteredAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

schema.index({ userId:  1, role: 1, appId: 1, enabled: 1 });

export default
  mongoose.models.FCMDevice ||
  mongoose.model<IFCMDevice>("FCMDevice", schema);
