import { useEffect } from "react";
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import api from "../lib/api";
import { getToken, getUser } from "../lib/authStorage";
import { subscribeAuth } from "../lib/authEvents";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function registerChefDevice() {
  try {
    if (!Device.isDevice) return;
    const authToken = await getToken();
    const user = await getUser();
    if (!authToken || !user) return;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("katbox_general_v1", {
        name: "KatBox Chef Notifications",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "default",
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#0B5D3B",
      });
      await Notifications.setNotificationChannelAsync("chef_orders_alarm_v3", {
        name: "KatBox Chef Order Alerts",
        importance: Notifications.AndroidImportance.MAX,
        sound: "alarm_10s.mp3",
        vibrationPattern: [0, 500, 250, 500],
        lightColor: "#0B5D3B",
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }

    const permission = await Notifications.getPermissionsAsync();
    let status = permission.status;
    if (status !== "granted") {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== "granted") return;

    const nativeToken = await Notifications.getDevicePushTokenAsync();
    if (!nativeToken?.data) return;
    const appId = Constants.expoConfig?.android?.package || "com.katbox.chef";
    await api.post("/api/auth/notification-token", {
      token: String(nativeToken.data),
      role: "chef",
      appId,
      platform: Platform.OS,
      deviceId: Constants.deviceId || Device.modelId || "",
    });
  } catch (error) {
    console.warn("[FCM] Chef device registration failed:", error);
  }
}

export default function FCMRegistration() {
  useEffect(() => {
    let active = true;
    const run = async () => {
      if (active) await registerChefDevice();
    };
    void run();
    const unsubscribe = subscribeAuth(() => { void run(); });
    return () => { active = false; unsubscribe(); };
  }, []);
  return null;
}
