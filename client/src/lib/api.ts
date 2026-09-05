import axios, { AxiosHeaders } from "axios";
import { getToken } from "./authStorage";

// 🔥 PRODUCTION LIVE BACKEND URL
export const BASE_URL = "https://katbox-app.onrender.com";

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
        if (!config.headers) {
          config.headers = new AxiosHeaders();
        }
        config.headers.set("Authorization", `Bearer ${token}`);

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