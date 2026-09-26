import { rateLimit, Options } from "express-rate-limit";
import { Request, Response } from "express";

/**
 * ============================================================
 * OTP RATE LIMITER
 * ============================================================
 *
 * ✅ KEYED ON PHONE NUMBER (not IP)
 *
 * The previous version used a phone-first, IP-fallback key.
 * On Render (and any reverse-proxied host), `req.ip` is the
 * load balancer's internal IP, not the real client's — so
 * the "IP fallback" degenerated into a single shared bucket
 * for the entire internet, locking out every user after a
 * handful of total OTP requests across all devices.
 *
 * We now key strictly on the normalized phone number. If a
 * request arrives without a phone (malformed body), we key
 * on a constant — effectively rate-limiting the malformed
 * bucket, which is fine because such requests are rejected
 * by the handler anyway.
 * ============================================================
 */

const otpKeyGenerator = (req: Request): string => {
  try {
    const phone =
      typeof req.body?.phone === "string" ? req.body.phone : "";

    const digits = phone.replace(/\D/g, "");

    if (digits.length >= 10) {
      // Key on the last 10 digits so "+91X", "91X", "X", and
      // "0X" all collapse to the same bucket.
      return `otp:phone:${digits.slice(-10)}`;
    }
  } catch {
    // fall through
  }

  // Malformed / missing phone — share one small bucket for
  // these. Handler will reject them anyway.
  return "otp:phone:invalid";
};

const RATE_LIMIT_MESSAGE = {
  success: false,
  code: "RATE_LIMITED",
  message:
    "Too many OTP requests for this number. Please wait 15 minutes and try again.",
};

export const otpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,                   // 5 OTPs per phone per 15 min is plenty

  keyGenerator: otpKeyGenerator,

  standardHeaders: "draft-7",
  legacyHeaders: false,

  message: RATE_LIMIT_MESSAGE,

  skip: (req: Request) => {
    // Health probes from Render's internal checks — skip them.
    const ip = req.ip || "";
    return (
      ip === "127.0.0.1" ||
      ip === "::1" ||
      ip === "::ffff:127.0.0.1"
    );
  },

  handler: (
    req: Request,
    res: Response,
    _next: any,
    options: Options
  ) => {
    const phone = String(req.body?.phone || "<no-phone>");
    console.warn(
      `🚫 OTP rate limit hit. Phone: ${phone} | Max: ${options.max} | Window: ${options.windowMs}ms`
    );

    res.status(429).json(RATE_LIMIT_MESSAGE);
  },
});