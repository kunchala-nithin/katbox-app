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

// ✅ Socket.IO uses the same base URL as the REST API.
// Exported so the socket client can `import { SOCKET_URL }` without
// having to re-derive it or duplicate the env-var logic.
export const SOCKET_URL = BASE_URL;

console.log("🌐 USING BASE URL:", BASE_URL);

// 🔥 AXIOS INSTANCE
export const api = axios.create({
  baseURL: BASE_URL,
  // 60s timeout accommodates Render free-tier cold starts (which
  // can take 40–60s after the service has been idle).
  timeout: 60000,
});

/*
 * ============================================================
 * ✅ NON-RETRYABLE URLS
 * ============================================================
 *
 * These endpoints MUST NOT be retried automatically because:
 *
 *   • /auth/send-otp   → retrying triggers a SECOND SMS and can
 *                        hit Twilio's rate limit, plus it makes
 *                        the user wait ~2x longer on failure.
 *   • /auth/verify-otp → retrying a bad OTP is pointless and
 *                        burns Twilio verification attempts.
 *   • /auth/push-token → idempotent but retrying is wasteful.
 *
 * For these we surface the backend error immediately.
 * ============================================================
 */
const NON_RETRYABLE_PATHS = [
  "/auth/send-otp",
  "/auth/verify-otp",
  "/auth/push-token",
];

const isNonRetryable = (url?: string): boolean => {
  if (!url) return false;
  return NON_RETRYABLE_PATHS.some((p) => url.includes(p));
};

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
      if (
        !(config.data instanceof FormData) &&
        !config.headers.get("Content-Type")
      ) {
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
    const url = config.url || "";

    /*
     * ✅ Skip retry entirely for OTP / verification endpoints.
     *    These should surface their real error to the user
     *    immediately, not after a 1.5s delay + second round-trip.
     */
    if (isNonRetryable(url)) {
      console.log(
        "⛔ Skipping retry for non-retryable endpoint:",
        url,
        "status:",
        status,
        "code:",
        code
      );
      return Promise.reject(error);
    }

    const isNetworkOrTimeout =
      code === "ECONNABORTED" ||
      code === "ETIMEDOUT" ||
      code === "ERR_NETWORK" ||
      !error.response;

    const isRetryableStatus =
      status === 502 || status === 503 || status === 504;

    if (
      (isNetworkOrTimeout || isRetryableStatus) &&
      !config.__retried
    ) {
      config.__retried = true;
      console.log(
        "🔁 Retrying request once after cold-start failure:",
        url
      );

      await new Promise((resolve) => setTimeout(resolve, 1500));
      return api.request(config);
    }

    return Promise.reject(error);
  }
);

/**
 * ============================================================
 * ✅ NEW: GET SOCKET AUTH PAYLOAD
 * ============================================================
 *
 * Returns the JWT + (optional) userId + role so the Socket.IO
 * client can authenticate the handshake and immediately join
 * the correct rooms:
 *
 *   • userId       → private room for this user (order updates)
 *   • "admins"     → shared room for admin devices
 *   • "chefs"      → shared room for chef devices
 *
 * Called once in `lib/socket.ts` when establishing a connection.
 * Never throws — returns null on any failure so callers can
 * gracefully skip auth (server allows anonymous connects).
 */
export const getSocketAuth = async (): Promise<{
  token: string | null;
  userId: string | null;
  role: "customer" | "chef" | "admin";
} | null> => {
  try {
    const token = await getToken();
    if (!token) {
      return { token: null, userId: null, role: "customer" };
    }

    // Best-effort decode of the JWT payload to grab userId + role.
    // We deliberately avoid adding a `jwt-decode` dependency — the
    // payload is base64 and we only need two fields.
    let userId: string | null = null;
    let role: "customer" | "chef" | "admin" = "customer";

    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        // Base64URL → Base64 padding fix.
        const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
        const json = JSON.parse(
          // eslint-disable-next-line no-undef
          typeof atob === "function"
            ? atob(padded)
            : Buffer.from(padded, "base64").toString("binary")
        );
        userId =
          String(json.userId || json._id || json.id || "") || null;
        if (json.isAdmin === true) role = "admin";
        else if (json.isChef === true) role = "chef";
      }
    } catch (decodeErr) {
      // Silent — token format may differ, that's fine.
    }

    return { token, userId, role };
  } catch (err) {
    console.log("❌ getSocketAuth error:", err);
    return null;
  }
};

export default api;