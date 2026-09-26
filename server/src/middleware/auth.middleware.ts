import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    [key: string]: any;
  };
}

/**
 * ============================================================
 * AUTH MIDDLEWARE
 * ============================================================
 *
 * Verifies the Katbox JWT sent in the `Authorization` header
 * and attaches the decoded payload to `req.user`.
 *
 * The Katbox JWT is issued by our own backend after Twilio OTP
 * verification (POST /auth/verify-otp). Its payload contains:
 *
 *   {
 *     userId: "<mongo _id>",
 *     _id:    "<mongo _id>",
 *     id:     "<mongo _id>",
 *     iat:    <issued-at seconds>,
 *     exp:    <expiry seconds>
 *   }
 *
 * Downstream handlers consistently read `req.user.userId`
 * (with `_id` / `id` fallbacks) to identify the caller.
 * ============================================================
 */
export const protect = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  /*
   * ----------------------------------------------------------
   * MISSING / MALFORMED HEADER
   * ----------------------------------------------------------
   */
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      code: "NO_TOKEN",
      message: "Not authorized, token missing",
    });
  }

  const token = authHeader.split(" ")[1];

  if (!token || !token.trim()) {
    return res.status(401).json({
      success: false,
      code: "NO_TOKEN",
      message: "Not authorized, token missing",
    });
  }

  /*
   * ----------------------------------------------------------
   * JWT SECRET CHECK
   * ----------------------------------------------------------
   *
   * If JWT_SECRET is missing from the environment, `jwt.verify`
   * will throw a `secretOrPublicKey must be provided` error for
   * EVERY request, which masquerades as "token invalid" and
   * causes every logged-in user to be silently bounced back to
   * /login.
   *
   * We surface this as a 500 so it's obvious it's a server
   * config issue, not a user auth issue.
   */
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    console.error(
      "❌ JWT_SECRET is not configured on the server. All protected routes will fail."
    );

    return res.status(500).json({
      success: false,
      code: "SERVER_CONFIG_ERROR",
      message:
        "Server authentication is not configured. Please contact support.",
    });
  }

  /*
   * ----------------------------------------------------------
   * VERIFY TOKEN
   * ----------------------------------------------------------
   */
  try {
    const decoded = jwt.verify(token, jwtSecret) as {
      userId?: string;
      _id?: string;
      id?: string;
      [key: string]: any;
    };

    /*
     * --------------------------------------------------------
     * NORMALIZE userId
     * --------------------------------------------------------
     *
     * The Katbox JWT signs all three aliases (userId, _id, id)
     * so any downstream handler can rely on at least one being
     * present. If somehow none of them are (e.g. a legacy token
     * signed with a different payload shape), we reject the
     * request here instead of letting handlers explode with a
     * 500 further down the stack.
     */
    const rawUserId =
      decoded.userId || decoded._id || decoded.id;

    if (
      rawUserId === undefined ||
      rawUserId === null ||
      String(rawUserId).trim() === ""
    ) {
      console.warn(
        "⚠️ JWT verified but contains no userId/_id/id:",
        decoded
      );

      return res.status(401).json({
        success: false,
        code: "INVALID_TOKEN_PAYLOAD",
        message: "Invalid token payload",
      });
    }

    req.user = {
      ...decoded,
      userId: String(rawUserId),
    };

    return next();
  } catch (error: any) {
    /*
     * --------------------------------------------------------
     * EXPIRED TOKEN
     * --------------------------------------------------------
     *
     * Return a distinct `code` so the client can force a
     * logout + re-login flow rather than treating it as a
     * generic "invalid token" error.
     */
    if (error?.name === "TokenExpiredError") {
      console.log("⏰ Request rejected — JWT expired.");

      return res.status(401).json({
        success: false,
        code: "TOKEN_EXPIRED",
        message: "Session expired. Please log in again.",
      });
    }

    /*
     * --------------------------------------------------------
     * MALFORMED / BAD SIGNATURE
     * --------------------------------------------------------
     */
    if (error?.name === "JsonWebTokenError") {
      console.log(
        "❌ Request rejected — JWT invalid:",
        error.message
      );

      return res.status(401).json({
        success: false,
        code: "INVALID_TOKEN",
        message: "Invalid or expired token",
      });
    }

    /*
     * --------------------------------------------------------
     * ANY OTHER ERROR (defensive)
     * --------------------------------------------------------
     */
    console.log(
      "❌ Request rejected — unexpected JWT verify error:",
      error
    );

    return res.status(401).json({
      success: false,
      code: "INVALID_TOKEN",
      message: "Invalid or expired token",
    });
  }
};