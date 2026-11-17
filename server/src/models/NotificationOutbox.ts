import mongoose, { Schema, Document } from "mongoose";

export interface INotificationOutbox extends Document {
  orderId: string;
  eventType: string;
  recipientUserId: string;
  recipientRole: "customer" | "chef" | "admin";
  payload: Record<string, any>;
  acceptedTokens: string[];
  status: "pending" | "processing" | "failed" | "accepted" | "cancelled";
  attempts: number;
  nextAttemptAt: Date;
  lockedAt?: Date;
  acceptedAt?: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const notificationOutboxSchema = new Schema<INotificationOutbox>(
  {
    orderId: { type: String, required: true, index: true },
    eventType: { type: String, required: true },
    recipientUserId: { type: String, required: true },
    recipientRole: { type: String, enum: ["customer", "chef", "admin"], required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    acceptedTokens: { type: [String], default: [] },
    status: { type: String, enum: ["pending", "processing", "failed", "accepted", "cancelled"], default: "pending", index: true },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now, index: true },
    lockedAt: { type: Date, default: null },
    acceptedAt: { type: Date, default: null },
    lastError: { type: String, default: "" },
  },
  { timestamps: true }
);

notificationOutboxSchema.index(
  { orderId: 1, eventType: 1, recipientUserId: 1, recipientRole: 1 },
  { unique: true, name: "uniq_order_notification_recipient_event" }
);

export default mongoose.models.NotificationOutbox ||
  mongoose.model<INotificationOutbox>("NotificationOutbox", notificationOutboxSchema);
