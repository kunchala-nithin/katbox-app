import User from "../models/User";
import NotificationOutbox from "../models/NotificationOutbox";
import OrderAlarmSchedule from "../models/OrderAlarmSchedule";
import Order from "../models/Orders";
import { sendExpoPushBatch, isValidExpoToken, ExpoPushPayload } from "./expoPush";

type RecipientRole = "customer" | "chef" | "admin";

const ORDER_ALARM_REPEAT_INTERVAL_MS = 3 * 60 * 1000;
const ORDER_ALARM_LOCK_TIMEOUT_MS = 2 * 60 * 1000;

const getRoleTokens = (user: any, role: RecipientRole): string[] => {
  const scoped = role === "admin"
    ? user?.adminPushTokens
    : role === "chef"
      ? user?.chefPushTokens
      : user?.customerPushTokens;
  const scopedTokens = Array.isArray(scoped) ? scoped : [];
  const legacy = scopedTokens.length === 0 && typeof user?.pushToken === "string" ? [user.pushToken] : [];
  return [...new Set([...scopedTokens, ...legacy])].filter(isValidExpoToken);
};

export const queueOrderNotification = async (args: {
  orderId: string;
  eventType: string;
  recipientUserId: string;
  recipientRole: RecipientRole;
  payload: Omit<ExpoPushPayload, "token">;
}): Promise<void> => {
  if (!args.orderId || !args.eventType || !args.recipientUserId) return;
  await NotificationOutbox.updateOne(
    {
      orderId: args.orderId,
      eventType: args.eventType,
      recipientUserId: args.recipientUserId,
      recipientRole: args.recipientRole,
    },
    {
      $setOnInsert: {
        orderId: args.orderId,
        eventType: args.eventType,
        recipientUserId: args.recipientUserId,
        recipientRole: args.recipientRole,
        payload: args.payload,
        acceptedTokens: [],
        status: "pending",
        attempts: 0,
        nextAttemptAt: new Date(),
      },
    },
    { upsert: true }
  );

  // A persisted schedule repeats only the chef/admin order alarm. Customer
  // confirmations and ordinary status notifications are never repeated.
  const isInitialOrderAlarm =
    (args.recipientRole === "chef" || args.recipientRole === "admin") &&
    /_alarm$/.test(args.eventType);
  if (isInitialOrderAlarm) {
    await OrderAlarmSchedule.updateOne(
      {
        orderId: args.orderId,
        recipientUserId: args.recipientUserId,
        recipientRole: args.recipientRole,
      },
      {
        $setOnInsert: {
          orderId: args.orderId,
          eventType: args.eventType,
          recipientUserId: args.recipientUserId,
          recipientRole: args.recipientRole,
          payload: args.payload,
          status: "active",
          repeatCount: 0,
          nextRunAt: new Date(Date.now() + ORDER_ALARM_REPEAT_INTERVAL_MS),
          lockedAt: null,
        },
      },
      { upsert: true }
    );
  }
};

/**
 * Repeat the chef/admin alarm every three minutes while the order remains
 * in Placed state. Each repeat is a separate idempotent outbox event, so
 * Expo/FCM can play the configured 10-second notification sound even when
 * the app's JavaScript process is not running.
 */
export const processOrderAlarmRepeats = async (limit = 25): Promise<void> => {
  const now = new Date();
  const staleLock = new Date(now.getTime() - ORDER_ALARM_LOCK_TIMEOUT_MS);
  const candidates = await OrderAlarmSchedule.find({
    status: "active",
    nextRunAt: { $lte: now },
    $or: [{ lockedAt: null }, { lockedAt: { $lte: staleLock } }],
  }).sort({ nextRunAt: 1 }).limit(limit).select("_id");

  for (const candidate of candidates) {
    const schedule: any = await OrderAlarmSchedule.findOneAndUpdate(
      {
        _id: candidate._id,
        status: "active",
        nextRunAt: { $lte: now },
        $or: [{ lockedAt: null }, { lockedAt: { $lte: staleLock } }],
      },
      { $set: { lockedAt: new Date() } },
      { new: true }
    );
    if (!schedule) continue;

    try {
      const order: any = await Order.findOne({ orderId: schedule.orderId })
        .select("orderStatus")
        .lean();
      const orderStatus = String(order?.orderStatus || "").trim().toLowerCase();

      // Chef acceptance changes Placed to Accepted/Preparing. Any other
      // terminal or progressed state also ends the reminder sequence.
      if (!order || orderStatus !== "placed") {
        await OrderAlarmSchedule.updateOne(
          { _id: schedule._id, status: "active" },
          {
            $set: {
              status: "stopped",
              stoppedAt: new Date(),
              stopReason: !order ? "order_not_found" : `order_status_${orderStatus || "unknown"}`,
              lockedAt: null,
            },
          }
        );
        continue;
      }

      const nextSequence = Number(schedule.repeatCount || 0) + 1;
      const payload = {
        ...(schedule.payload || {}),
        data: {
          ...((schedule.payload || {}).data || {}),
          orderId: schedule.orderId,
          role: schedule.recipientRole,
          alarmSequence: nextSequence,
          repeatedAlarm: true,
        },
        priority: "high" as const,
        ttl: 180,
      };

      await queueOrderNotification({
        orderId: String(schedule.orderId),
        eventType: `${schedule.eventType}_repeat_${nextSequence}`,
        recipientUserId: String(schedule.recipientUserId),
        recipientRole: schedule.recipientRole,
        payload,
      });

      await OrderAlarmSchedule.updateOne(
        { _id: schedule._id, status: "active" },
        {
          $set: {
            repeatCount: nextSequence,
            nextRunAt: new Date(Date.now() + ORDER_ALARM_REPEAT_INTERVAL_MS),
            lockedAt: null,
          },
        }
      );
    } catch (error) {
      await OrderAlarmSchedule.updateOne(
        { _id: schedule._id, status: "active" },
        {
          $set: {
            nextRunAt: new Date(Date.now() + 30_000),
            lockedAt: null,
            stopReason: "",
          },
        }
      );
      console.error("[orderAlarmRepeater] schedule retry:", error instanceof Error ? error.message : "unknown error");
    }
  }
};


export const stopOrderAlarmSchedules = async (orderId: string, reason = "order_status_changed"): Promise<void> => {
  if (!orderId) return;
  await OrderAlarmSchedule.updateMany(
    { orderId: String(orderId), status: "active" },
    {
      $set: {
        status: "stopped",
        stoppedAt: new Date(),
        stopReason: reason,
        lockedAt: null,
      },
    }
  );
};

/**
 * Drain a small batch of persisted notifications. A unique outbox key makes
 * duplicate order API requests/webhooks idempotent. Processing locks are
 * recoverable after a crashed worker, and accepted device tokens are not
 * resent when only some devices failed.
 */
export const processNotificationOutbox = async (limit = 25): Promise<void> => {
  const now = new Date();
  const staleLock = new Date(now.getTime() - 2 * 60 * 1000);
  const candidates = await NotificationOutbox.find({
    $or: [
      { status: { $in: ["pending", "failed"] }, nextAttemptAt: { $lte: now } },
      { status: "processing", lockedAt: { $lte: staleLock } },
    ],
  }).sort({ createdAt: 1 }).limit(limit).select("_id");

  for (const candidate of candidates) {
    const job: any = await NotificationOutbox.findOneAndUpdate(
      {
        _id: candidate._id,
        $or: [
          { status: { $in: ["pending", "failed"] }, nextAttemptAt: { $lte: now } },
          { status: "processing", lockedAt: { $lte: staleLock } },
        ],
      },
      { $set: { status: "processing", lockedAt: new Date() }, $inc: { attempts: 1 } },
      { new: true }
    );
    if (!job) continue;

    try {
      const isOrderAlarm =
        (job.recipientRole === "chef" || job.recipientRole === "admin") &&
        String(job.eventType || "").includes("_alarm");
      if (isOrderAlarm) {
        const latestOrder: any = await Order.findOne({ orderId: job.orderId })
          .select("orderStatus")
          .lean();
        if (!latestOrder || String(latestOrder.orderStatus || "").trim().toLowerCase() !== "placed") {
          await NotificationOutbox.updateOne(
            { _id: job._id, status: "processing" },
            {
              $set: {
                status: "cancelled",
                lockedAt: null,
                lastError: "Order is no longer awaiting chef acceptance.",
              },
            }
          );
          continue;
        }
      }

      const user: any = await User.findById(job.recipientUserId).select(
        "pushToken customerPushTokens chefPushTokens adminPushTokens"
      );
      const alreadyAccepted: string[] = Array.isArray(job.acceptedTokens) ? job.acceptedTokens : [];
      const tokens = getRoleTokens(user, job.recipientRole).filter((token) => !alreadyAccepted.includes(token));

      if (tokens.length === 0) {
        const retryAt = new Date(Date.now() + 5 * 60 * 1000);
        await NotificationOutbox.updateOne({ _id: job._id, status: "processing" }, {
          $set: { status: "failed", lockedAt: null, nextAttemptAt: retryAt, lastError: "No registered Expo token for recipient." },
        });
        continue;
      }

      const payload = job.payload as Omit<ExpoPushPayload, "token">;
      const result = await sendExpoPushBatch(tokens.map((token) => ({ ...payload, token })));
      const accepted = [...new Set([...alreadyAccepted, ...result.acceptedTokens])];
      const allAccepted = tokens.every((token) => accepted.includes(token));

      if (allAccepted) {
        await NotificationOutbox.updateOne({ _id: job._id, status: "processing" }, {
          $set: { status: "accepted", acceptedTokens: accepted, acceptedAt: new Date(), lockedAt: null, lastError: "" },
        });
      } else {
        const retryDelay = Math.min(60 * 60 * 1000, 1000 * Math.pow(2, Math.min(Number(job.attempts) || 1, 10)));
        await NotificationOutbox.updateOne({ _id: job._id, status: "processing" }, {
          $set: {
            status: "failed",
            acceptedTokens: accepted,
            lockedAt: null,
            nextAttemptAt: new Date(Date.now() + retryDelay),
            lastError: `${result.failedTokens.length} token(s) were not accepted by Expo.`,
          },
        });
      }
    } catch (error) {
      const retryDelay = Math.min(60 * 60 * 1000, 1000 * Math.pow(2, Math.min(Number(job.attempts) || 1, 10)));
      await NotificationOutbox.updateOne({ _id: job._id, status: "processing" }, {
        $set: {
          status: "failed",
          lockedAt: null,
          nextAttemptAt: new Date(Date.now() + retryDelay),
          lastError: error instanceof Error ? error.message.slice(0, 300) : "Notification worker error",
        },
      });
    }
  }
};
