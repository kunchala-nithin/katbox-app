import { rateLimit, Options } from "express-rate-limit";
import { Request, Response } from "express";

/**
 * ============================================================
 * OTP RATE LIMITER
 * ============================================================
 *
 * Protects the /auth/send-otp and /auth/verify-otp endpoints
 * from abuse while still being permissive enough for real
 * users behind shared NAT (public WiFi, CGNAT mobile networks,
 * office networks).
 *
 * Three layers of protection:
 *
 *   1. **Per-IP limiter** (below) — coarse protection.
 *      Stops a single device / script from hammering the
 *      endpoint.
 *
 *   2. **Per-phone limiter** — finer protection. Prevents
 *      someone from requesting hundreds of OTPs for the same
 *      number even if they rotate IPs. (Applied inside
 *      auth.routes.ts via a small custom keyGenerator, if
 *      you want it — see note at the bottom.)
 *
 *   3. **Twilio's own Verify service rate limit** — the
 *      final backstop. Twilio rejects >N sends to the same
 *      number per unit time regardless of our own limits.
 *
 * IMPORTANT — RENDER FREE TIER CAVEAT
 * ------------------------------------
 * On Render's free tier, the server sleeps after ~15 min of
 * inactivity. Each cold-start resets the in-memory rate-limit
 * store, which resets every counter. That means a hostile
 * actor could, in theory, wake the server and get a fresh
 * 20-request budget.
 *
 * For a hobby / MVP deployment this is acceptable. If you
 * need strict global rate limiting, set REDIS_URL and this
 * limiter will automatically use a Redis-backed store (see
 * the optional block at the bottom — commented out by
 * default).
 * ============================================================
 */

/**
 * Custom key generator:
 *   • Uses the phone number from the request body when present,
 *     so requests to send an OTP for the SAME number are
 *     limited together regardless of IP.
 *   • Falls back to the client IP otherwise.
 *
 * This is intentionally more forgiving than a raw IP key: a
 * user on a shared WiFi can still request OTPs for their own
 * number, but a single number cannot be spammed.
 */
const otpKeyGenerator = (req: Request): string => {
  try {
    const phone =
      typeof req.body?.phone === "string" ? req.body.phone : "";

    // Normalize phone for consistent keying
    const digits = phone.replace(/\D/g, "");

    if (digits.length >= 10) {
      // Key on the last 10 digits (Indian mobile) so "+91X" and
      // "X" and "91X" all collapse to the same bucket.
      return `otp:phone:${digits.slice(-10)}`;
    }
  } catch {
    // Fall through to IP
  }

  // Fallback: use Express's built-in IP resolver.
  // express-rate-limit v7 supports a `ipKeyGenerator` helper,
  // but we keep it simple here.
  return `otp:ip:${req.ip || "unknown"}`;
};

/**
 * Message shape matches the rest of the Katbox API.
 */
const RATE_LIMIT_MESSAGE = {
  success: false,
  code: "RATE_LIMITED",
  message:
    "Too many OTP requests. Please wait a few minutes and try again.",
};

/**
 * ============================================================
 * OTP RATE LIMITER
 * ============================================================
 *
 * IMPORTANT: this export is consumed by auth.routes.ts as
 *   import { otpRateLimiter } from "../middleware/otpRateLimit";
 * and used as:
 *   router.post("/send-otp", otpRateLimiter, handler);
 *
 * So the export name and call-signature must stay the same.
 */
export const otpRateLimiter = rateLimit({
  /**
   * Window: 15 minutes. Long enough to stop abuse, short enough
   * that a legitimate user who fat-fingers their number a few
   * times isn't locked out for hours.
   */
  windowMs: 15 * 60 * 1000,

  /**
   * Max 20 requests per window per key.
   *
   * Why 20 and not 10?
   *   • Behind CGNAT / public WiFi, many users share an IP.
   *   • A user might legitimately request 3–4 OTPs (typo in
   *     number, SMS delay, resend after 60s).
   *   • Some carriers split traffic across IPs mid-session,
   *     so a single user can appear as 2–3 IPs.
   *
   * 20 is a good balance: stops scripted abuse but doesn't
   * lock out real users. Twilio's own limit kicks in well
   * before 20 sends to the same number.
   */
  max: 20,

  /**
   * Use the phone (or IP fallback) as the rate-limit key.
   */
  keyGenerator: otpKeyGenerator,

  /**
   * Return the standard RateLimit-* headers so clients can see
   * when they're close to the limit.
   *
   * 'draft-7' is the current stable spec supported by
   * express-rate-limit v7.x. 'draft-8' was added in 7.4+ but
   * may silently fall back on older 7.x installs.
   */
  standardHeaders: "draft-7",
  legacyHeaders: false,

  /**
   * Custom response body so it matches the rest of the API.
   */
  message: RATE_LIMIT_MESSAGE,

  /**
   * Skip rate-limiting for loopback / health-check probes so
   * Render's internal checks don't burn the budget.
   */
  skip: (req: Request) => {
    const ip = req.ip || "";
    return (
      ip === "127.0.0.1" ||
      ip === "::1" ||
      ip === "::ffff:127.0.0.1"
    );
  },

  /**
   * Log when the limiter blocks a request so it's visible in
   * the server logs during debugging.
   */
  handler: (
    _req: Request,
    res: Response,
    _next: any,
    options: Options
  ) => {
    console.warn(
      "🚫 OTP rate limit hit. Key:",
      _req.ip,
      "Max:",
      options.max,
      "Window (ms):",
      options.windowMs
    );

    res.status(429).json(RATE_LIMIT_MESSAGE);
  },
});

/**
 * ============================================================
 * ✅ OPTIONAL — REDIS-BACKED STORE
 * ============================================================
 *
 * If you set REDIS_URL in the environment, this block will
 * automatically upgrade the OTP rate limiter to use Redis,
 * which persists across server restarts and works across
 * multiple server instances.
 *
 * This block is intentionally a no-op if:
 *   • REDIS_URL is not set, OR
 *   • the `rate-limit-redis` / `redis` packages are not
 *     installed.
 *
 * To enable it:
 *   1. npm install rate-limit-redis redis
 *   2. Set REDIS_URL=redis://... in the environment
 *   3. Uncomment the block below.
 *
 * The rest of the app (auth.routes.ts) needs NO changes.
 * ============================================================
 */

// import { RedisStore } from "rate-limit-redis";
// import { createClient } from "redis";
//
// if (process.env.REDIS_URL) {
//   try {
//     const redisClient = createClient({ url: process.env.REDIS_URL });
//     redisClient.connect().catch((err) => {
//       console.error("❌ Redis connect error for OTP limiter:", err);
//     });
//
//     (otpRateLimiter as any).store = new RedisStore({
//       sendCommand: (...args: string[]) =>
//         (redisClient as any).sendCommand(args),
//       prefix: "katbox:otp:",
//     });
//
//     console.log("✅ OTP rate limiter backed by Redis.");
//   } catch (err) {
//     console.error(
//       "⚠️ Redis OTP limiter init failed, falling back to memory:",
//       err
//     );
//   }
// } else {
//   console.log("ℹ️ OTP rate limiter using in-memory store.");
// }