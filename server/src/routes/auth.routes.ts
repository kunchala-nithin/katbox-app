import dotenv from "dotenv";
dotenv.config();

import express from "express";
import jwt from "jsonwebtoken";
import twilio from "twilio"; // ⭐ Twilio is now ACTIVE again
import User, {
  ISavedAddress,
  IActiveAddress,
} from "../models/User";
// ✅ Chef model import — needed to join Chef.orderHistory for chef users
import Chef from "../models/Chef";
import { otpRateLimiter } from "../middleware/otpRateLimit"; // ⭐ Twilio rate limiter is ACTIVE
import {
  AuthRequest,
  protect,
} from "../middleware/auth.middleware";
import { normalizeIndianPhone } from "../utils/phone";

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
 * Initialize Twilio Client.
 *
 * Used for the OTP-based phone login flow.
 */
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

const twilioClient =
  accountSid && authToken
    ? twilio(accountSid, authToken)
    : null;

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
 * requireAdmin middleware
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
 * SEND OTP VIA TWILIO VERIFY API v2
 * ============================================================
 *
 * Mobile-number-based login flow.
 *
 *   POST /auth/send-otp
 *   Body: { phone: "+919133450555" | "9133450555", name?: string }
 *
 * Twilio Verify handles:
 *   - SMS delivery
 *   - rate limiting (in addition to our own rateLimiter)
 *   - code expiry
 *   - code hashing
 *
 * The user is NOT created here. That happens inside /verify-otp
 * once the OTP is confirmed approved by Twilio.
 * ============================================================
 */
router.post(
  "/send-otp",
  otpRateLimiter,
  async (req, res) => {
    try {
      const { phone } = req.body;

      if (!phone) {
        return res.status(400).json({
          message: "Phone required",
        });
      }

      const normalizedPhone =
        normalizeIndianPhone(phone);

      if (!normalizedPhone) {
        return res.status(400).json({
          message: "Invalid mobile number",
        });
      }

      if (
        !twilioClient ||
        !verifyServiceSid
      ) {
        console.error(
          "❌ Twilio credentials are not properly configured on the server."
        );

        return res.status(500).json({
          message:
            "Twilio service temporarily unavailable",
        });
      }

      console.log(
        `📱 Requesting Twilio OTP verification for ${normalizedPhone}`
      );

      const verification =
        await twilioClient.verify.v2
          .services(verifyServiceSid)
          .verifications.create({
            to: normalizedPhone,
            channel: "sms",
          });

      console.log(
        `✅ Twilio verification SID created: ${verification.sid}`
      );

      return res.json({
        message:
          "OTP sent successfully via SMS",
      });
    } catch (error: any) {
      console.error(
        "❌ Twilio send-otp error:",
        error?.message || error
      );

      if (
        error?.code === 60200 ||
        error?.status === 400
      ) {
        return res.status(400).json({
          message:
            "Invalid mobile number format",
        });
      }

      if (error?.code === 60203) {
        return res.status(429).json({
          message:
            "Too many OTP requests. Please try again later.",
        });
      }

      return res.status(500).json({
        message:
          "Unable to send OTP. Please try again later.",
      });
    }
  }
);

/*
 * ============================================================
 * VERIFY OTP VIA TWILIO
 * ============================================================
 *
 *   POST /auth/verify-otp
 *   Body: { phone, otp, name? }
 *
 * Once Twilio confirms the OTP is "approved":
 *
 *   1. Find user by normalized phone
 *   2. If missing → create new user (name from request)
 *   3. If existing but name is default/empty → update name
 *   4. Issue Katbox JWT (30d) and return the user payload
 * ============================================================
 */
router.post(
  "/verify-otp",
  async (req, res) => {
    try {
      const {
        phone,
        otp,
        name,
      } = req.body;

      if (!phone || !otp) {
        return res.status(400).json({
          message:
            "Phone & OTP required",
        });
      }

      const normalizedPhone =
        normalizeIndianPhone(phone);

      if (!normalizedPhone) {
        return res.status(400).json({
          message:
            "Invalid mobile number",
        });
      }

      if (
        !twilioClient ||
        !verifyServiceSid
      ) {
        console.error(
          "❌ Twilio credentials are not properly configured on the server."
        );

        return res.status(500).json({
          message:
            "Twilio service temporarily unavailable",
        });
      }

      console.log(
        `🔍 Verifying Twilio OTP for ${normalizedPhone}`
      );

      const verificationCheck =
        await twilioClient.verify.v2
          .services(verifyServiceSid)
          .verificationChecks.create({
            to: normalizedPhone,
            code: otp.trim(),
          });

      console.log(
        `📌 Twilio verification check status: ${verificationCheck.status}`
      );

      if (
        verificationCheck.status !==
        "approved"
      ) {
        return res.status(400).json({
          message:
            "Invalid OTP or verification expired",
        });
      }

      let user =
        await User.findOne({
          phone: normalizedPhone,
        });

      const cleanName =
        name &&
        typeof name === "string"
          ? name.trim()
          : "";

      if (!user) {
        user = await User.create({
          phone: normalizedPhone,
          name:
            cleanName || "User",
          savedAddresses: [],
          activeAddress: null,
          address: "",
        });

        console.log(
          `✨ Created new MongoDB user: '${user.name}' for ${normalizedPhone}`
        );
      } else if (
        cleanName &&
        (
          !user.name ||
          user.name.trim() === "" ||
          user.name.trim().toLowerCase() === "user"
        )
      ) {
        user.name = cleanName;

        await user.save();

        console.log(
          `📝 Updated user name to '${cleanName}' for ${normalizedPhone}`
        );
      }

      const jwtSecret =
        process.env.JWT_SECRET;

      if (!jwtSecret) {
        return res.status(500).json({
          message:
            "Server authentication configuration is incomplete.",
        });
      }

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

      return res.json({
        token,
        user: buildUserResponse(user),
      });
    } catch (error: any) {
      console.error(
        "❌ Twilio verify-otp error:",
        error?.message || error
      );

      if (
        error?.status === 404 ||
        error?.code === 20404
      ) {
        return res.status(400).json({
          message:
            "OTP expired or not found",
        });
      }

      return res.status(400).json({
        message:
          "Verification failed. Please request a new OTP.",
      });
    }
  }
);

/*
 * ============================================================
 * LOOKUP PHONE
 * ============================================================
 *
 * Small utility endpoint.
 *
 *   GET /auth/lookup-phone?phone=+919133450555
 *
 * Returns:
 *   { registered: true,  email: "user@example.com" }
 *   { registered: true,  email: "" }              // phone exists, no email saved yet
 *   { registered: false }                         // phone not in DB
 *
 * Purpose:
 *   - Optional UX hint (show "Welcome back" if registered).
 *   - Kept for backward compatibility with any client that
 *     still calls it after login.
 *
 * It intentionally does NOT expose name / address / role / _id.
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
 * UPDATE USER PROFILE
 * ============================================================
 *
 * IMPORTANT:
 *
 * `email` is intentionally NOT allowed to be changed here.
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
      } = req.body;

      const updateFields: any = {};

      if (name !== undefined) {
        updateFields.name =
          typeof name === "string"
            ? name.trim()
            : name;
      }

      if (pushToken !== undefined) {
        updateFields.pushToken =
          typeof pushToken === "string"
            ? pushToken.trim()
            : pushToken;
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
       * SAVED ADDRESSES (parity with /update-profile)
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
      } = req.body;

      const updateFields: any = {};

      if (name !== undefined) {
        updateFields.name =
          typeof name === "string"
            ? name.trim()
            : name;
      }

      if (pushToken !== undefined) {
        updateFields.pushToken =
          typeof pushToken === "string"
            ? pushToken.trim()
            : pushToken;
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
 * ADMIN — LIST ALL USERS (with order history)
 * ============================================================
 *
 * GET /auth/admin/users
 * GET /auth/users  (legacy alias)
 *
 * For every user whose isChef === true, we ALSO look up the
 * linked Chef document and populate its orderHistory. This
 * returns the orders that were PLACED TO that user as a chef
 * (which are stored on Chef.orderHistory, not User.orderHistory).
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
 *     // Orders RECEIVED by this user (as chef):
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
       Fetch Chef documents for every chef user in a single
       batched query, then populate their orderHistory too.
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
 * ADMIN — TOGGLE USER isChef
 * ============================================================
 *
 * PATCH /auth/admin/users/:userId/toggle-chef
 *
 * Body (optional): { isChef: boolean }
 *   - If provided → force-sets the value (idempotent)
 *   - If omitted  → flips the current value
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
 * ADMIN — TOGGLE USER isAdmin
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