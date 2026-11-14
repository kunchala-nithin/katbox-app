// server/src/utils/expoPush.ts
// Centralized Expo push sender. A successful result means Expo accepted the
// ticket; it is not proof that the device displayed or played the notification.

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
export const ORDER_ALARM_SOUND = "alarm.mp3";
export const ADMIN_ORDER_CHANNEL_ID = "admin_orders_alarm";
export const CHEF_ORDER_CHANNEL_ID = "chef_orders_alarm";

export interface ExpoPushPayload {
  token: string; title: string; body: string; data?: Record<string, any>;
  sound?: string | null; channelId?: string;
  priority?: "default" | "normal" | "high" | "max"; badge?: number;
  categoryId?: string; ttl?: number; subtitle?: string; vibrate?: number[];
}

export const isValidExpoToken = (token: any): boolean =>
  typeof token === "string" && /^(Exponent|Expo)PushToken\[[^\]]+\]$/.test(token.trim());

const buildMessage = (p: ExpoPushPayload): Record<string, any> => {
  const message: Record<string, any> = {
    to: p.token.trim(), title: p.title, body: p.body, data: p.data || {},
    sound: p.sound === undefined ? "default" : p.sound,
  };
  if (p.channelId) message.channelId = p.channelId;
  if (p.priority) message.priority = p.priority;
  if (typeof p.badge === "number") message.badge = p.badge;
  if (p.categoryId) message.categoryId = p.categoryId;
  if (typeof p.ttl === "number") message.ttl = p.ttl;
  if (p.subtitle) message.subtitle = p.subtitle;
  if (Array.isArray(p.vibrate) && p.vibrate.length) message.vibrate = p.vibrate;
  return message;
};

const postMessages = async (messages: Record<string, any>[]): Promise<any[] | null> => {
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Accept-encoding": "gzip, deflate", "Content-Type": "application/json" },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      console.error("[expoPush] HTTP error", response.status, response.statusText);
      return null;
    }
    const json: any = await response.json().catch(() => null);
    const data = Array.isArray(json?.data) ? json.data : json?.data ? [json.data] : null;
    if (!data) console.error("[expoPush] unexpected response", json);
    return data;
  } catch (error) {
    console.error("[expoPush] request failed", error);
    return null;
  }
};

export const sendExpoPush = async (payload: ExpoPushPayload): Promise<boolean> => {
  if (!isValidExpoToken(payload.token)) return false;
  const results = await postMessages([buildMessage(payload)]);
  const ticket = results?.[0];
  if (ticket?.status === "error") {
    console.error("[expoPush] ticket error", ticket);
    return false;
  }
  return ticket?.status === "ok";
};

export const sendExpoPushBatch = async (payloads: ExpoPushPayload[]): Promise<void> => {
  const valid = payloads.filter((p) => isValidExpoToken(p.token));
  for (let i = 0; i < valid.length; i += 100) {
    const chunk = valid.slice(i, i + 100);
    const tickets = await postMessages(chunk.map(buildMessage));
    if (!tickets) continue;
    tickets.forEach((ticket, index) => {
      if (ticket?.status === "error") {
        console.error("[expoPush] batch ticket error", { token: chunk[index]?.token, ticket });
      }
    });
  }
};
