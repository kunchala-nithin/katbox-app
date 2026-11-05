// client/src/hooks/useOrderNotifier.ts
//
// ─────────────────────────────────────────────────────────────
// useOrderNotifier — role-scoped order alarm + push listener
// ─────────────────────────────────────────────────────────────
//
// Mounted by:
//   • client/app/admin/layout.tsx             (role: "admin")
//   • client/app/chefManagement/layout.tsx    (role: "chef")
//
// Only mounted AFTER the role has been confirmed true, so it never
// fires for regular customers.
//
// Responsibilities:
//   1. Create the Android notification channel that uses the
//      bundled alarm.mp3 with MAX importance + bypassDnd.
//   2. Register/refresh the Expo push token on the backend
//      (idempotent — safe if app/layout.tsx already registered it).
//   3. Listen for foreground push notifications and trigger the
//      singleton alarm when the notification is for OUR role.
//   4. Listen for socket events (new_order_placed for admin,
//      advance_payment_verified + new_chef_order for chef) and
//      trigger the singleton alarm with the same rules.
//   5. For chef: filter strictly by chef ownership so other chefs
//      never ring for someone else's order.
//   6. Dedupe per orderId (30 s TTL) so the same order cannot
//      ring twice from two different events.
//
// All side effects are contained here. This hook renders nothing.
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants, { AppOwnership } from "expo-constants";

import api from "../lib/api";
import { socket } from "../lib/socket";
import { getUser } from "../lib/authStorage";
import { startOrderAlarm } from "../lib/orderAlarm";

// ─────────────────────────────────────────────────────────────
// CONSTANTS — must match server/src/utils/expoPush.ts
// ─────────────────────────────────────────────────────────────

/** Bundled sound file name (without extension is Android's requirement). */
const ALARM_CHANNEL_SOUND = "alarm";

/** Android channel ids — identical to the server's constants. */
const ADMIN_ORDER_CHANNEL_ID = "admin_orders_alarm";
const CHEF_ORDER_CHANNEL_ID = "chef_orders_alarm";

/** Vibration pattern for the Android channel (milliseconds). */
const VIBRATION_PATTERN = [0, 600, 300, 600, 300];

/** Dedupe window — the same orderId will not ring twice within this window. */
const DEDUPE_TTL_MS = 30_000;

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

type Role = "admin" | "chef";

interface UseOrderNotifierOptions {
  /**
   * When `false`, the hook does nothing. Use this to defer mount
   * until role + auth are fully resolved.
   * Defaults to `true`.
   */
  enabled?: boolean;

  /**
   * Chef-only: the logged-in chef's `User._id` (as a string).
   * Passed from the layout so the hook can match `order.chefId`
   * against it without an extra API call.
   */
  chefUserId?: string | null;

  /**
   * Chef-only: the logged-in chef's display name. Used as a
   * fallback ownership signal when `chefId` does not match but
   * the name does (legacy orders where chefId was empty).
   */
  chefName?: string | null;
}

// ─────────────────────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────────────────────

export function useOrderNotifier(
  role: Role,
  options: UseOrderNotifierOptions = {}
): void {
  const { enabled = true, chefUserId = null, chefName = null } = options;

  // Refs so the effect can stay mounted without re-subscribing on
  // every render when these props change. We read fresh values
  // inside listeners via refs.
  const roleRef = useRef<Role>(role);
  const chefUserIdRef = useRef<string | null>(chefUserId);
  const chefNameRef = useRef<string | null>(chefName);

  /** Chef document _id — resolved once via API so ownership works
   *  even when orders store the chef-doc-id instead of the user-id. */
  const chefDocIdRef = useRef<string | null>(null);

  /** Order ids we have already rung for, with a timestamp. */
  const rungOrderIdsRef = useRef<Map<string, number>>(new Map());

  roleRef.current = role;
  chefUserIdRef.current = chefUserId;
  chefNameRef.current = chefName;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    // ─────────────────────────────────────────────────────────
    // DEDUPE HELPERS
    // ─────────────────────────────────────────────────────────

    const pruneDedupeMap = () => {
      const now = Date.now();
      const map = rungOrderIdsRef.current;
      map.forEach((ts, key) => {
        if (now - ts > DEDUPE_TTL_MS) {
          map.delete(key);
        }
      });
    };

    const hasRecentlyRung = (orderId: string): boolean => {
      pruneDedupeMap();
      const ts = rungOrderIdsRef.current.get(orderId);
      if (!ts) return false;
      return Date.now() - ts < DEDUPE_TTL_MS;
    };

    const markRung = (orderId: string) => {
      rungOrderIdsRef.current.set(orderId, Date.now());
      // Hard cap so the map cannot grow unbounded in long sessions.
      if (rungOrderIdsRef.current.size > 500) {
        pruneDedupeMap();
      }
    };

    // ─────────────────────────────────────────────────────────
    // OWNERSHIP CHECK (CHEF ONLY)
    // ─────────────────────────────────────────────────────────

    const isOrderOwnedByThisChef = (order: any): boolean => {
      if (!order) return false;

      const orderChefId = order.chefId != null ? String(order.chefId) : "";
      const myUserId = chefUserIdRef.current
        ? String(chefUserIdRef.current)
        : "";
      const myChefDocId = chefDocIdRef.current
        ? String(chefDocIdRef.current)
        : "";
      const orderChefName = String(order.chefName || "").trim().toLowerCase();
      const myName = String(chefNameRef.current || "").trim().toLowerCase();

      // Direct id matches (user-id or chef-doc-id)
      if (orderChefId && myUserId && orderChefId === myUserId) return true;
      if (orderChefId && myChefDocId && orderChefId === myChefDocId) return true;

      // Legacy/fallback: name match — only used if we have a name.
      if (orderChefId === "" && orderChefName && myName) {
        if (orderChefName === myName) return true;
      }

      return false;
    };

    // ─────────────────────────────────────────────────────────
    // TRIGGER
    // ─────────────────────────────────────────────────────────

    const ringForOrder = (order: any, source: string) => {
      const orderId = order?.orderId ? String(order.orderId) : "";
      if (!orderId) return;

      if (hasRecentlyRung(orderId)) {
        return;
      }
      markRung(orderId);

      console.log(
        `[useOrderNotifier:${roleRef.current}] 🔔 ring (${source}) orderId=${orderId}`
      );

      // Fire-and-forget. The singleton guarantees no double-play.
      void startOrderAlarm();
    };

    // ─────────────────────────────────────────────────────────
    // 1. ANDROID CHANNEL SETUP
    // ─────────────────────────────────────────────────────────

    const setupAndroidChannel = async () => {
      if (Platform.OS !== "android") return;
      try {
        const channelId =
          roleRef.current === "admin"
            ? ADMIN_ORDER_CHANNEL_ID
            : CHEF_ORDER_CHANNEL_ID;

        const channelName =
          roleRef.current === "admin"
            ? "Admin Order Alarms"
            : "Chef Order Alarms";

        await Notifications.setNotificationChannelAsync(channelId, {
          name: channelName,
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: VIBRATION_PATTERN,
          lightColor:
            roleRef.current === "admin" ? "#2563EB" : "#22C55E",
          // Android strips the extension when looking up res/raw.
          sound: ALARM_CHANNEL_SOUND,
          enableVibrate: true,
          bypassDnd: true,
          lockscreenVisibility:
            Notifications.AndroidNotificationVisibility.PUBLIC,
          audioAttributes: {
            usage: Notifications.AndroidAudioUsage.NOTIFICATION,
            contentType: Notifications.AndroidAudioContentType.SONIFICATION,
          },
        });

        console.log(
          `[useOrderNotifier:${roleRef.current}] ✅ Android channel ready: ${channelId}`
        );
      } catch (err) {
        console.log(
          `[useOrderNotifier:${roleRef.current}] channel setup error:`,
          err
        );
      }
    };

    // ─────────────────────────────────────────────────────────
    // 2. PUSH TOKEN (RE-)REGISTRATION
    // ─────────────────────────────────────────────────────────

    const registerTokenIfPossible = async () => {
      // Expo Go cannot deliver remote push on Android.
      const isExpoGo = Constants.appOwnership === AppOwnership.Expo;
      if (isExpoGo) return;

      try {
        if (!Device.isDevice) return;

        // Ensure permission.
        const existing = await Notifications.getPermissionsAsync();
        let status = existing.status;
        if (status !== "granted") {
          const req = await Notifications.requestPermissionsAsync();
          status = req.status;
        }
        if (status !== "granted") return;

        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ??
          Constants.easConfig?.projectId;
        if (!projectId) return;

        const tokenData = await Notifications.getExpoPushTokenAsync({
          projectId,
        });
        const token = tokenData?.data;
        if (!token) return;

        // Idempotent — the backend just overwrites `pushToken`.
        await api.patch("/api/auth/update-profile", { pushToken: token });

        console.log(
          `[useOrderNotifier:${roleRef.current}] 📲 push token refreshed`
        );
      } catch (err) {
        console.log(
          `[useOrderNotifier:${roleRef.current}] token refresh error:`,
          err
        );
      }
    };

    // ─────────────────────────────────────────────────────────
    // 3. FETCH CHEF DOC ID (CHEF ONLY)
    // ─────────────────────────────────────────────────────────

    const resolveChefDocId = async () => {
      if (roleRef.current !== "chef") return;
      try {
        const res = await api.get("/api/chefs/my-chef");
        const chefDoc = res.data?.chef;
        if (chefDoc?._id) {
          chefDocIdRef.current = String(chefDoc._id);
          console.log(
            `[useOrderNotifier:chef] 🧑‍🍳 chef doc id resolved: ${chefDocIdRef.current}`
          );
        }
      } catch (err) {
        console.log(
          "[useOrderNotifier:chef] chef doc lookup error:",
          err
        );
      }
    };

    // ─────────────────────────────────────────────────────────
    // 4. FOREGROUND PUSH NOTIFICATION LISTENER
    // ─────────────────────────────────────────────────────────
    // Fires when a push arrives while the app is foregrounded.
    // (When backgrounded/killed, the OS renders the notification
    // directly using the Android channel we created above.)

    const notificationSub =
      Notifications.addNotificationReceivedListener((notification) => {
        try {
          const data: any = notification?.request?.content?.data || {};
          const dataRole = String(data.role || "").toLowerCase();
          const myRole = roleRef.current;

          // Role gate — admin hook ignores chef pushes and vice versa.
          // If the payload has no role (legacy), we still allow it
          // when its `screen` matches our role's screen.
          const screen = String(data.screen || "").toLowerCase();
          const matchesRole =
            (dataRole === myRole) ||
            (!dataRole &&
              ((myRole === "admin" && screen === "admin-orders") ||
                (myRole === "chef" && screen === "chef-orders")));

          if (!matchesRole) return;

          // For chef role, verify ownership when the payload
          // carries a chefId.
          if (myRole === "chef" && data.chefId) {
            const payloadChefId = String(data.chefId);
            const myUserId = chefUserIdRef.current
              ? String(chefUserIdRef.current)
              : "";
            const myChefDocId = chefDocIdRef.current
              ? String(chefDocIdRef.current)
              : "";
            const owned =
              (myUserId && payloadChefId === myUserId) ||
              (myChefDocId && payloadChefId === myChefDocId);
            if (!owned) return;
          }

          ringForOrder(
            { orderId: data.orderId, chefId: data.chefId },
            "foreground-push"
          );
        } catch (err) {
          console.log(
            "[useOrderNotifier] notification listener error:",
            err
          );
        }
      });

    // ─────────────────────────────────────────────────────────
    // 5. SOCKET LISTENERS
    // ─────────────────────────────────────────────────────────

    // ADMIN: global `new_order_placed` fires the moment the
    // customer submits an order.
    const onAdminNewOrder = (order: any) => {
      try {
        if (roleRef.current !== "admin") return;
        ringForOrder(order, "socket:new_order_placed");
      } catch (err) {
        console.log("[useOrderNotifier:admin] socket handler error:", err);
      }
    };

    // CHEF: `advance_payment_verified` is a global emit and fires
    // after the admin verifies the advance — this is the trigger
    // the chef should react to.
    const onChefVerifiedOrder = (order: any) => {
      try {
        if (roleRef.current !== "chef") return;
        if (!order) return;
        if (order.isAdvanceVerified !== true) return;
        if (!isOrderOwnedByThisChef(order)) return;
        ringForOrder(order, "socket:advance_payment_verified");
      } catch (err) {
        console.log("[useOrderNotifier:chef] verify handler error:", err);
      }
    };

    // CHEF: `new_chef_order` (room-based emit from the server). If
    // the socket ever joins the correct room this will also fire —
    // it dedupes with the verified handler above.
    const onChefNewOrder = (order: any) => {
      try {
        if (roleRef.current !== "chef") return;
        if (!order) return;
        if (order.isAdvanceVerified !== true) return;
        if (!isOrderOwnedByThisChef(order)) return;
        ringForOrder(order, "socket:new_chef_order");
      } catch (err) {
        console.log("[useOrderNotifier:chef] new_chef_order handler error:", err);
      }
    };

    // ─────────────────────────────────────────────────────────
    // 6. BOOTSTRAP
    // ─────────────────────────────────────────────────────────

    const bootstrap = async () => {
      // Best-effort: refresh user to ensure name/id are current.
      try {
        const cached = await getUser();
        if (cached) {
          if (roleRef.current === "chef") {
            if (!chefUserIdRef.current && cached.id) {
              chefUserIdRef.current = String(cached.id);
            }
            if (!chefNameRef.current && cached.name) {
              chefNameRef.current = String(cached.name);
            }
          }
        }
      } catch (err) {
        console.log("[useOrderNotifier] getUser error:", err);
      }

      // Channel first, then token registration, then chef-doc id.
      await setupAndroidChannel();

      if (cancelled) return;

      await registerTokenIfPossible();

      if (cancelled) return;

      await resolveChefDocId();

      if (cancelled) return;

      // Wire socket listeners.
      if (roleRef.current === "admin") {
        socket.on("new_order_placed", onAdminNewOrder);
        console.log(
          "[useOrderNotifier:admin] socket listener attached (new_order_placed)"
        );
      } else {
        socket.on("advance_payment_verified", onChefVerifiedOrder);
        socket.on("new_chef_order", onChefNewOrder);
        console.log(
          "[useOrderNotifier:chef] socket listeners attached (advance_payment_verified, new_chef_order)"
        );
      }
    };

    void bootstrap();

    // ─────────────────────────────────────────────────────────
    // 7. CLEANUP
    // ─────────────────────────────────────────────────────────

    return () => {
      cancelled = true;

      // Notification listener
      try {
        notificationSub.remove();
      } catch (err) {
        console.log("[useOrderNotifier] notification cleanup error:", err);
      }

      // Socket listeners — explicitly detach BOTH handler sets so a
      // role switch (e.g. logout → login as another role) leaves no
      // stale listeners behind.
      try {
        socket.off("new_order_placed", onAdminNewOrder);
      } catch {
        // ignore
      }
      try {
        socket.off("advance_payment_verified", onChefVerifiedOrder);
      } catch {
        // ignore
      }
      try {
        socket.off("new_chef_order", onChefNewOrder);
      } catch {
        // ignore
      }

      // Clear the dedupe map for this mount.
      rungOrderIdsRef.current.clear();
    };
  }, [enabled, role]);
}