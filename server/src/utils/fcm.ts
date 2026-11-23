import { getFirebaseMessaging } from "../config/firebaseAdmin";
import FCMDevice, { FCMDeviceRole } from "../models/FCMDevices";

export interface FCMNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channelId?: string;
  sound?: string;
  priority?: "high" | "normal";
}

const stringifyData = (data: Record<string, unknown> = {}): Record<string, string> => {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    output[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return output;
};

export const sendFCMToUser = async (userId: string, role: FCMDeviceRole, payload: FCMNotificationPayload) => {
  const devices = await FCMDevice.find({ userId, role, enabled: true }).select("_id token appId").lean();
  if (!devices.length) return { acceptedTokens: [] as string[], failedTokens: [] as string[] };

  const response = await getFirebaseMessaging().sendEachForMulticast({
    tokens: devices.map((device) => device.token),
    notification: { title: payload.title, body: payload.body },
    data: stringifyData(payload.data),
    android: {
      priority: payload.priority === "normal" ? "normal" : "high",
      notification: {
        channelId: payload.channelId || "katbox_general_v1",
        sound: payload.sound || "default",
        priority: payload.priority === "normal" ? "default" : "high",
      },
    },
    apns: { payload: { aps: { sound: payload.sound || "default" } } },
  });

  const invalidIds: unknown[] = [];
  const acceptedTokens: string[] = [];
  const failedTokens: string[] = [];
  response.responses.forEach((result, index) => {
    const token = devices[index].token;
    if (result.success) acceptedTokens.push(token);
    else {
      failedTokens.push(token);
      const code = result.error?.code || "";
      if (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token")) {
        invalidIds.push(devices[index]._id);
      }
    }
  });
  if (invalidIds.length) await FCMDevice.deleteMany({ _id: { $in: invalidIds } });
  return { acceptedTokens, failedTokens };
};
