/**
 * ============================================================
 * SOCKET.IO CLIENT (Katbox)
 * ============================================================
 *
 * Used for real-time order lifecycle updates:
 *
 *   • Chef accepts / rejects an order   → customer's Orders tab
 *   • Stepper status changes            → customer's Orders tab
 *   • Delivery status updates           → customer's Orders tab
 *   • New incoming order                → chef + admin devices
 *
 * Design goals:
 *
 *   1. **Never throw at import time.** If `socket.io-client` is
 *      not installed, or the server is unreachable, the module
 *      still exports a usable `socket` (or `null`) so downstream
 *      code like `layout.tsx` can import it without crashing.
 *
 *   2. **Share the API base URL.** We import `SOCKET_URL` from
 *      `api.ts` so both the REST API and WebSocket traffic go
 *      to the same host (env-var aware, works in Expo Go + dev
 *      builds + production).
 *
 *   3. **Authenticate the handshake.** On connect we send the
 *      JWT as `auth.token`, plus `userId` + `role` so the server
 *      can immediately place the socket into the correct rooms
 *      (userId private room, "admins", "chefs").
 *
 *   4. **Auto-rejoin after reconnect.** Socket.IO emits
 *      `connect` again after a network drop; server-side rooms
 *      are NOT restored automatically, so we re-emit `join`
 *      for every role on every `connect` event.
 * ============================================================
 */

import { SOCKET_URL, getSocketAuth } from "./api";

/*
 * ------------------------------------------------------------
 * LAZY REQUIRE so a missing package does not crash the app
 * ------------------------------------------------------------
 *
 * If `socket.io-client` is not installed (or fails to load for
 * any reason), `io` stays `null` and we export `socket = null`.
 * Callers should check `if (!socket) return;` before emitting.
 */
let io: any = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  io = require("socket.io-client").io;
} catch (err) {
  console.log(
    "⚠️ socket.io-client not available. Realtime updates disabled.",
    err
  );
}

/**
 * The socket instance, or `null` if socket.io-client is not
 * installed / failed to initialize.
 */
export let socket: any = null;

/*
 * ------------------------------------------------------------
 * CONNECTION OPTIONS
 * ------------------------------------------------------------
 *
 * `transports: ["websocket"]` is intentionally restrictive:
 * on React Native, the default polling transport frequently
 * gets stuck behind corporate proxies / flaky mobile networks
 * and falls back to long-poll HTTP which is unreliable on
 * Android. Sticking to websocket gives us a stable connection
 * for the realtime order events.
 *
 * `reconnectionAttempts` and `reconnectionDelay` are tuned for
 * mobile: aggressive enough to recover quickly, not so
 * aggressive that it spams the server on a dead network.
 * ------------------------------------------------------------
 */
const SOCKET_OPTIONS = {
  transports: ["websocket"],
  reconnection: true,
  reconnectionAttempts: 15,
  reconnectionDelay: 1500,
  reconnectionDelayMax: 8000,
  timeout: 20000,
  autoConnect: false, // we connect explicitly after auth resolution
};

/*
 * ------------------------------------------------------------
 * INITIALIZE THE SOCKET (if io is available)
 * ------------------------------------------------------------
 */
if (io) {
  try {
    socket = io(SOCKET_URL, SOCKET_OPTIONS);

    /*
     * ----------------------------------------------------------
     * CONNECT
     * ----------------------------------------------------------
     *
     * On every (re)connect:
     *   1. Refresh the JWT-based auth payload.
     *   2. Emit `join` for the user's private room + role rooms.
     *
     * The server's `io.on("connection")` handler is what
     * actually places the socket into rooms; the client-side
     * `join` emits are the handshake.
     */
    socket.on("connect", async () => {
      console.log("⚡ Socket connected:", socket.id);

      try {
        const auth = await getSocketAuth();

        if (auth?.userId) {
          socket.emit("join", String(auth.userId));
        }

        if (auth?.role === "admin") {
          socket.emit("join", "admins");
        }

        if (auth?.role === "chef") {
          socket.emit("join", "chefs");
        }

        console.log("🔌 Socket joined rooms for role:", {
          userId: auth?.userId || null,
          role: auth?.role || "customer",
        });
      } catch (err) {
        console.log(
          "Socket connect/join error:",
          err
        );
      }
    });

    /*
     * ----------------------------------------------------------
     * DISCONNECT
     * ----------------------------------------------------------
     */
    socket.on("disconnect", (reason: string) => {
      console.log("🔌 Socket disconnected:", reason);
    });

    /*
     * ----------------------------------------------------------
     * CONNECT ERROR
     * ----------------------------------------------------------
     */
    socket.on("connect_error", (err: any) => {
      console.log(
        "❌ Socket connect_error:",
        err?.message || err
      );
    });

    /*
     * ----------------------------------------------------------
     * RECONNECT
     * ----------------------------------------------------------
     *
     * Note: the "connect" listener above fires again after a
     * successful reconnect, so we do NOT need to rejoin rooms
     * here — the connect handler takes care of it.
     */
    socket.on("reconnect", (attempt: number) => {
      console.log(
        `🔄 Socket reconnected after ${attempt} attempt(s)`
      );
    });

    /*
     * ----------------------------------------------------------
     * INITIAL CONNECT
     * ----------------------------------------------------------
     *
     * We explicitly connect once the listeners are wired up.
     * (autoConnect is disabled so callers can control timing.)
     */
    socket.connect();
  } catch (err) {
    console.log(
      "⚠️ Socket initialization failed. Realtime updates disabled.",
      err
    );

    socket = null;
  }
}

/*
 * ------------------------------------------------------------
 * PUBLIC HELPERS
 * ------------------------------------------------------------
 */

/**
 * Force a manual reconnection. Useful when the app returns from
 * the background and the socket may have gone stale.
 */
export const reconnectSocket = (): void => {
  if (!socket) return;

  try {
    if (!socket.connected) {
      socket.connect();
    }
  } catch (err) {
    console.log("Socket reconnect error:", err);
  }
};

/**
 * Disconnect and tear down the socket. Called during logout to
 * ensure the server-side room membership is released.
 */
export const disconnectSocket = (): void => {
  if (!socket) return;

  try {
    socket.disconnect();
  } catch (err) {
    console.log("Socket disconnect error:", err);
  }
};

/**
 * Re-join role rooms on demand. Normally this happens
 * automatically on every "connect" event, but some screens
 * (e.g. after a role change is applied server-side) may want
 * to force a rejoin without reconnecting the transport.
 */
export const rejoinSocketRooms = async (): Promise<void> => {
  if (!socket || !socket.connected) return;

  try {
    const auth = await getSocketAuth();

    if (auth?.userId) {
      socket.emit("join", String(auth.userId));
    }

    if (auth?.role === "admin") {
      socket.emit("join", "admins");
    }

    if (auth?.role === "chef") {
      socket.emit("join", "chefs");
    }

    console.log("🔌 Socket re-joined rooms:", {
      userId: auth?.userId || null,
      role: auth?.role || "customer",
    });
  } catch (err) {
    console.log("Socket rejoin error:", err);
  }
};

export default socket;