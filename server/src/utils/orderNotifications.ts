import User from "../models/User";
import { sendExpoPushBatch, isValidExpoToken, ExpoPushPayload } from "./expoPush";

type RecipientRole = "customer" | "chef" | "admin";

const getRoleTokens = (user: any, role: RecipientRole): string[] => {
  const scoped = role === "admin"
    ? user?.adminPushTokens
    : role === "chef"
      ? user?.chefPushTokens
      : user?.customerPushTokens;
  const scopedTokens = Array.isArray(scoped) ? scoped : [];
  // Legacy token fallback is retained for older app builds. New builds always
  // register into the role-specific array through /notification-token.
  const legacy = scopedTokens.length === 0 && typeof user?.pushToken === "string" ? [user.pushToken] : [];
  return [...new Set([...scopedTokens, ...legacy])].filter(isValidExpoToken);
};

/**
 * Send directly to the recipient's currently registered devices.
 * This deliberately creates no MongoDB notification or alarm-schedule record.
 * Expo's HTTP sender performs bounded request retries and removes invalid tokens.
 */
export const sendOrderNotification = async (args: {
  orderId: string;
  eventType?: string;
  recipientUserId: string;
  recipientRole: RecipientRole;
  payload: Omit<ExpoPushPayload, "token">;
}): Promise<{ acceptedTokens: string[]; failedTokens: string[] }> => {
  if (!args.orderId || !args.recipientUserId) {
    return { acceptedTokens: [], failedTokens: [] };
  }

  try {
    const user: any = await User.findById(args.recipientUserId).select(
      "pushToken customerPushTokens chefPushTokens adminPushTokens"
    );
    const tokens = getRoleTokens(user, args.recipientRole);

    if (tokens.length === 0) {
      console.warn(
        `[orderNotification] No registered Expo token: role=${args.recipientRole}, user=${args.recipientUserId}, order=${args.orderId}, event=${args.eventType || "order_event"}`
      );
      return { acceptedTokens: [], failedTokens: [] };
    }

    const result = await sendExpoPushBatch(
      tokens.map((token) => ({ ...args.payload, token }))
    );

    if (result.failedTokens.length > 0) {
      console.error(
        `[orderNotification] Expo did not accept ${result.failedTokens.length}/${tokens.length} token(s): order=${args.orderId}, role=${args.recipientRole}, event=${args.eventType || "order_event"}`
      );
    }

    return result;
  } catch (error) {
    console.error(
      `[orderNotification] Direct delivery error: order=${args.orderId}, role=${args.recipientRole}, event=${args.eventType || "order_event"}`,
      error
    );
    return { acceptedTokens: [], failedTokens: [] };
  }
};

/**
 * Compatibility no-op for existing order-status handlers. Alarm repetition
 * is intentionally removed; Android plays the custom notification-channel
 * sound once for each newly delivered order notification.
 */
export const stopOrderAlarmSchedules = async (
  _orderId: string,
  _reason = "order_status_changed"
): Promise<void> => undefined;
