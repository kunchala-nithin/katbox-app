import User from "../models/User";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

export const ORDER_ALARM_SOUND = "alarm_10s.mp3";
export const ADMIN_ORDER_CHANNEL_ID = "admin_orders_alarm_v2";
export const CHEF_ORDER_CHANNEL_ID = "chef_orders_alarm_v2";

export interface ExpoPushPayload {
  token: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: string | null;
  channelId?: string;
  priority?: "default" | "normal" | "high";
  badge?: number;
  categoryId?: string;
  ttl?: number;
  subtitle?: string;
}

export const isValidExpoToken = (token: any): boolean =>
  typeof token === "string" && /^(Exponent|Expo)PushToken\[[^\]]+\]$/.test(token);

const buildMessage = (payload: ExpoPushPayload): Record<string, any> => {
  const { token, title, body, data = {}, sound, channelId, priority, badge, categoryId, ttl, subtitle } = payload;
  const message: Record<string, any> = {
    to: token,
    title,
    body,
    data,
    sound: sound === undefined ? "default" : sound,
  };
  if (channelId) message.channelId = channelId;
  if (priority) message.priority = priority;
  if (typeof badge === "number") message.badge = badge;
  if (categoryId) message.categoryId = categoryId;
  if (typeof ttl === "number") message.ttl = ttl;
  if (subtitle) message.subtitle = subtitle;
  return message;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const removeInvalidToken = async (token: string): Promise<void> => {
  try {
    await User.updateMany(
      {
        $or: [
          { customerPushTokens: token },
          { chefPushTokens: token },
          { adminPushTokens: token },
          { pushToken: token },
        ],
      },
      {
        $pull: {
          customerPushTokens: token,
          chefPushTokens: token,
          adminPushTokens: token,
        },
        $set: { pushToken: "" },
      }
    );
  } catch (error) {
    // Token cleanup is best-effort; it must never affect order/payment state.
    console.error("[expoPush] invalid-token cleanup failed:", error instanceof Error ? error.message : "unknown error");
  }
};

const postWithRetry = async (url: string, body: unknown): Promise<any | null> => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (response.ok) return await response.json().catch(() => null);
      if (response.status !== 429 && response.status < 500) {
        console.error("[expoPush] provider rejected request:", response.status);
        return null;
      }
    } catch (error) {
      if (attempt === 3) {
        console.error("[expoPush] provider request failed:", error instanceof Error ? error.message : "network error");
      }
    }
    if (attempt < 3) await sleep(500 * Math.pow(2, attempt));
  }
  return null;
};

const pollReceipts = async (ticketToToken: Map<string, string>): Promise<void> => {
  const ids = [...ticketToToken.keys()];
  if (ids.length === 0) return;
  // Expo recommends waiting before querying receipts so they have time to be created.
  await sleep(15_000);
  for (let offset = 0; offset < ids.length; offset += 300) {
    const batchIds = ids.slice(offset, offset + 300);
    const receiptIds = Object.fromEntries(batchIds.map((id) => [id, id]));
    const result = await postWithRetry(EXPO_RECEIPTS_URL, { ids: batchIds });
    const receipts = result?.data || {};
    for (const ticketId of batchIds) {
      const receipt = receipts[ticketId];
      if (receipt?.status === "error") {
        const token = ticketToToken.get(ticketId);
        const errorCode = String(receipt?.details?.error || "");
        if (token && errorCode === "DeviceNotRegistered") await removeInvalidToken(token);
        else console.error("[expoPush] receipt reported delivery error:", errorCode || "unknown");
      }
    }
  }
};

export const sendExpoPush = async (payload: ExpoPushPayload): Promise<boolean> => {
  if (!isValidExpoToken(payload.token)) return false;
  const result = await postWithRetry(EXPO_PUSH_URL, buildMessage(payload));
  const ticket = result?.data;
  if (ticket?.status === "error") {
    if (ticket?.details?.error === "DeviceNotRegistered") await removeInvalidToken(payload.token);
    return false;
  }
  if (ticket?.id) void pollReceipts(new Map([[String(ticket.id), payload.token]]));
  return ticket?.status === "ok";
};

/**
 * Expo accepts at most 100 notification messages per send request. Each
 * chunk is independently retried; tickets and receipts are inspected, and
 * invalid registrations are removed from all role-specific token arrays.
 * A successful return means the provider accepted/processed the request,
 * not that the device displayed or played the notification.
 */
export const sendExpoPushBatch = async (payloads: ExpoPushPayload[]): Promise<{ acceptedTokens: string[]; failedTokens: string[] }> => {
  const valid = payloads.filter((payload) => isValidExpoToken(payload.token));
  const acceptedTokens: string[] = [];
  const failedTokens: string[] = [];
  for (let offset = 0; offset < valid.length; offset += 100) {
    const chunk = valid.slice(offset, offset + 100);
    const result = await postWithRetry(EXPO_PUSH_URL, chunk.map(buildMessage));
    const tickets = Array.isArray(result?.data) ? result.data : [];
    if (!result || tickets.length !== chunk.length) {
      failedTokens.push(...chunk.map((payload) => payload.token));
      continue;
    }
    const ticketToToken = new Map<string, string>();
    for (let index = 0; index < tickets.length; index += 1) {
      const ticket = tickets[index];
      const token = chunk[index]?.token;
      if (ticket?.status === "ok" && ticket?.id && token) {
        ticketToToken.set(String(ticket.id), token);
        acceptedTokens.push(token);
      } else if (ticket?.status === "error") {
        if (token) failedTokens.push(token);
        const errorCode = String(ticket?.details?.error || "");
        if (token && errorCode === "DeviceNotRegistered") await removeInvalidToken(token);
        else console.error("[expoPush] ticket error:", errorCode || "unknown");
      }
    }
    if (ticketToToken.size > 0) void pollReceipts(ticketToToken);
  }
  return { acceptedTokens, failedTokens };
};
