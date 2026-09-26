import express from "express";
import { protect, AuthRequest } from "../middleware/auth.middleware";

const router = express.Router();

/**
 * ============================================================
 * PROTECTED ROUTES
 * ============================================================
 *
 * Endpoints that require a valid Katbox JWT.
 *
 * The `protect` middleware (see ../middleware/auth.middleware)
 * verifies the Authorization header and attaches the decoded
 * payload to `req.user`:
 *
 *   req.user = {
 *     userId: "<mongo _id>",  // normalized, always present
 *     _id:    "<mongo _id>",
 *     id:     "<mongo _id>",
 *     iat:    <issued-at>,
 *     exp:    <expiry>,
 *   }
 *
 * If the token is missing, expired, or malformed, `protect`
 * short-circuits with a 401 and a `code` field the client
 * can use to trigger a clean re-login:
 *
 *   { code: "NO_TOKEN" }
 *   { code: "TOKEN_EXPIRED" }
 *   { code: "INVALID_TOKEN" }
 *   { code: "INVALID_TOKEN_PAYLOAD" }
 *   { code: "SERVER_CONFIG_ERROR" }
 * ============================================================
 */

/**
 * GET /protected/me
 *
 * Simple authenticated probe used by the client to confirm:
 *   1. The JWT is still valid.
 *   2. The server can decode it.
 *   3. The userId round-trips correctly.
 *
 * Unlike `/auth/me` (which hits MongoDB for the full user
 * profile), this endpoint is a **stateless** check — it
 * only reads the JWT. That makes it ideal for:
 *   • Fast auth probes on app foreground
 *   • Detecting JWT expiry before triggering a real request
 *   • Debugging token contents during development
 */
router.get("/me", protect, (req: AuthRequest, res) => {
  /*
   * ----------------------------------------------------------
   * SAFETY GUARD
   * ----------------------------------------------------------
   *
   * `protect` guarantees `req.user.userId` is set on success,
   * but we defensively check here so a future refactor of the
   * middleware can't silently break this endpoint.
   */
  if (!req.user || !req.user.userId) {
    return res.status(401).json({
      success: false,
      code: "INVALID_TOKEN_PAYLOAD",
      message: "Token payload missing userId",
    });
  }

  /*
   * ----------------------------------------------------------
   * ROLE HINT
   * ----------------------------------------------------------
   *
   * The Katbox JWT currently does NOT include isAdmin / isChef
   * flags in its payload, so we default to "customer". If you
   * later add role claims to the JWT (in auth.routes.ts when
   * signing), this endpoint will automatically surface them.
   *
   * In the meantime, the client should always resolve role via
   * `/auth/me` (which reads the freshest flags from MongoDB).
   */
  let role: "customer" | "chef" | "admin" = "customer";

  if ((req.user as any).isAdmin === true) {
    role = "admin";
  } else if ((req.user as any).isChef === true) {
    role = "chef";
  }

  /*
   * ----------------------------------------------------------
   * RESPONSE
   * ----------------------------------------------------------
   *
   * We return the full decoded payload (minus iat / exp) so
   * the client can inspect it during debugging, plus a
   * computed `role` field for convenience.
   */
  return res.json({
    success: true,
    message: "You are authenticated",
    userId: req.user.userId,
    role,
    user: req.user,
  });
});

export default router;