// server/src/utils/expoPush.ts
//
// ─────────────────────────────────────────────────────────────
// CENTRALIZED EXPO PUSH NOTIFICATION HELPER
// ─────────────────────────────────────────────────────────────
//
// Used by orders.controller.ts to notify:
//
//   • All users with isAdmin === true  → on order creation
//   • The specific assigned chef's User → after advance verification
//
// The `sound` field sent here tells APNs (iOS) / Expo to play the
// bundled "alarm.mp3" file. On Android, the actual sound is decided
// by the notification channel that we create on the client in
// client/src/hooks/useOrderNotifier.ts — same sound file name.
//
// We intentionally use raw fetch instead of expo-server-sdk to keep
// dependencies light and match the pattern already used in the
// existing orders.controller.ts.
// ─────────────────────────────────────────────────────────────

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// ─────────────────────────────────────────────────────────────
// SHARED CONSTANTS
// ─────────────────────────────────────────────────────────────
// These are imported by the controllers so channel ids and the
// sound filename only live in ONE place. Changing them here
// automatically updates every push sender.

/** Bundled sound file name (must match client/assets/sounds/alarm.mp3) */
export const ORDER_ALARM_SOUND = "alarm.mp3";

/** Android channel id used by admin devices */
export const ADMIN_ORDER_CHANNEL_ID = "admin_orders_alarm";

/** Android channel id used by chef devices */
export const CHEF_ORDER_CHANNEL_ID = "chef_orders_alarm";

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export interface ExpoPushPayload {
  /** Expo push token of the recipient device */
  token: string;

  /** Notification title */
  title: string;

  /** Notification body */
  body: string;

  /** Arbitrary JSON payload delivered with the notification */
  data?: Record<string, any>;

  /**
   * Sound filename relative to the app bundle.
   *   • Pass `'alarm.mp3'` to play the bundled alarm.
   *   • Pass `null`         to mute.
   *   • Pass `'default'`    for the OS default.
   * Defaults to `'default'` if omitted.
   */
  sound?: string | null;

  /**
   * Android notification channel id.
   * Must match the channel id created on the client via
   * Notifications.setNotificationChannelAsync(...).
   */
  channelId?: string;

  /**
   * Android priority. `'max'` is required for a heads-up banner
   * with the loud alarm sound when the app is closed.
   */
  priority?: "default" | "normal" | "high" | "max";

  /** iOS badge count */
  badge?: number;

  /** iOS category id (for action buttons) */
  categoryId?: string;

  /** Time-to-live in seconds */
  ttl?: number;

  /** iOS subtitle */
  subtitle?: string;

  /** Android vibration pattern in milliseconds */
  vibrate?: number[];
}

// ─────────────────────────────────────────────────────────────
// TOKEN VALIDATION
// ─────────────────────────────────────────────────────────────
// Expo tokens look like:
//   ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]
//   ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]
//
// Anything else (empty string, null, a raw FCM token, etc.) is
// rejected so we never spam the Expo service.

export const isValidExpoToken = (token: any): boolean => {
  if (typeof token !== "string" || token.length === 0) {
    return false;
  }
  return (
    token.startsWith("ExponentPushToken[") ||
    token.startsWith("ExpoPushToken[")
  );
};

// ─────────────────────────────────────────────────────────────
// MESSAGE BUILDER
// ─────────────────────────────────────────────────────────────

const buildMessage = (payload: ExpoPushPayload): Record<string, any> => {
  const {
    token,
    title,
    body,
    data = {},
    sound,
    channelId,
    priority,
    badge,
    categoryId,
    ttl,
    subtitle,
    vibrate,
  } = payload;

  const message: Record<string, any> = {
    to: token,
    title,
    body,
    data,
    // Default to 'default' only if caller didn't explicitly pass
    // undefined. Passing `null` mutes the notification.
    sound: sound === undefined ? "default" : sound,
  };

  if (channelId) message.channelId = channelId;
  if (priority) message.priority = priority;
  if (typeof badge === "number") message.badge = badge;
  if (categoryId) message.categoryId = categoryId;
  if (typeof ttl === "number") message.ttl = ttl;
  if (subtitle) message.subtitle = subtitle;
  if (Array.isArray(vibrate) && vibrate.length > 0) {
    message.vibrate = vibrate;
  }

  return message;
};

// ─────────────────────────────────────────────────────────────
// SEND — SINGLE
// ─────────────────────────────────────────────────────────────
// Returns true on delivery-accepted, false otherwise.
// Never throws.

export const sendExpoPush = async (
  payload: ExpoPushPayload
): Promise<boolean> => {
  if (!isValidExpoToken(payload.token)) {
    return false;
  }

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildMessage(payload)),
    });

    if (!res.ok) {
      console.log("[expoPush] HTTP error:", res.status, res.statusText);
      return false;
    }

    const json: any = await res.json().catch(() => null);

    // Expo returns either { data: { status, ... } } for a single push
    // or { data: [ ... ] } when a batch was sent. We only care about
    // the error statuses.
    if (json?.data) {
      const first = Array.isArray(json.data) ? json.data[0] : json.data;
      if (first?.status === "error") {
        console.log("[expoPush] delivery error:", first);
        return false;
      }
    }

    return true;
  } catch (err) {
    console.log("[expoPush] network error:", err);
    return false;
  }
};

// ─────────────────────────────────────────────────────────────
// SEND — BATCH
// ─────────────────────────────────────────────────────────────
// Expo supports up to 100 pushes in one HTTP call.
// Invalid tokens are silently filtered out.
// Never throws.

export const sendExpoPushBatch = async (
  payloads: ExpoPushPayload[]
): Promise<void> => {
  const valid = payloads.filter((p) => isValidExpoToken(p.token));
  if (valid.length === 0) return;

  const messages = valid.map(buildMessage);

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    if (!res.ok) {
      console.log("[expoPush] batch HTTP error:", res.status);
      return;
    }

    const json: any = await res.json().catch(() => null);
    if (Array.isArray(json?.data)) {
      json.data.forEach((item: any, idx: number) => {
        if (item?.status === "error") {
          console.log("[expoPush] batch item error:", valid[idx]?.token, item);
        }
      });
    }
  } catch (err) {
    console.log("[expoPush] batch network error:", err);
  }
};