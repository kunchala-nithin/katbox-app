import FCMDevice from "../models/FCMDevices";
import Order from "../models/Orders";
import OrderAlarmSchedule from "../models/OrderAlarmSchedule";
import NotificationOutbox from "../models/NotificationOutbox";
import User from "../models/User";
import { sendFCMToUser, FCMNotificationPayload } from "./fcm";

type RecipientRole = "customer" | "chef" | "admin";

export const sendOrderNotification = async (args: {
  orderId: string;
  eventType?: string;
  recipientUserId: string;
  recipientRole: RecipientRole;
  payload: FCMNotificationPayload;
}): Promise<{ acceptedTokens: string[]; failedTokens: string[] }> => {
  if (!args.orderId || !args.recipientUserId) return { acceptedTokens: [], failedTokens: [] };
  try {
    let recipientName = "";
    try {
      const recipient = await User.findById(args.recipientUserId).select("name").lean();
      recipientName = String(recipient?.name || "").trim();
    } catch (recipientLookupError) {
      // Name lookup is metadata only; it must not block a valid push send.
      console.warn(`[FCM] Recipient name lookup failed: role=${args.recipientRole}, user=${args.recipientUserId}`);
    }

    const result = await sendFCMToUser(args.recipientUserId, args.recipientRole, args.payload);
    if (result.acceptedTokens.length === 0) {
      console.warn(`[FCM] No accepted device tokens: role=${args.recipientRole}, user=${args.recipientUserId}, order=${args.orderId}`);
    }

    // Persist the actual recipient identity with the notification record.
    // "accepted" means FCM accepted at least one device send; it does not
    // claim that the operating system displayed the notification.
    try {
      const eventType = args.eventType || "order_notification";
      const accepted = result.acceptedTokens.length > 0;
      await NotificationOutbox.findOneAndUpdate(
        { orderId: args.orderId, eventType, recipientUserId: args.recipientUserId, recipientRole: args.recipientRole },
        {
          $set: {
            recipientName,
            payload: args.payload,
            acceptedTokens: result.acceptedTokens,
            status: accepted ? "accepted" : "failed",
            attempts: 1,
            acceptedAt: accepted ? new Date() : null,
            lastError: accepted ? "" : "No registered device accepted the notification",
          },
          $setOnInsert: { nextAttemptAt: new Date() },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch (recordError) {
      // A notification-history write must never undo a successful FCM send.
      console.error(`[FCM] Notification record persistence failed: order=${args.orderId}, role=${args.recipientRole}`, recordError);
    }

    // Only the initial new-order alarm starts a repeat schedule. Status/customer
    // notifications never create repeating alarms.
    if ((args.recipientRole === "chef" || args.recipientRole === "admin") && /_(chef|admin)_alarm$/.test(args.eventType || "")) {
      await OrderAlarmSchedule.findOneAndUpdate(
        { orderId: args.orderId, recipientUserId: args.recipientUserId, recipientRole: args.recipientRole },
        { $set: { eventType: args.eventType || "new_order_alarm", recipientName, payload: args.payload, status: "active", nextRunAt: new Date(Date.now() + 3 * 60 * 1000), stoppedAt: null, stopReason: "" }, $setOnInsert: { repeatCount: 0 } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
    return result;
  } catch (error) {
    console.error(`[FCM] Delivery error: order=${args.orderId}, role=${args.recipientRole}`, error);
    return { acceptedTokens: [], failedTokens: [] };
  }
};

export const stopOrderAlarmSchedules = async (orderId: string, reason = "order_status_changed"): Promise<void> => {
  await OrderAlarmSchedule.updateMany(
    { orderId, status: "active" },
    { $set: { status: "stopped", stoppedAt: new Date(), stopReason: reason }, $unset: { lockedAt: 1 } }
  );
};

let alarmWorkerRunning = false;
export const processOrderAlarmSchedules = async (): Promise<void> => {
  if (alarmWorkerRunning) return;
  alarmWorkerRunning = true;
  try {
    const now = new Date();
    const due = await OrderAlarmSchedule.find({ status: "active", nextRunAt: { $lte: now }, $or: [{ lockedAt: null }, { lockedAt: { $lt: new Date(now.getTime() - 2 * 60 * 1000) } }] }).limit(50);
    for (const schedule of due) {
      const lock = await OrderAlarmSchedule.updateOne({ _id: schedule._id, status: "active", nextRunAt: { $lte: now } }, { $set: { lockedAt: now } });
      if (!lock.modifiedCount) continue;
      try {
        const order: any = await Order.findOne({ orderId: schedule.orderId }).select("orderStatus status").lean();
        const status = String(order?.orderStatus || order?.status || "").toLowerCase();
        if (!order || status !== "placed") {
          await OrderAlarmSchedule.updateOne({ _id: schedule._id }, { $set: { status: "stopped", stoppedAt: new Date(), stopReason: !order ? "order_not_found" : `order_status_${status || "unknown"}` }, $unset: { lockedAt: 1 } });
          continue;
        }
        const deviceCount = await FCMDevice.countDocuments({ userId: schedule.recipientUserId, role: schedule.recipientRole, enabled: true });
        if (!deviceCount) {
          await OrderAlarmSchedule.updateOne({ _id: schedule._id }, { $set: { nextRunAt: new Date(Date.now() + 3 * 60 * 1000) }, $unset: { lockedAt: 1 } });
          continue;
        }
        await sendFCMToUser(schedule.recipientUserId, schedule.recipientRole, schedule.payload as FCMNotificationPayload);
        await OrderAlarmSchedule.updateOne({ _id: schedule._id, status: "active" }, { $inc: { repeatCount: 1 }, $set: { nextRunAt: new Date(Date.now() + 3 * 60 * 1000) }, $unset: { lockedAt: 1 } });
      } catch (error) {
        console.error("[FCM alarm worker] schedule failed:", schedule._id, error);
        await OrderAlarmSchedule.updateOne({ _id: schedule._id }, { $set: { nextRunAt: new Date(Date.now() + 3 * 60 * 1000) }, $unset: { lockedAt: 1 } });
      }
    }
  } finally {
    alarmWorkerRunning = false;
  }
};
