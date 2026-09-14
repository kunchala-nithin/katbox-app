import axios, { AxiosHeaders } from "axios";
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
  timeout: 30000, // 30s timeout accommodates Render free-tier cold starts
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

export default api;