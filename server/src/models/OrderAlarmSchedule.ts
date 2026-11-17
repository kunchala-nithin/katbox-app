import mongoose, { Schema, Document } from "mongoose";

export interface IOrderAlarmSchedule extends Document {
  orderId: string;
  eventType: string;
  recipientUserId: string;
  recipientRole: "chef" | "admin";
  payload: Record<string, any>;
  status: "active" | "stopped";
  repeatCount: number;
  nextRunAt: Date;
  lockedAt?: Date | null;
  stoppedAt?: Date | null;
  stopReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const orderAlarmScheduleSchema = new Schema<IOrderAlarmSchedule>({
  orderId: { type: String, required: true, index: true },
  eventType: { type: String, required: true },
  recipientUserId: { type: String, required: true },
  recipientRole: { type: String, enum: ["chef", "admin"], required: true },
  payload: { type: Schema.Types.Mixed, required: true },
  status: { type: String, enum: ["active", "stopped"], default: "active", index: true },
  repeatCount: { type: Number, default: 0 },
  nextRunAt: { type: Date, required: true, index: true },
  lockedAt: { type: Date, default: null },
  stoppedAt: { type: Date, default: null },
  stopReason: { type: String, default: "" },
}, { timestamps: true });

orderAlarmScheduleSchema.index(
  { orderId: 1, recipientUserId: 1, recipientRole: 1 },
  { unique: true, name: "uniq_order_alarm_schedule_recipient" }
);

export default mongoose.models.OrderAlarmSchedule ||
  mongoose.model<IOrderAlarmSchedule>("OrderAlarmSchedule", orderAlarmScheduleSchema);
