import axios, { AxiosHeaders, AxiosError } from "axios";
import { getToken } from "./authStorage";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Network from "expo-network";

// 🔥 LOCAL IP FALLBACK
export const LOCAL_IP = "192.168.29.185";

// 🔥 BASE URL HANDLER
export const getBaseUrl = (): string => {
  // 1. Prioritize environment variable (Render URL when set in client/.env)
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // 2. Running inside Expo Go on real device (local fallback)
  if (Constants.executionEnvironment === "storeClient") {
    return `http://${LOCAL_IP}:4000`;
  }

  // 3. Android physical device or native build (local fallback)
  if (Platform.OS === "android") {
    return `http://${LOCAL_IP}:4000`;
  }

  // 4. iOS Simulator / fallback
  return "http://localhost:4000";
};

export const BASE_URL = getBaseUrl();

console.log("🌐 USING BASE URL:", BASE_URL);

// 🔥 AXIOS INSTANCE
// - Timeout reduced from 60s → 20s per attempt.
//   Combined with the single retry below, the worst-case wait for a
//   Render cold-start is ~41.5s (20 + 1.5 + 20), which is still
//   enough to cover idle-tier warmups but drastically better than
//   the previous 2-minute worst case when the device is offline.
export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 20000,
});

// 🔥 REQUEST INTERCEPTOR - Fixed for FormData + Authorization
//    ✅ Fast-fail when the device has no network — avoids waiting
//    the entire 20s timeout when we already know there's no route.
api.interceptors.request.use(
  async (config) => {
    try {
      // ── ✅ Offline guard (cheap, ~few ms) ──
      // `getNetworkStateAsync` is fast; if we're clearly offline,
      // reject immediately instead of letting axios sit on a dead socket.
      try {
        const netState = await Network.getNetworkStateAsync();
        const isOffline =
          netState.isConnected === false ||
          netState.isInternetReachable === false;

        if (isOffline) {
          console.log("📴 OFFLINE — aborting request:", config.url);
          // Create an AxiosError-compatible rejection so downstream
          // interceptors + `catch` blocks see the standard ERR_NETWORK code.
          const offlineError = new AxiosError(
            "No internet connection",
            "ERR_NETWORK",
            config as any
          );
          // Bypass the retry logic — no point retrying while offline.
          (offlineError as any).config = { ...config, __retried: true };
          return Promise.reject(offlineError);
        }
      } catch (netErr) {
        // If the network check itself fails for any reason, don't block
        // the request — fall through and let axios try normally.
        console.log("⚠️ Network state check failed, proceeding:", netErr);
      }

      const token = await getToken();
      console.log("🚀 FINAL REQUEST:", `${config.baseURL}${config.url}`);

      if (!config.headers) {
        config.headers = new AxiosHeaders();
      }

      if (token) {
        config.headers.set("Authorization", `Bearer ${token}`);
      }

      // Allow Axios to set boundary headers automatically for FormData;
      // manual setting can occasionally corrupt multipart boundaries on React Native.
      if (!(config.data instanceof FormData) && !config.headers.get("Content-Type")) {
        config.headers.set("Content-Type", "application/json");
      }

      return config;
    } catch (error) {
      console.log("❌ REQUEST ERROR:", error);
      return config;
    }
  },
  (error) => {
    console.log("❌ INTERCEPTOR ERROR:", error);
    return Promise.reject(error);
  }
);

// 🔥 RESPONSE INTERCEPTOR - single retry for cold-start timeouts
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config: any = error.config || {};
    const code = (error as any)?.code;
    const status = error.response?.status;

    const isNetworkOrTimeout =
      code === "ECONNABORTED" ||
      code === "ETIMEDOUT" ||
      code === "ERR_NETWORK" ||
      !error.response;

    const isRetryableStatus =
      status === 502 || status === 503 || status === 504;

    // ✅ Never retry when the device was flagged as offline — the
    // request interceptor already tagged `__retried: true` for those.
    const wasOfflineAbort = config.__retried === true;

    if (
      !wasOfflineAbort &&
      (isNetworkOrTimeout || isRetryableStatus) &&
      !config.__retried
    ) {
      config.__retried = true;
      console.log("🔁 Retrying request once after cold-start failure:", config.url);

      await new Promise((resolve) => setTimeout(resolve, 1500));
      return api.request(config);
    }

    return Promise.reject(error);
  }
);

export default api;