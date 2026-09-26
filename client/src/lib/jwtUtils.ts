/**
 * ============================================================
 * JWT UTILITIES
 * ============================================================
 *
 * These helpers are used by the root layout (app/layout.tsx)
 * and other parts of the mobile app to determine whether the
 * Katbox JWT issued by our own backend is still valid.
 *
 * We deliberately AVOID a hard dependency on `jwt-decode` for
 * two reasons:
 *
 *   1. A missing/broken dependency at module load would crash
 *      the entire root layout, making the app appear to be
 *      "stuck at splash". By decoding manually we remove that
 *      failure mode entirely.
 *
 *   2. The only field we need is `exp` — no signature
 *      verification, no claim validation — so a full library
 *      is overkill.
 *
 * NOTE: This is NOT a security boundary. The server always
 * re-verifies the JWT on every request. These helpers exist
 * purely for client-side UX (redirecting expired sessions to
 * /login before making a doomed request).
 * ============================================================
 */

type JwtPayload = {
  exp?: number;
  userId?: string;
  _id?: string;
  id?: string;
  isAdmin?: boolean;
  isChef?: boolean;
  [key: string]: any;
};

/**
 * ============================================================
 * SAFE BASE64URL DECODE
 * ============================================================
 *
 * Decodes the payload segment of a JWT. Works in:
 *   • React Native (uses `atob` when available, falls back to
 *     a pure-JS base64 decoder)
 *   • Node (uses Buffer)
 *
 * Returns the parsed object, or null on any failure.
 */
const decodeJwtPayload = (
  token: string
): JwtPayload | null => {
  if (!token || typeof token !== "string") {
    return null;
  }

  try {
    const parts = token.split(".");

    if (parts.length !== 3) {
      return null;
    }

    // Base64URL → Base64
    const base64Url = parts[1];
    const base64 = base64Url
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    // Pad to a multiple of 4
    const padded =
      base64 + "=".repeat((4 - (base64.length % 4)) % 4);

    let jsonString: string | null = null;

    // Prefer atob (works in React Native and modern Node)
    if (typeof atob === "function") {
      try {
        jsonString = atob(padded);
      } catch {
        jsonString = null;
      }
    }

    // Fallback to Buffer (Node) if atob wasn't available or failed
    if (jsonString === null && typeof Buffer !== "undefined") {
      try {
        jsonString = Buffer.from(
          padded,
          "base64"
        ).toString("binary");
      } catch {
        jsonString = null;
      }
    }

    if (jsonString === null) {
      return null;
    }

    const parsed = JSON.parse(jsonString);

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return parsed as JwtPayload;
  } catch {
    return null;
  }
};

/**
 * ============================================================
 * GET TOKEN EXPIRY
 * ============================================================
 *
 * Returns the expiry timestamp of the JWT in milliseconds,
 * or null if the token is malformed / has no `exp`.
 */
export const getTokenExpiry = (
  token: string
): number | null => {
  try {
    const payload = decodeJwtPayload(token);

    if (
      !payload ||
      typeof payload.exp !== "number" ||
      !Number.isFinite(payload.exp)
    ) {
      return null;
    }

    // JWT `exp` is in SECONDS since epoch — convert to ms.
    return payload.exp * 1000;
  } catch {
    return null;
  }
};

/**
 * ============================================================
 * IS TOKEN EXPIRED
 * ============================================================
 *
 * Returns true if the token is missing, malformed, or has
 * already expired (or is about to expire within the next
 * SAFETY_BUFFER_MS).
 *
 * The safety buffer prevents the pathological case where:
 *   • The client decides the token is still valid
 *   • Makes a request
 *   • The token expires while the request is in-flight
 *   • The server rejects it with 401
 *
 * Treating "expires in < 2s" as already-expired keeps the
 * client from ever getting into that race.
 */
const SAFETY_BUFFER_MS = 2000;

export const isTokenExpired = (
  token: string
): boolean => {
  const expiry = getTokenExpiry(token);

  if (!expiry) {
    // No `exp` → we cannot trust the token.
    return true;
  }

  return Date.now() >= expiry - SAFETY_BUFFER_MS;
};

/**
 * ============================================================
 * ✅ NEW: EXTRACT USER ID FROM TOKEN
 * ============================================================
 *
 * Convenience helper for cases where the app needs the userId
 * before a `/auth/me` round-trip completes (e.g. socket room
 * joining, offline analytics).
 *
 * The backend signs the JWT with `userId`, but we defensively
 * fall back to `_id` / `id` in case the signing payload changes.
 */
export const getUserIdFromToken = (
  token: string
): string | null => {
  try {
    const payload = decodeJwtPayload(token);

    if (!payload) {
      return null;
    }

    const rawId =
      payload.userId || payload._id || payload.id;

    if (
      typeof rawId !== "string" &&
      typeof rawId !== "number"
    ) {
      return null;
    }

    const asString = String(rawId).trim();

    return asString.length > 0 ? asString : null;
  } catch {
    return null;
  }
};

/**
 * ============================================================
 * ✅ NEW: EXTRACT ROLE FROM TOKEN
 * ============================================================
 *
 * Returns the user's role as inferred from the JWT payload.
 * Returns "customer" as the safe default when the token has
 * no role hints.
 *
 * NOTE: Admin takes priority over chef if both flags are set
 * (matching the client's getRoleRoute() logic in layout.tsx).
 */
export const getRoleFromToken = (
  token: string
): "customer" | "chef" | "admin" => {
  try {
    const payload = decodeJwtPayload(token);

    if (!payload) {
      return "customer";
    }

    if (payload.isAdmin === true) {
      return "admin";
    }

    if (payload.isChef === true) {
      return "chef";
    }

    return "customer";
  } catch {
    return "customer";
  }
};