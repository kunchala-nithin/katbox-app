import axios, { AxiosHeaders, AxiosError } from "axios";
import { getToken } from "./authStorage";
import { Platform } from "react-native";
import Constants from "expo-constants";

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
export const api = axios.create({
  baseURL: BASE_URL,
  // 60s timeout accommodates Render free-tier cold starts (which
  // can take 40–60s after the service has been idle).
  timeout: 60000,
});

// 🔥 REQUEST INTERCEPTOR - Fixed for FormData + Authorization
api.interceptors.request.use(
  async (config) => {
    try {
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

    if ((isNetworkOrTimeout || isRetryableStatus) && !config.__retried) {
      config.__retried = true;
      console.log("🔁 Retrying request once after cold-start failure:", config.url);

      await new Promise((resolve) => setTimeout(resolve, 1500));
      return api.request(config);
    }

    return Promise.reject(error);
  }
);

export default api;