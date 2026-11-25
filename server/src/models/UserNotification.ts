import mongoose, { Document, Schema } from "mongoose";

export type NotificationDestination = "home" | "orders" | "profile" | "chef_orders" | "chef_profile";

export interface IUserNotification extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  message: string;
  imageUrl?: string;
  destination?: NotificationDestination;
  isRead: boolean;
  createdAt: Date;
  expiresAt: Date;
}

const schema = new Schema<IUserNotification>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 100 },
  message: { type: String, required: true, trim: true, maxlength: 1000 },
  imageUrl: { type: String, default: "" },
  destination: { type: String, enum: ["home", "orders", "profile", "chef_orders", "chef_profile"] },
  isRead: { type: Boolean, default: false, index: true },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), expires: 0 },
}, { timestamps: true });

schema.index({ userId: 1, createdAt: -1 });
export default mongoose.models.UserNotification || mongoose.model<IUserNotification>("UserNotification", schema);
