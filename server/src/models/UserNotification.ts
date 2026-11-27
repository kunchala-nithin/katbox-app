import mongoose, { Document, Schema } from "mongoose";

export type NotificationDestination = "home" | "orders" | "profile" | "chef_orders" | "chef_profile";

export interface IUserNotification extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  message: string;
  imageUrl?: string;
  imagePublicId?: string;
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
  imagePublicId: { type: String, default: "", trim: true },
  destination: { type: String, enum: ["home", "orders", "profile", "chef_orders", "chef_profile"] },
  isRead: { type: Boolean, default: false, index: true },
  // Retention is enforced by the retryable cleanup worker. Do not add a MongoDB
  // TTL index here: MongoDB could delete this document before Cloudinary cleanup.
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 2 * 60 * 1000),
    index: true,
  },
}, { timestamps: true });

schema.index({ userId: 1, createdAt: -1 });
schema.index({ expiresAt: 1 });
export default mongoose.models.UserNotification || mongoose.model<IUserNotification>("UserNotification", schema);
