import axios, { AxiosHeaders } from "axios";
import { getToken } from "./authStorage";
import { Platform } from "react-native";
import Constants from "expo-constants";

// 🔥 YOUR LOCAL IP (from ifconfig)
export const LOCAL_IP = "10.13.67.245";

// 🔥 BASE URL HANDLER
export const getBaseUrl = (): string => {
  // ✅ Running inside Expo Go on real device
  if (Constants.executionEnvironment === "storeClient") {
    return `http://${LOCAL_IP}:4000`;
  }
  // ✅ Android physical device or native build fallback
  if (Platform.OS === "android") {
    return `http://${LOCAL_IP}:4000`;
  }
  // ✅ iOS Simulator / fallback
  return "http://localhost:4000";
};

export const BASE_URL = getBaseUrl();

console.log("🌐 USING BASE URL:", BASE_URL);

// 🔥 AXIOS INSTANCE
export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 20000,
});

// 🔥 REQUEST INTERCEPTOR - Fixed for FormData + Authorization
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await getToken();
      console.log("🚀 FINAL REQUEST:", `${config.baseURL}${config.url}`);

      if (token) {
        // ✅ FIX FOR AXIOS v1
        if (!config.headers) {
          config.headers = new AxiosHeaders();
        }
        config.headers.set("Authorization", `Bearer ${token}`);

        // Important fix for multipart FormData
        if (config.data instanceof FormData) {
          config.headers.set("Content-Type", "multipart/form-data");
        }
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