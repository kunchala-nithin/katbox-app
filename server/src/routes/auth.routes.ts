import dotenv from "dotenv";
dotenv.config();

import express from "express";
import jwt from "jsonwebtoken";
import twilio from "twilio";
import { verifyToken } from "@clerk/backend";
import User, {
  ISavedAddress,
  IActiveAddress,
} from "../models/User";
// ✅ NEW: Chef model import — needed to join Chef.orderHistory for chef users
import Chef from "../models/Chef";
// Twilio Verify enforces verification checks; a local send throttle below adds an extra guard.
import {
  AuthRequest,
  protect,
} from "../middleware/auth.middleware";
import { normalizeIndianPhone } from "../utils/phone";
import { emitChefAccessChanged } from "../utils/socket";

const router = express.Router();

/*
 * ============================================================
 * HELPERS
 * ============================================================
 */

/**
 * Normalize email consistently everywhere.
 */
const normalizeEmail = (email: unknown): string => {
  if (typeof email !== "string") {
    return "";
  }

  return email.trim().toLowerCase();
};

/**
 * Twilio Verify configuration.
 *
 * These credentials must exist only in the backend environment
 * (Render), never in the Expo application or a public repository.
 */
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

const twilioClient =
  accountSid && authToken
    ? twilio(accountSid, authToken)
    : null;

/**
 * Lightweight per-process OTP-send throttle.
 *
 * Twilio Verify also applies its configured service limits. For a
 * multi-instance production deployment, use a shared Redis-backed
 * rate-limit store as well; this in-memory guard resets on restart
 * and is not a substitute for distributed rate limiting.
 */
const otpSendHistory = new Map<string, number[]>();
const OTP_SEND_COOLDOWN_MS = 30 * 1000;
const OTP_SEND_WINDOW_MS = 60 * 60 * 1000;
const OTP_SEND_MAX_PER_HOUR = 5;

const canSendOtp = (phone: string): {
  allowed: boolean;
  retryAfterSeconds?: number;
} => {
  const now = Date.now();
  const recent = (otpSendHistory.get(phone) || []).filter(
    (timestamp) => now - timestamp < OTP_SEND_WINDOW_MS
  );

  const lastSentAt = recent[recent.length - 1];

  if (lastSentAt && now - lastSentAt < OTP_SEND_COOLDOWN_MS) {
    otpSendHistory.set(phone, recent);
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(
        (OTP_SEND_COOLDOWN_MS - (now - lastSentAt)) / 1000
      ),
    };
  }

  if (recent.length >= OTP_SEND_MAX_PER_HOUR) {
    otpSendHistory.set(phone, recent);
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(
        (OTP_SEND_WINDOW_MS - (now - recent[0])) / 1000
      ),
    };
  }

  return { allowed: true };
};

const recordOtpSend = (phone: string): void => {
  const now = Date.now();
  const recent = (otpSendHistory.get(phone) || []).filter(
    (timestamp) => now - timestamp < OTP_SEND_WINDOW_MS
  );

  recent.push(now);
  otpSendHistory.set(phone, recent);
};

/**
 * Helper: build consistent user response payload.
 */
const buildUserResponse = (user: any) => ({
  id: user._id,
  _id: user._id,
  name:
    user.name && user.name.trim()
      ? user.name.trim()
      : "User",
  phone: user.phone || "",
  email: user.email || "",
  address: user.address || "",
  activeAddress: user.activeAddress || null,
  savedAddresses: user.savedAddresses || [],
  isChef: user.isChef,
  isAdmin: user.isAdmin || false,
  pushToken: user.pushToken || "",
});

/*
 * ============================================================
 * ✅ NEW: requireAdmin middleware
 * ============================================================
 *
 * Inline admin check for the admin-only endpoints.
 * Loads the user from MongoDB and verifies isAdmin === true.
 * Any non-admin request receives 403 with a clear message.
 * ============================================================
 */
const requireAdmin = async (
  req: AuthRequest,
  res: any,
  next: any
) => {
  try {
    const userId =
      req.user?.userId ||
      req.user?._id ||
      req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const adminUser = await User.findById(userId);
    if (!adminUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!adminUser.isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    // Attach for downstream handlers (optional convenience)
    (req as any).adminUser = adminUser;

    next();
  } catch (err: any) {
    console.error("requireAdmin error:", err);
    return res.status(500).json({
      success: false,
      message: "Admin check failed",
    });
  }
};

/*
 * ============================================================
 * CLERK GOOGLE LOGIN
 * ============================================================
 *
 * ACCOUNT RULE:
 *
 *   ONE MOBILE NUMBER
 *          ↓
 *   ONE GOOGLE EMAIL
 *          ↓
 *   ONE MONGODB USER
 *
 * The mobile number is checked FIRST.
 *
 * This prevents:
 *
 *   Same mobile + Google account A
 *
 * from becoming:
 *
 *   Same mobile + Google account B
 *
 * ============================================================
 */

/**
 * Resolve the identity from a signed Clerk session token and Clerk's
 * server-side user API. Never trust email or clerkId sent in the request body.
 */
const getVerifiedClerkIdentity = async (req: express.Request) => {
  const clerkSecret = process.env.CLERK_SECRET_KEY;
  if (!clerkSecret) throw new Error("CLERK_SECRET_KEY_MISSING");

  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) throw new Error("CLERK_TOKEN_REQUIRED");
  const sessionToken = authHeader.slice(7).trim();
  if (!sessionToken) throw new Error("CLERK_TOKEN_REQUIRED");

  const payload = await verifyToken(sessionToken, { secretKey: clerkSecret });
  const clerkId = typeof payload.sub === "string" ? payload.sub : "";
  if (!clerkId) throw new Error("INVALID_CLERK_IDENTITY");

  const response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(clerkId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${clerkSecret}`, "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error("CLERK_USER_LOOKUP_FAILED");
  const clerkUser: any = await response.json();
  const primaryId = clerkUser.primary_email_address_id;
  const emailRecord = Array.isArray(clerkUser.email_addresses)
    ? clerkUser.email_addresses.find((item: any) => item.id === primaryId) ||
      clerkUser.email_addresses.find((item: any) => item.verification?.status === "verified")
    : null;
  if (!emailRecord || emailRecord.verification?.status !== "verified") {
    throw new Error("VERIFIED_GOOGLE_EMAIL_REQUIRED");
  }

  const email = normalizeEmail(emailRecord.email_address);
  if (!email) throw new Error("VERIFIED_GOOGLE_EMAIL_REQUIRED");
  return {
    clerkId,
    email,
    name: [clerkUser.first_name, clerkUser.last_name].filter(Boolean).join(" ").trim(),
  };
};

const issueKatboxToken = (user: any) => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) throw new Error("JWT_SECRET_MISSING");
  return jwt.sign(
    { userId: user._id, _id: user._id, id: user._id },
    jwtSecret,
    { expiresIn: "30d" }
  );
};

/**
 * POST /auth/chef/clerk-login
 * Standalone Chef app Google sign-in.
 *
 * IMPORTANT: This is deliberately separate from /auth/clerk-login.
 * Client/Admin OTP and Google authentication behavior is not changed.
 * The Clerk session token is verified server-side; email and Clerk ID
 * are never trusted from the request body.
 */
router.post("/chef/clerk-login", async (req, res) => {
  try {
    const normalizedPhone = normalizeIndianPhone(
      typeof req.body?.phone === "string" ? req.body.phone : ""
    );
    const suppliedName =
      typeof req.body?.name === "string"
        ? req.body.name.trim().slice(0, 80)
        : "";

    if (!normalizedPhone) {
      return res.status(400).json({
        code: "PHONE_REQUIRED",
        message: "Enter a valid Indian mobile number.",
      });
    }

    let identity: { clerkId: string; email: string; name: string };
    try {
      identity = await getVerifiedClerkIdentity(req);
    } catch (error: any) {
      const code = error?.message || "INVALID_CLERK_SESSION";
      const status = code === "CLERK_SECRET_KEY_MISSING" ? 500 : 401;
      return res.status(status).json({
        code,
        message:
          status === 500
            ? "Authentication configuration is incomplete."
            : "Your Google sign-in session could not be verified. Please sign in again.",
      });
    }

    const { clerkId, email } = identity;
    const cleanName = suppliedName || identity.name || "User";

    const [phoneUser, emailUser, clerkUser] = await Promise.all([
      User.findOne({ phone: normalizedPhone }),
      User.findOne({ email }),
      User.findOne({ clerkId }),
    ]);

    // A phone number already associated with a different Google identity
    // must never be silently reassigned by the Chef app.
    if (phoneUser) {
      const existingEmail = normalizeEmail(phoneUser.email);
      if (!existingEmail || existingEmail !== email) {
        return res.status(409).json({
          code: "PHONE_ACCOUNT_LINK_REQUIRED",
          message:
            "This mobile number is already associated with a KatBox account. Sign in using its registered Google account or contact support.",
        });
      }
      if (phoneUser.clerkId && phoneUser.clerkId !== clerkId) {
        return res.status(409).json({
          code: "CLERK_ACCOUNT_MISMATCH",
          message:
            "This KatBox account is already linked to a different Google account.",
        });
      }
    }

    if (
      emailUser &&
      String(emailUser.phone || "") &&
      emailUser.phone !== normalizedPhone
    ) {
      return res.status(409).json({
        code: "EMAIL_ALREADY_USED",
        message:
          "This Google email is already linked to another mobile number.",
      });
    }

    if (
      clerkUser &&
      String(clerkUser.phone || "") &&
      clerkUser.phone !== normalizedPhone
    ) {
      return res.status(409).json({
        code: "CLERK_ACCOUNT_ALREADY_LINKED",
        message:
          "This Google account is already linked to another mobile number.",
      });
    }

    if (
      emailUser &&
      phoneUser &&
      String(emailUser._id) !== String(phoneUser._id)
    ) {
      return res.status(409).json({
        code: "ACCOUNT_LINK_CONFLICT",
        message:
          "These Google and mobile details belong to different KatBox accounts. Contact support.",
      });
    }

    if (
      clerkUser &&
      phoneUser &&
      String(clerkUser._id) !== String(phoneUser._id)
    ) {
      return res.status(409).json({
        code: "ACCOUNT_LINK_CONFLICT",
        message:
          "These sign-in details belong to different KatBox accounts. Contact support.",
      });
    }

    let user: any = phoneUser || emailUser || clerkUser;

    if (!user) {
      // New accounts are ordinary KatBox users. Chef access is granted only
      // by the existing admin-controlled isChef flag; it is never set here.
      user = await User.create({
        phone: normalizedPhone,
        name: cleanName,
        email,
        clerkId,
        savedAddresses: [],
        activeAddress: null,
        address: "",
      });
    } else {
      if (user.phone && user.phone !== normalizedPhone) {
        return res.status(409).json({
          code: "PHONE_MISMATCH",
          message:
            "This Google account is already linked to another mobile number.",
        });
      }
      user.phone = normalizedPhone;
      if (!normalizeEmail(user.email)) user.email = email;
      if (!user.clerkId) user.clerkId = clerkId;
      if (
        (!user.name || user.name.trim().toLowerCase() === "user") &&
        cleanName
      ) {
        user.name = cleanName;
      }
      await user.save();
    }

    const token = issueKatboxToken(user);
    return res.status(200).json({
      success: true,
      token,
      user: buildUserResponse(user),
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.status(409).json({
        code: "ACCOUNT_LINK_CONFLICT",
        message:
          "This account was linked in another request. Please sign in again.",
      });
    }
    console.error(
      "Chef Google login synchronization failed:",
      error?.code || error?.message || error
    );
    return res.status(500).json({
      code: "CHEF_GOOGLE_LOGIN_FAILED",
      message: "Unable to complete Google sign-in. Please try again.",
    });
  }
});

/**
 * POST /auth/clerk-login
 * Existing linked Google account: log in immediately.
 * New Google registration or OTP-only account: send phone OTP and return
 * a short-lived, signed challenge. MongoDB is not changed until OTP passes.
 */
router.post("/clerk-login", async (req, res) => {
  try {
    const phone = typeof req.body?.phone === "string" ? req.body.phone : "";
    const normalizedPhone = normalizeIndianPhone(phone);
    const suppliedName = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 80) : "";

    if (!normalizedPhone) {
      return res.status(400).json({ code: "PHONE_REQUIRED", message: "Enter a valid Indian mobile number." });
    }
    if (!twilioClient || !verifyServiceSid) {
      return res.status(503).json({ code: "OTP_SERVICE_UNAVAILABLE", message: "OTP service is temporarily unavailable." });
    }

    let identity: { clerkId: string; email: string; name: string };
    try {
      identity = await getVerifiedClerkIdentity(req);
    } catch (error: any) {
      const code = error?.message || "INVALID_CLERK_SESSION";
      const status = code === "CLERK_SECRET_KEY_MISSING" ? 500 : 401;
      return res.status(status).json({
        code,
        message: status === 500 ? "Authentication configuration is incomplete." : "Your Google sign-in session could not be verified. Please sign in again.",
      });
    }

    const { clerkId, email } = identity;
    const cleanName = suppliedName || identity.name || "User";
    const phoneUser = await User.findOne({ phone: normalizedPhone });
    const emailUser = await User.findOne({ email });
    const clerkUser = await User.findOne({ clerkId });

    if (emailUser && String(emailUser.phone || "") && emailUser.phone !== normalizedPhone) {
      return res.status(409).json({ code: "EMAIL_ALREADY_USED", message: "This Google email is already linked to another mobile number." });
    }
    if (clerkUser && String(clerkUser.phone || "") && clerkUser.phone !== normalizedPhone) {
      return res.status(409).json({ code: "CLERK_ACCOUNT_ALREADY_LINKED", message: "This Google account is already linked to another mobile number." });
    }
    if (phoneUser) {
      const existingEmail = normalizeEmail(phoneUser.email);
      if (existingEmail && existingEmail !== email) {
        return res.status(409).json({
          code: "EMAIL_MISMATCH",
          message: "This mobile number is already registered with a different Google email.",
          registeredEmail: existingEmail,
        });
      }
      if (phoneUser.clerkId && phoneUser.clerkId !== clerkId) {
        return res.status(409).json({ code: "CLERK_ACCOUNT_MISMATCH", message: "This KatBox account is already linked to a different Google account." });
      }
      // A previously linked email is sufficient to recover the same Clerk ID.
      // An OTP-only account has no email and must prove phone ownership first.
      if (existingEmail === email && !phoneUser.clerkId) {
        phoneUser.clerkId = clerkId;
        await phoneUser.save();
        const token = issueKatboxToken(phoneUser);
        return res.status(200).json({ success: true, token, user: buildUserResponse(phoneUser) });
      }
      if (existingEmail === email && phoneUser.clerkId === clerkId) {
        const token = issueKatboxToken(phoneUser);
        return res.status(200).json({ success: true, token, user: buildUserResponse(phoneUser) });
      }
    }

    const throttle = canSendOtp(normalizedPhone);
    if (!throttle.allowed) {
      const retryAfterSeconds = throttle.retryAfterSeconds || 1;
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({ code: "OTP_RATE_LIMITED", message: "Please wait before requesting another OTP.", retryAfterSeconds });
    }

    const verification = await twilioClient.verify.v2.services(verifyServiceSid).verifications.create({
      to: normalizedPhone,
      channel: "sms",
    });
    if (verification.status !== "pending") {
      return res.status(502).json({ code: "OTP_SEND_FAILED", message: "Unable to send OTP. Please try again." });
    }
    recordOtpSend(normalizedPhone);

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return res.status(500).json({ code: "JWT_SECRET_MISSING", message: "Server authentication configuration is incomplete." });
    const challengeToken = jwt.sign(
      { purpose: "google_phone_link", phone: normalizedPhone, email, clerkId, name: cleanName },
      jwtSecret,
      { expiresIn: "10m" }
    );

    return res.status(200).json({
      success: true,
      requiresPhoneVerification: true,
      challengeToken,
      phone: normalizedPhone,
      message: "We sent an OTP to verify your mobile number.",
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.status(409).json({ code: "ACCOUNT_ALREADY_EXISTS", message: "This account is already linked. Please sign in with your registered details." });
    }
    console.error("Google login synchronization failed:", error?.message || error);
    return res.status(500).json({ code: "GOOGLE_LOGIN_FAILED", message: "Unable to complete Google sign-in. Please try again." });
  }
});

/*
 * ============================================================
 * LOOKUP EMAIL FOR MOBILE
 * ============================================================
 *
 * Used by the login screen to remember/recommend the Google
 * account associated with a mobile number.
 *
 * Example:
 *
 * GET /auth/lookup-phone?phone=+919133450555
 *
 * Response:
 *
 * {
 *   registered: true,
 *   email: "nithinkunchala2431@gmail.com"
 * }
 *
 * Or:
 *
 * {
 *   registered: false
 * }
 *
 * IMPORTANT:
 * This endpoint intentionally returns only the registration
 * status and email. It does NOT return the user's name,
 * address, role, MongoDB ID, etc.
 *
 * ============================================================
 */

router.get(
  "/lookup-phone",
  async (req, res) => {
    try {
      const phone =
        typeof req.query.phone === "string"
          ? req.query.phone
          : "";

      if (!phone) {
        return res.status(400).json({
          message:
            "Mobile number is required.",
        });
      }

      const normalizedPhone =
        normalizeIndianPhone(phone);

      if (!normalizedPhone) {
        return res.status(400).json({
          message:
            "Invalid mobile number.",
        });
      }

      const user =
        await User.findOne({
          phone: normalizedPhone,
        }).select("email");

      /*
       * No account registered with this mobile.
       */
      if (!user) {
        return res.json({
          registered: false,
        });
      }

      const email =
        normalizeEmail(user.email);

      /*
       * User exists but has no email yet.
       */
      if (!email) {
        return res.json({
          registered: true,
          email: "",
        });
      }

      return res.json({
        registered: true,
        email,
      });
    } catch (error: any) {
      console.error(
        "❌ Phone lookup error:",
        error?.message || error
      );

      return res.status(500).json({
        message:
          "Unable to check mobile registration.",
      });
    }
  }
);

/*
 * ============================================================
 * SEND OTP VIA TWILIO VERIFY API v2
 * ============================================================
 *
 * POST /auth/send-otp
 *
 * The client sends { phone, name? }. The name is used only if a
 * new MongoDB user is created after successful OTP verification.
 * Existing account details are never overwritten by OTP login.
 */

router.post("/send-otp", async (req, res) => {
  try {
    const phone =
      typeof req.body?.phone === "string"
        ? req.body.phone
        : "";

    if (!phone.trim()) {
      return res.status(400).json({
        code: "PHONE_REQUIRED",
        message: "Mobile number is required.",
      });
    }

    const normalizedPhone = normalizeIndianPhone(phone);

    if (!normalizedPhone) {
      return res.status(400).json({
        code: "INVALID_PHONE",
        message: "Please enter a valid Indian mobile number.",
      });
    }

    if (!twilioClient || !verifyServiceSid) {
      console.error(
        "❌ Twilio Verify is not configured. Check backend environment variables."
      );

      return res.status(503).json({
        code: "OTP_SERVICE_UNAVAILABLE",
        message: "OTP service is temporarily unavailable. Please try again later.",
      });
    }

    const throttle = canSendOtp(normalizedPhone);

    if (!throttle.allowed) {
      const retryAfterSeconds = throttle.retryAfterSeconds || 1;

      // Let HTTP clients know when the local KatBox cooldown expires.
      res.setHeader("Retry-After", String(retryAfterSeconds));

      return res.status(429).json({
        code: "OTP_RATE_LIMITED",
        source: "KATBOX",
        message: "Please wait before requesting another OTP.",
        retryAfterSeconds,
      });
    }

    const verification = await twilioClient.verify.v2
      .services(verifyServiceSid)
      .verifications.create({
        to: normalizedPhone,
        channel: "sms",
      });

    if (verification.status !== "pending") {
      console.error(
        "Twilio returned an unexpected verification status:",
        verification.status
      );

      return res.status(502).json({
        code: "OTP_SEND_FAILED",
        message: "Unable to send OTP. Please try again.",
      });
    }

    recordOtpSend(normalizedPhone);

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully.",
    });
  } catch (error: any) {
    // Log Twilio's diagnostic fields so a rejected request can be
    // distinguished from KatBox's own local rate limiter.
    // Never log the OTP, Auth Token, or other credentials.
    console.error("❌ Twilio send-otp error:", {
      code: error?.code,
      status: error?.status,
      message: error?.message,
      moreInfo: error?.moreInfo,
    });

    if (error?.code === 60200 || error?.status === 400) {
      return res.status(400).json({
        code: "INVALID_PHONE",
        source: "TWILIO",
        message: "The mobile number is invalid or cannot receive SMS.",
      });
    }

    // 60203 is Twilio Verify's maximum-send-attempts error.
    // 20429 is Twilio's API rate-limit response. A generic HTTP 429
    // from Twilio is also reported separately from KatBox's throttle.
    if (
      error?.code === 60203 ||
      error?.code === 20429 ||
      error?.status === 429
    ) {
      return res.status(429).json({
        code: "TWILIO_RATE_LIMITED",
        source: "TWILIO",
        message:
          "Twilio has temporarily limited OTP requests for this number. Please wait before trying again.",
      });
    }

    if (error?.code === 20404) {
      return res.status(503).json({
        code: "TWILIO_SERVICE_NOT_FOUND",
        source: "TWILIO",
        message: "OTP service configuration is invalid. Please contact support.",
      });
    }

    return res.status(502).json({
      code: "OTP_SEND_FAILED",
      source: "TWILIO",
      message: "Unable to send OTP. Please try again later.",
    });
  }
});

/*
 * ============================================================
 * VERIFY OTP VIA TWILIO VERIFY
 * ============================================================
 *
 * POST /auth/verify-otp
 *
 * Existing phone:
 *   - Authenticate the existing MongoDB user.
 *   - Do not modify Google email, Clerk ID, name, addresses,
 *     isChef, isAdmin, or order history.
 *
 * New phone:
 *   - Create one phone-based user after Twilio approves the code.
 *   - A later Google login can establish the Google email.
 *
 * The JWT response matches the existing Clerk login response.
 */

router.post("/verify-otp", async (req, res) => {
  try {
    const phone =
      typeof req.body?.phone === "string"
        ? req.body.phone
        : "";

    const otp =
      typeof req.body?.otp === "string"
        ? req.body.otp.trim()
        : "";

    const suppliedName =
      typeof req.body?.name === "string"
        ? req.body.name.trim()
        : "";

    if (!phone.trim() || !otp) {
      return res.status(400).json({
        code: "PHONE_AND_OTP_REQUIRED",
        message: "Mobile number and OTP are required.",
      });
    }

    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        code: "INVALID_OTP_FORMAT",
        message: "Please enter the 6-digit OTP.",
      });
    }

    const normalizedPhone = normalizeIndianPhone(phone);

    if (!normalizedPhone) {
      return res.status(400).json({
        code: "INVALID_PHONE",
        message: "Please enter a valid Indian mobile number.",
      });
    }

    if (!twilioClient || !verifyServiceSid) {
      console.error(
        "❌ Twilio Verify is not configured. Check backend environment variables."
      );

      return res.status(503).json({
        code: "OTP_SERVICE_UNAVAILABLE",
        message: "OTP service is temporarily unavailable. Please try again later.",
      });
    }

    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      console.error("❌ JWT_SECRET is missing from backend environment variables.");

      return res.status(500).json({
        code: "JWT_SECRET_MISSING",
        message: "Server authentication configuration is incomplete.",
      });
    }

    const verificationCheck = await twilioClient.verify.v2
      .services(verifyServiceSid)
      .verificationChecks.create({
        to: normalizedPhone,
        code: otp,
      });

    if (verificationCheck.status !== "approved") {
      return res.status(400).json({
        code: "OTP_NOT_APPROVED",
        message: "Invalid OTP or verification expired. Please try again.",
      });
    }

    // Always resolve by normalized phone before considering account creation.
    let user = await User.findOne({
      phone: normalizedPhone,
    });

    if (!user) {
      const safeName =
        suppliedName.length > 0
          ? suppliedName.slice(0, 80)
          : "User";

      try {
        user = await User.create({
          phone: normalizedPhone,
          name: safeName,
          // Do not invent or populate a Google email during OTP login.
          email: "",
          savedAddresses: [],
          activeAddress: null,
          address: "",
        });
      } catch (createError: any) {
        // A concurrent request may have created the same phone after
        // the initial lookup. Re-read instead of creating a second user.
        if (createError?.code === 11000) {
          user = await User.findOne({
            phone: normalizedPhone,
          });
        } else {
          throw createError;
        }
      }

      if (!user) {
        return res.status(409).json({
          code: "ACCOUNT_CREATION_CONFLICT",
          message: "Unable to create your account. Please try again.",
        });
      }

      console.log(
        `✨ Created phone-authenticated KatBox user: ${user._id}`
      );
    }

    // Existing users are intentionally not modified here. In particular,
    // their Google email, Clerk ID, role flags and profile data remain intact.

    const token = jwt.sign(
      {
        userId: user._id,
        _id: user._id,
        id: user._id,
      },
      jwtSecret,
      {
        expiresIn: "30d",
      }
    );

    return res.status(200).json({
      success: true,
      token,
      user: buildUserResponse(user),
    });
  } catch (error: any) {
    console.error(
      "❌ Twilio verify-otp error:",
      error?.code || error?.message || error
    );

    if (
      error?.code === 20404 ||
      error?.status === 404
    ) {
      return res.status(400).json({
        code: "OTP_EXPIRED_OR_NOT_FOUND",
        message: "OTP expired or not found. Please request a new OTP.",
      });
    }

    if (
      error?.code === 60200 ||
      error?.status === 400
    ) {
      return res.status(400).json({
        code: "OTP_VERIFICATION_FAILED",
        message: "Invalid OTP or verification expired.",
      });
    }

    if (
      error?.code === 60202 ||
      error?.code === 60203 ||
      error?.status === 429
    ) {
      return res.status(429).json({
        code: "OTP_ATTEMPTS_LIMITED",
        message: "Too many verification attempts. Please request a new OTP later.",
      });
    }

    return res.status(500).json({
      code: "OTP_VERIFICATION_ERROR",
      message: "Verification failed. Please request a new OTP.",
    });
  }
});

/**
 * POST /auth/verify-google-otp
 * Verifies the short-lived challenge and Twilio OTP, then creates or links
 * exactly one MongoDB account. Client-supplied email/Clerk ID are ignored.
 */
router.post("/verify-google-otp", async (req, res) => {
  try {
    const challengeToken = typeof req.body?.challengeToken === "string" ? req.body.challengeToken : "";
    const otp = typeof req.body?.otp === "string" ? req.body.otp.trim() : "";
    if (!challengeToken || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ code: "INVALID_GOOGLE_OTP_REQUEST", message: "A valid verification code is required." });
    }
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret || !twilioClient || !verifyServiceSid) {
      return res.status(503).json({ code: "AUTH_SERVICE_UNAVAILABLE", message: "Verification is temporarily unavailable." });
    }

    let challenge: any;
    try {
      challenge = jwt.verify(challengeToken, jwtSecret);
    } catch {
      return res.status(401).json({ code: "GOOGLE_LINK_CHALLENGE_EXPIRED", message: "This verification session expired. Please start Google sign-in again." });
    }
    if (challenge?.purpose !== "google_phone_link" || !challenge.phone || !challenge.email || !challenge.clerkId) {
      return res.status(401).json({ code: "INVALID_GOOGLE_LINK_CHALLENGE", message: "Please restart Google sign-in." });
    }

    const verificationCheck = await twilioClient.verify.v2.services(verifyServiceSid).verificationChecks.create({
      to: challenge.phone,
      code: otp,
    });
    if (verificationCheck.status !== "approved") {
      return res.status(400).json({ code: "OTP_NOT_APPROVED", message: "Invalid OTP or verification expired. Please try again." });
    }

    const normalizedEmail = normalizeEmail(challenge.email);
    const normalizedPhone = normalizeIndianPhone(challenge.phone);
    if (!normalizedEmail || !normalizedPhone) {
      return res.status(400).json({ code: "INVALID_GOOGLE_LINK_CHALLENGE", message: "Please restart Google sign-in." });
    }

    const [phoneUser, emailUser, clerkUser] = await Promise.all([
      User.findOne({ phone: normalizedPhone }),
      User.findOne({ email: normalizedEmail }),
      User.findOne({ clerkId: challenge.clerkId }),
    ]);

    if (emailUser && String(emailUser.phone || "") && emailUser.phone !== normalizedPhone) {
      return res.status(409).json({ code: "EMAIL_ALREADY_USED", message: "This Google email is already linked to another mobile number." });
    }
    if (clerkUser && String(clerkUser.phone || "") && clerkUser.phone !== normalizedPhone) {
      return res.status(409).json({ code: "CLERK_ACCOUNT_ALREADY_LINKED", message: "This Google account is already linked to another mobile number." });
    }
    if (phoneUser && normalizeEmail(phoneUser.email) && normalizeEmail(phoneUser.email) !== normalizedEmail) {
      return res.status(409).json({ code: "EMAIL_MISMATCH", message: "This mobile number is already registered with a different Google email." });
    }
    if (phoneUser && phoneUser.clerkId && phoneUser.clerkId !== challenge.clerkId) {
      return res.status(409).json({ code: "CLERK_ACCOUNT_MISMATCH", message: "This KatBox account is already linked to a different Google account." });
    }
    if (emailUser && phoneUser && String(emailUser._id) !== String(phoneUser._id)) {
      return res.status(409).json({ code: "ACCOUNT_LINK_CONFLICT", message: "These Google and mobile details belong to different KatBox accounts. Contact support." });
    }
    if (clerkUser && phoneUser && String(clerkUser._id) !== String(phoneUser._id)) {
      return res.status(409).json({ code: "ACCOUNT_LINK_CONFLICT", message: "These sign-in details belong to different KatBox accounts. Contact support." });
    }

    let user = phoneUser || emailUser || clerkUser;
    if (!user) {
      user = await User.create({
        phone: normalizedPhone,
        name: typeof challenge.name === "string" && challenge.name.trim() ? challenge.name.trim().slice(0, 80) : "User",
        email: normalizedEmail,
        clerkId: challenge.clerkId,
        savedAddresses: [],
        activeAddress: null,
        address: "",
      });
    } else {
      user.phone = normalizedPhone;
      if (!normalizeEmail(user.email)) user.email = normalizedEmail;
      if (!user.clerkId) user.clerkId = challenge.clerkId;
      if ((!user.name || user.name.trim().toLowerCase() === "user") && challenge.name) user.name = String(challenge.name).trim().slice(0, 80);
      await user.save();
    }

    const token = issueKatboxToken(user);
    return res.status(200).json({ success: true, token, user: buildUserResponse(user) });
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.status(409).json({ code: "ACCOUNT_LINK_CONFLICT", message: "This account was linked in another request. Please sign in again." });
    }
    console.error("Google phone verification failed:", error?.code || error?.message || error);
    if (error?.code === 20404 || error?.status === 404) {
      return res.status(400).json({ code: "OTP_EXPIRED_OR_NOT_FOUND", message: "OTP expired or not found. Please request a new OTP." });
    }
    if (error?.code === 60200 || error?.status === 400) {
      return res.status(400).json({ code: "OTP_VERIFICATION_FAILED", message: "Invalid OTP or verification expired." });
    }
    return res.status(500).json({ code: "GOOGLE_PHONE_VERIFICATION_FAILED", message: "Unable to verify your mobile number. Please try again." });
  }
});

/*
 * ============================================================
 * GET CURRENT USER
 * ============================================================
 */

router.get(
  "/me",
  protect,
  async (
    req: AuthRequest,
    res
  ) => {
    try {
      const userId =
        req.user?.userId ||
        req.user?._id ||
        req.user?.id;

      if (!userId) {
        return res.status(401).json({
          message: "Unauthorized",
        });
      }

      const user =
        await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          message:
            "User not found",
        });
      }

      return res.json({
        user: buildUserResponse(user),
      });
    } catch (error) {
      console.error(
        "❌ Error fetching current user:",
        error
      );

      return res.status(500).json({
        message:
          "Server error fetching user",
      });
    }
  }
);

/*
 * ============================================================
 * DELETE CURRENT USER ACCOUNT
 * ============================================================
 *
 * DELETE /auth/delete-account
 *
 * The authenticated JWT determines which account is deleted.
 * The client cannot supply another user's ID.
 */
router.delete(
  "/delete-account",
  protect,
  async (req: AuthRequest, res) => {
    try {
      const userId =
        req.user?.userId ||
        req.user?._id ||
        req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
      }

      const deletedUser = await User.findByIdAndDelete(userId);

      if (!deletedUser) {
        return res.status(404).json({
          success: false,
          message: "Account not found or already deleted",
        });
      }

      console.log(
        `🗑️ Katbox account deleted: ${deletedUser._id}`
      );

      return res.status(200).json({
        success: true,
        message: "Your Katbox account has been deleted successfully.",
      });
    } catch (error: any) {
      console.error(
        "❌ Account deletion error:",
        error?.message || error
      );

      return res.status(500).json({
        success: false,
        message: "Unable to delete your account right now. Please try again.",
      });
    }
  }
);

/*
 * ============================================================
 * UPDATE USER PROFILE
 * ============================================================
 *
 * IMPORTANT:
 *
 * `email` is intentionally NOT allowed to be changed here.
 *
 * Why?
 *
 * Our authentication rule is:
 *
 *   mobile -> one Google email
 *
 * If profile code could freely change `email`, the user could
 * bypass the mobile/email protection.
 *
 * Google email should only be established/verified through
 * /clerk-login.
 *
 * ============================================================
 */

router.patch(
  "/update-profile",
  protect,
  async (
    req: AuthRequest,
    res
  ) => {
    try {
      const userId =
        req.user?.userId ||
        req.user?._id ||
        req.user?.id;

      if (!userId) {
        return res.status(401).json({
          message:
            "Unauthorized - User ID not found in token",
        });
      }

      const {
        name,
        address,
        savedAddresses,
        activeAddress,
        pushToken,
        pushRole,
      } = req.body;

      const updateFields: any = {};

      /*
       * Email is deliberately ignored.
       *
       * Do not allow:
       *
       * update-profile({ email: "new@gmail.com" })
       *
       * to change the registered Google account.
       */

      if (name !== undefined) {
        updateFields.name =
          typeof name === "string"
            ? name.trim()
            : name;
      }

      if (pushToken !== undefined) {
        const normalizedPushToken =
          typeof pushToken === "string" ? pushToken.trim() : "";

        if (normalizedPushToken) {
          // Role is derived from the persisted MongoDB account, not trusted
          // from the client. A standalone Chef app can therefore never
          // overwrite the customer/admin app's token.
          const tokenOwner: any = await User.findById(userId).select("isAdmin isChef");
          const requestedRole = String(pushRole || "").toLowerCase();
          const allowedRole =
            requestedRole === "admin" ? tokenOwner?.isAdmin === true :
            requestedRole === "chef" ? tokenOwner?.isChef === true :
            requestedRole === "customer" ? tokenOwner?.isAdmin !== true && tokenOwner?.isChef !== true : false;

          if (!tokenOwner || !allowedRole) {
            return res.status(403).json({
              success: false,
              message: "The requested notification app role is not enabled for this account.",
            });
          }

          const tokenField = `${requestedRole}PushToken`;
          updateFields[tokenField] = normalizedPushToken;
          // Keep the legacy token populated for old app builds while new
          // server senders prefer the role-specific fields.
          updateFields.pushToken = normalizedPushToken;
        }
      }

      /*
       * --------------------------------------------------------
       * ACTIVE ADDRESS
       * --------------------------------------------------------
       */

      if (
        activeAddress !== undefined &&
        activeAddress !== null
      ) {
        const aa: IActiveAddress = {
          id:
            activeAddress.id ||
            `active_${Date.now()}`,

          title:
            activeAddress.title ||
            "Current Location",

          houseDetails:
            activeAddress.houseDetails ||
            "",

          fullAddress:
            activeAddress.fullAddress ||
            "",

          latitude:
            typeof activeAddress.latitude ===
            "number"
              ? activeAddress.latitude
              : 0,

          longitude:
            typeof activeAddress.longitude ===
            "number"
              ? activeAddress.longitude
              : 0,

          tag:
            activeAddress.tag ||
            "Home",

          updatedAt: new Date(),
        };

        updateFields.activeAddress =
          aa;

        const combined =
          aa.houseDetails &&
          aa.houseDetails.trim().length > 0
            ? `${aa.houseDetails}, ${aa.fullAddress}`
            : aa.fullAddress;

        updateFields.address =
          combined || "";
      } else if (
        address !== undefined
      ) {
        updateFields.address =
          typeof address === "string"
            ? address.trim()
            : address;
      }

      /*
       * --------------------------------------------------------
       * SAVED ADDRESSES
       * --------------------------------------------------------
       */

      if (
        Array.isArray(savedAddresses)
      ) {
        const uniqueAddresses: ISavedAddress[] =
          [];

        const seen =
          new Set<string>();

        for (
          const addr of savedAddresses
        ) {
          if (
            !addr ||
            !addr.fullAddress
          ) {
            continue;
          }

          const normalizedKey =
            `${(
              addr.houseDetails ||
              ""
            )
              .trim()
              .toLowerCase()}_${addr.fullAddress
              .trim()
              .toLowerCase()}`;

          if (
            !seen.has(normalizedKey)
          ) {
            seen.add(normalizedKey);

            uniqueAddresses.push({
              id:
                addr.id ||
                `addr_${Date.now()}_${Math.random()
                  .toString(36)
                  .substring(2, 7)}`,

              title:
                addr.title ||
                "Home",

              houseDetails:
                addr.houseDetails ||
                "",

              fullAddress:
                addr.fullAddress,

              latitude:
                addr.latitude || 0,

              longitude:
                addr.longitude || 0,

              tag:
                addr.tag ||
                "Home",

              createdAt:
                addr.createdAt
                  ? new Date(
                      addr.createdAt
                    )
                  : new Date(),
            });
          }
        }

        updateFields.savedAddresses =
          uniqueAddresses;
      }

      /*
       * --------------------------------------------------------
       * UPDATE MONGODB
       * --------------------------------------------------------
       */

      const updatedUser =
        await User.findByIdAndUpdate(
          userId,
          {
            $set: updateFields,
          },
          {
            new: true,
            runValidators: true,
          }
        );

      if (!updatedUser) {
        return res.status(404).json({
          message:
            "User not found",
        });
      }

      return res.json({
        success: true,
        message:
          "Profile and addresses updated successfully in MongoDB",
        user:
          buildUserResponse(
            updatedUser
          ),
      });
    } catch (err: any) {
      console.error(
        "❌ Error updating profile:",
        err
      );

      return res.status(500).json({
        message:
          "Error updating profile",
        error: err.message,
      });
    }
  }
);


/*
 * ============================================================
 * UPDATE ACTIVE ADDRESS
 * ============================================================
 *
 * The mobile app's authStorage.ts calls:
 *
 *   PATCH /auth/update-address
 *
 * Keep this endpoint separate from update-profile so existing
 * address-sync logic continues to work without changing the app.
 *
 * Authentication is handled by the same `protect` middleware
 * used by /me and /update-profile.
 *
 * ✅ PATCH (this update):
 *
 *   The handler now ALSO accepts a `savedAddresses` array —
 *   matching the behaviour of /update-profile exactly. This
 *   means any older client that still targets /update-address
 *   can push the full saved-address list here and it will land
 *   in MongoDB unchanged.
 *
 *   When the client sends only { activeAddress } (address
 *   selection), the existing savedAddresses array on the user
 *   document is left completely untouched.
 *
 * ============================================================
 */

router.patch(
  "/update-address",
  protect,
  async (
    req: AuthRequest,
    res
  ) => {
    try {
      const userId =
        req.user?.userId ||
        req.user?._id ||
        req.user?.id;

      if (!userId) {
        return res.status(401).json({
          message:
            "Unauthorized - User ID not found in token",
        });
      }

      const {
        activeAddress,
        address,
        savedAddresses,
      } = req.body;

      const updateFields: any = {};

      /*
       * --------------------------------------------------------
       * ACTIVE ADDRESS
       * --------------------------------------------------------
       *
       * Home.tsx sends the GPS location as activeAddress.
       * Normalize it to the same structure used by
       * /update-profile.
       */

      if (
        activeAddress !== undefined &&
        activeAddress !== null
      ) {
        const aa: IActiveAddress = {
          id:
            activeAddress.id ||
            `active_${Date.now()}`,

          title:
            activeAddress.title ||
            "Current Location",

          houseDetails:
            activeAddress.houseDetails ||
            "",

          fullAddress:
            activeAddress.fullAddress ||
            "",

          latitude:
            typeof activeAddress.latitude ===
            "number"
              ? activeAddress.latitude
              : 0,

          longitude:
            typeof activeAddress.longitude ===
            "number"
              ? activeAddress.longitude
              : 0,

          tag:
            activeAddress.tag ||
            "Home",

          updatedAt: new Date(),
        };

        updateFields.activeAddress =
          aa;

        /*
         * Keep the legacy `address` field synchronized
         * with the active address.
         */
        const combined =
          aa.houseDetails &&
          aa.houseDetails.trim().length > 0
            ? `${aa.houseDetails}, ${aa.fullAddress}`
            : aa.fullAddress;

        updateFields.address =
          combined || "";
      } else if (
        address !== undefined
      ) {
        updateFields.address =
          typeof address === "string"
            ? address.trim()
            : address;
      }

      /*
       * --------------------------------------------------------
       * SAVED ADDRESSES (NEW — parity with /update-profile)
       * --------------------------------------------------------
       *
       * Deduped by houseDetails + fullAddress so repeated taps
       * on "Save address" never create duplicates in MongoDB.
       *
       * When omitted from the payload, we simply do NOT touch
       * the existing savedAddresses array — so selecting a
       * different active address does not wipe the saved list.
       */

      if (
        Array.isArray(savedAddresses)
      ) {
        const uniqueAddresses: ISavedAddress[] =
          [];

        const seen =
          new Set<string>();

        for (
          const addr of savedAddresses
        ) {
          if (
            !addr ||
            !addr.fullAddress
          ) {
            continue;
          }

          const normalizedKey =
            `${(
              addr.houseDetails ||
              ""
            )
              .trim()
              .toLowerCase()}_${addr.fullAddress
              .trim()
              .toLowerCase()}`;

          if (
            !seen.has(normalizedKey)
          ) {
            seen.add(normalizedKey);

            uniqueAddresses.push({
              id:
                addr.id ||
                `addr_${Date.now()}_${Math.random()
                  .toString(36)
                  .substring(2, 7)}`,

              title:
                addr.title ||
                "Home",

              houseDetails:
                addr.houseDetails ||
                "",

              fullAddress:
                addr.fullAddress,

              latitude:
                typeof addr.latitude === "number"
                  ? addr.latitude
                  : 0,

              longitude:
                typeof addr.longitude === "number"
                  ? addr.longitude
                  : 0,

              tag:
                addr.tag ||
                "Home",

              createdAt:
                addr.createdAt
                  ? new Date(
                      addr.createdAt
                    )
                  : new Date(),
            });
          }
        }

        updateFields.savedAddresses =
          uniqueAddresses;
      }

      /*
       * --------------------------------------------------------
       * UPDATE MONGODB
       * --------------------------------------------------------
       */

      const updatedUser =
        await User.findByIdAndUpdate(
          userId,
          {
            $set: updateFields,
          },
          {
            new: true,
            runValidators: true,
          }
        );

      if (!updatedUser) {
        return res.status(404).json({
          message:
            "User not found",
        });
      }

      console.log(
        `📍 Address updated successfully for user '${updatedUser.name}'`
      );

      return res.json({
        success: true,
        message:
          "Address updated successfully in MongoDB",
        user:
          buildUserResponse(
            updatedUser
          ),
      });
    } catch (err: any) {
      console.error(
        "❌ Error updating address:",
        err
      );

      return res.status(500).json({
        message:
          "Error updating address",
        error:
          err?.message ||
          "Unknown error",
      });
    }
  }
);

/*
 * ============================================================
 * PUT UPDATE USER PROFILE
 * ============================================================
 *
 * Same functionality as PATCH.
 *
 * Email is deliberately excluded from updateFields.
 *
 * ============================================================
 */

router.put(
  "/update-profile",
  protect,
  async (
    req: AuthRequest,
    res
  ) => {
    try {
      const userId =
        req.user?.userId ||
        req.user?._id ||
        req.user?.id;

      if (!userId) {
        return res.status(401).json({
          message:
            "Unauthorized - User ID not found in token",
        });
      }

      const {
        name,
        address,
        savedAddresses,
        activeAddress,
        pushToken,
        pushRole,
      } = req.body;

      const updateFields: any = {};

      /*
       * IMPORTANT:
       *
       * Do NOT accept email here.
       *
       * Google email is controlled by Clerk authentication.
       */

      if (name !== undefined) {
        updateFields.name =
          typeof name === "string"
            ? name.trim()
            : name;
      }

      if (pushToken !== undefined) {
        const normalizedPushToken =
          typeof pushToken === "string" ? pushToken.trim() : "";

        if (normalizedPushToken) {
          // Role is derived from the persisted MongoDB account, not trusted
          // from the client. A standalone Chef app can therefore never
          // overwrite the customer/admin app's token.
          const tokenOwner: any = await User.findById(userId).select("isAdmin isChef");
          const requestedRole = String(pushRole || "").toLowerCase();
          const allowedRole =
            requestedRole === "admin" ? tokenOwner?.isAdmin === true :
            requestedRole === "chef" ? tokenOwner?.isChef === true :
            requestedRole === "customer" ? tokenOwner?.isAdmin !== true && tokenOwner?.isChef !== true : false;

          if (!tokenOwner || !allowedRole) {
            return res.status(403).json({
              success: false,
              message: "The requested notification app role is not enabled for this account.",
            });
          }

          const tokenField = `${requestedRole}PushToken`;
          updateFields[tokenField] = normalizedPushToken;
          // Keep the legacy token populated for old app builds while new
          // server senders prefer the role-specific fields.
          updateFields.pushToken = normalizedPushToken;
        }
      }

      /*
       * --------------------------------------------------------
       * ACTIVE ADDRESS
       * --------------------------------------------------------
       */

      if (
        activeAddress !== undefined &&
        activeAddress !== null
      ) {
        const aa: IActiveAddress = {
          id:
            activeAddress.id ||
            `active_${Date.now()}`,

          title:
            activeAddress.title ||
            "Current Location",

          houseDetails:
            activeAddress.houseDetails ||
            "",

          fullAddress:
            activeAddress.fullAddress ||
            "",

          latitude:
            typeof activeAddress.latitude ===
            "number"
              ? activeAddress.latitude
              : 0,

          longitude:
            typeof activeAddress.longitude ===
            "number"
              ? activeAddress.longitude
              : 0,

          tag:
            activeAddress.tag ||
            "Home",

          updatedAt: new Date(),
        };

        updateFields.activeAddress =
          aa;

        const combined =
          aa.houseDetails &&
          aa.houseDetails.trim().length > 0
            ? `${aa.houseDetails}, ${aa.fullAddress}`
            : aa.fullAddress;

        updateFields.address =
          combined || "";
      } else if (
        address !== undefined
      ) {
        updateFields.address =
          typeof address === "string"
            ? address.trim()
            : address;
      }

      /*
       * --------------------------------------------------------
       * SAVED ADDRESSES
       * --------------------------------------------------------
       */

      if (
        Array.isArray(savedAddresses)
      ) {
        const uniqueAddresses: ISavedAddress[] =
          [];

        const seen =
          new Set<string>();

        for (
          const addr of savedAddresses
        ) {
          if (
            !addr ||
            !addr.fullAddress
          ) {
            continue;
          }

          const normalizedKey =
            `${(
              addr.houseDetails ||
              ""
            )
              .trim()
              .toLowerCase()}_${addr.fullAddress
              .trim()
              .toLowerCase()}`;

          if (
            !seen.has(normalizedKey)
          ) {
            seen.add(normalizedKey);

            uniqueAddresses.push({
              id:
                addr.id ||
                `addr_${Date.now()}_${Math.random()
                  .toString(36)
                  .substring(2, 7)}`,

              title:
                addr.title ||
                "Home",

              houseDetails:
                addr.houseDetails ||
                "",

              fullAddress:
                addr.fullAddress,

              latitude:
                addr.latitude || 0,

              longitude:
                addr.longitude || 0,

              tag:
                addr.tag ||
                "Home",

              createdAt:
                addr.createdAt
                  ? new Date(
                      addr.createdAt
                    )
                  : new Date(),
            });
          }
        }

        updateFields.savedAddresses =
          uniqueAddresses;
      }

      /*
       * --------------------------------------------------------
       * UPDATE MONGODB
       * --------------------------------------------------------
       */

      const updatedUser =
        await User.findByIdAndUpdate(
          userId,
          {
            $set: updateFields,
          },
          {
            new: true,
            runValidators: true,
          }
        );

      if (!updatedUser) {
        return res.status(404).json({
          message:
            "User not found",
        });
      }

      return res.json({
        success: true,
        message:
          "Profile and addresses updated successfully in MongoDB",
        user:
          buildUserResponse(
            updatedUser
          ),
      });
    } catch (err: any) {
      console.error(
        "❌ Error updating profile:",
        err
      );

      return res.status(500).json({
        message:
          "Error updating profile",
        error: err.message,
      });
    }
  }
);

/*
 * ============================================================
 * ✅ UPDATED: ADMIN — LIST ALL USERS (with order history)
 * ============================================================
 *
 * GET /auth/admin/users
 * GET /auth/users  (legacy alias)
 *
 * NEW (this update):
 *   For every user whose isChef === true, we ALSO look up the
 *   linked Chef document and populate its orderHistory. This
 *   returns the orders that were PLACED TO that user as a chef
 *   (which are stored on Chef.orderHistory, not User.orderHistory).
 *
 * Response shape per user:
 *   {
 *     _id, name, phone, email, isChef, isAdmin, createdAt,
 *
 *     // Orders PLACED by this user (as customer):
 *     orderCount, totalSpent,
 *     orders: [ { orderId, totalAmount, orderStatus,
 *                 serviceType, createdAt } ],
 *
 *     // ✅ NEW — Orders RECEIVED by this user (as chef):
 *     receivedOrderCount, totalEarned,
 *     receivedOrders: [ same shape as orders ],
 *     chefId: <chef._id | null>
 *   }
 * ============================================================
 */
const getAllUsersHandler = async (
  req: AuthRequest,
  res: any
) => {
  try {
    const users = await User.find({})
      .populate({
        path: "orderHistory",
        select:
          "orderId totalAmount orderStatus serviceType createdAt",
        options: { sort: { createdAt: -1 } },
      })
      .sort({ createdAt: -1 })
      .lean();

    /* ─────────────────────────────────────────────────────────
       ✅ NEW: Fetch Chef documents for every chef user in a single
       batched query, then populate their orderHistory too.
       This is the join that makes "received orders" available.
       ───────────────────────────────────────────────────────── */
    const chefUserIds = users
      .filter((u: any) => u?.isChef && u?._id)
      .map((u: any) => u._id);

    const chefDocMap = new Map<string, any>();

    if (chefUserIds.length > 0) {
      const chefDocs = await Chef.find({ user: { $in: chefUserIds } })
        .populate({
          path: "orderHistory",
          select:
            "orderId totalAmount orderStatus serviceType createdAt",
          options: { sort: { createdAt: -1 } },
        })
        .lean();

      chefDocs.forEach((c: any) => {
        if (c?.user) {
          chefDocMap.set(String(c.user), c);
        }
      });
    }

    /* ─────────────────────────────────────────────────────────
       Normalize a raw order document into a minimal payload
       the client can safely render without a second fetch.
       ───────────────────────────────────────────────────────── */
    const normalizeOrder = (o: any) => ({
      _id: o?._id,
      orderId: o?.orderId || "",
      totalAmount: Number(o?.totalAmount) || 0,
      orderStatus: o?.orderStatus || "Placed",
      serviceType: o?.serviceType || "",
      createdAt: o?.createdAt || null,
    });

    const enrichedUsers = users.map((u: any) => {
      // Orders PLACED by this user (as a customer)
      const placedRaw: any[] = Array.isArray(u.orderHistory)
        ? u.orderHistory.filter(Boolean)
        : [];
      const placedOrders = placedRaw.map(normalizeOrder);

      // Orders RECEIVED by this user (as a chef) — only for chefs
      const chefDoc = chefDocMap.get(String(u._id));
      const receivedRaw: any[] =
        chefDoc && Array.isArray(chefDoc.orderHistory)
          ? chefDoc.orderHistory.filter(Boolean)
          : [];
      const receivedOrders = receivedRaw.map(normalizeOrder);

      // Deduplicate (rare case: a chef orders from themselves)
      const placedIds = new Set(placedOrders.map((o: any) => String(o._id)));
      const dedupedReceived = receivedOrders.filter(
        (o: any) => !placedIds.has(String(o._id))
      );

      const totalSpent = placedOrders.reduce(
        (sum, o) => sum + o.totalAmount,
        0
      );
      const totalEarned = dedupedReceived.reduce(
        (sum, o) => sum + o.totalAmount,
        0
      );

      return {
        _id: u._id,
        name: u.name || "User",
        phone: u.phone || "",
        email: u.email || "",
        isChef: !!u.isChef,
        isAdmin: !!u.isAdmin,
        createdAt: u.createdAt,

        // Placed (as customer)
        orderCount: placedOrders.length,
        totalSpent,
        orders: placedOrders,

        // Received (as chef) — zero/empty for non-chef users
        receivedOrderCount: dedupedReceived.length,
        totalEarned,
        receivedOrders: dedupedReceived,

        // Chef profile _id (useful for deep-linking to /admin/all-chefs)
        chefId: chefDoc?._id || null,
      };
    });

    return res.json({
      success: true,
      users: enrichedUsers,
      total: enrichedUsers.length,
    });
  } catch (err: any) {
    console.error("Get all users (admin) error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch users",
    });
  }
};

// Primary admin endpoint
router.get("/admin/users", protect, requireAdmin, getAllUsersHandler);

// Legacy alias — some older client builds hit /auth/users
router.get("/users", protect, requireAdmin, getAllUsersHandler);

/*
 * ============================================================
 * ✅ NEW: ADMIN — TOGGLE USER isChef
 * ============================================================
 *
 * PATCH /auth/admin/users/:userId/toggle-chef
 *
 * Body (optional): { isChef: boolean }
 *   - If provided → force-sets the value (idempotent)
 *   - If omitted  → flips the current value
 *
 * Returns the updated user payload so the client can
 * reconcile with the server without a second round-trip.
 *
 * ⚠️ Cannot toggle the caller's own isChef (safety guard).
 * ============================================================
 */
router.patch(
  "/admin/users/:userId/toggle-chef",
  protect,
  requireAdmin,
  async (req: AuthRequest, res) => {
    try {
      const { userId } = req.params;
      const callerId =
        req.user?.userId || req.user?._id || req.user?.id;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "User ID is required",
        });
      }

      if (String(callerId) === String(userId)) {
        return res.status(400).json({
          success: false,
          message: "You cannot change your own chef status",
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const { isChef: forceValue } = req.body || {};
      const nextIsChef =
        typeof forceValue === "boolean" ? forceValue : !user.isChef;

      user.isChef = nextIsChef;
      await user.save();
      emitChefAccessChanged(String(user._id), nextIsChef);

      console.log(
        `🔐 Admin ${nextIsChef ? "GRANTED" : "REVOKED"} chef status for '${
          user.name
        }' (${user._id})`
      );

      return res.json({
        success: true,
        message: nextIsChef
          ? `Chef access granted to ${user.name}.`
          : `Chef access revoked from ${user.name}.`,
        user: {
          _id: user._id,
          name: user.name,
          phone: user.phone,
          email: user.email,
          isChef: user.isChef,
          isAdmin: user.isAdmin,
        },
      });
    } catch (err: any) {
      console.error("Toggle chef error:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to update chef status",
      });
    }
  }
);

/*
 * ============================================================
 * ✅ NEW: ADMIN — TOGGLE USER isAdmin
 * ============================================================
 *
 * PATCH /auth/admin/users/:userId/toggle-admin
 *
 * ⚠️ Cannot toggle the caller's own isAdmin (safety guard)
 *    → prevents an admin from accidentally locking themselves out.
 * ============================================================
 */
router.patch(
  "/admin/users/:userId/toggle-admin",
  protect,
  requireAdmin,
  async (req: AuthRequest, res) => {
    try {
      const { userId } = req.params;
      const callerId =
        req.user?.userId || req.user?._id || req.user?.id;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "User ID is required",
        });
      }

      if (String(callerId) === String(userId)) {
        return res.status(400).json({
          success: false,
          message: "You cannot change your own admin status",
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const { isAdmin: forceValue } = req.body || {};
      const nextIsAdmin =
        typeof forceValue === "boolean" ? forceValue : !user.isAdmin;

      user.isAdmin = nextIsAdmin;
      await user.save();

      console.log(
        `🔐 Admin ${nextIsAdmin ? "GRANTED" : "REVOKED"} admin status for '${
          user.name
        }' (${user._id})`
      );

      return res.json({
        success: true,
        message: nextIsAdmin
          ? `Admin access granted to ${user.name}.`
          : `Admin access revoked from ${user.name}.`,
        user: {
          _id: user._id,
          name: user.name,
          phone: user.phone,
          email: user.email,
          isChef: user.isChef,
          isAdmin: user.isAdmin,
        },
      });
    } catch (err: any) {
      console.error("Toggle admin error:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to update admin status",
      });
    }
  }
);

export default router;