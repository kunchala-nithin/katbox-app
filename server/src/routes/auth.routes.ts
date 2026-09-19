import dotenv from "dotenv";
dotenv.config();

import express from "express";
import jwt from "jsonwebtoken";
// import twilio from "twilio"; // ⭐ Twilio commented out for future use
import User, {
  ISavedAddress,
  IActiveAddress,
} from "../models/User";
// import { otpRateLimiter } from "../middleware/otpRateLimit"; // ⭐ Twilio rate limiter commented out
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
 * Initialize Twilio Client safely.
 *
 * Kept commented out for future OTP login.
 */
/*
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

const twilioClient =
  accountSid && authToken
    ? twilio(accountSid, authToken)
    : null;
*/

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

router.post("/clerk-login", async (req, res) => {
  try {
    const {
      email,
      name,
      phone,
      clerkId,
    } = req.body;

    /*
     * --------------------------------------------------------
     * BASIC VALIDATION
     * --------------------------------------------------------
     */

    const normalizedEmail =
      normalizeEmail(email);

    const normalizedPhone = phone
      ? normalizeIndianPhone(phone)
      : "";

    const cleanName =
      name &&
      typeof name === "string"
        ? name.trim()
        : "User";

    /*
     * Google login must provide:
     *
     * - real Google email
     * - real Clerk ID
     * - mobile number
     */
    if (!normalizedEmail) {
      return res.status(400).json({
        code: "EMAIL_REQUIRED",
        message:
          "Google email is required.",
      });
    }

    if (!clerkId || typeof clerkId !== "string") {
      return res.status(400).json({
        code: "CLERK_ID_REQUIRED",
        message:
          "Clerk user ID is required.",
      });
    }

    if (!normalizedPhone) {
      return res.status(400).json({
        code: "PHONE_REQUIRED",
        message:
          "Valid mobile number is required.",
      });
    }

    console.log(
      "🔐 Katbox Clerk login request:",
      {
        email: normalizedEmail,
        phone: normalizedPhone,
        clerkId,
      }
    );

    /*
     * ========================================================
     * STEP 1 — FIND USER BY MOBILE FIRST
     * ========================================================
     *
     * This is the most important change.
     */

    let user = await User.findOne({
      phone: normalizedPhone,
    });

    /*
     * ========================================================
     * EXISTING MOBILE NUMBER
     * ========================================================
     */

    if (user) {
      console.log(
        `🔎 Existing Katbox user found for mobile ${normalizedPhone}`
      );

      const existingEmail =
        normalizeEmail(user.email);

      /*
       * ------------------------------------------------------
       * EXISTING MOBILE + EXISTING EMAIL
       * ------------------------------------------------------
       *
       * If the stored Google email differs from the newly
       * selected Google email, reject the login.
       */

      if (
        existingEmail &&
        existingEmail !== normalizedEmail
      ) {
        console.log(
          "🚫 Google email mismatch for existing mobile:",
          {
            phone: normalizedPhone,
            registeredEmail: existingEmail,
            attemptedEmail: normalizedEmail,
          }
        );

        return res.status(409).json({
          code: "EMAIL_MISMATCH",
          message:
            "This mobile number is already registered with a different Google email.",
          registeredEmail: existingEmail,
        });
      }

      /*
       * ------------------------------------------------------
       * EXISTING MOBILE + SAME EMAIL
       * ------------------------------------------------------
       *
       * Login is allowed.
       *
       * We can safely update missing Clerk ID/name/email.
       */

      let updated = false;

      /*
       * If the old user has no email, save the verified
       * Google email.
       */
      if (!existingEmail) {
        user.email = normalizedEmail;
        updated = true;
      }

      /*
       * If Clerk ID is missing, attach the current Clerk ID.
       */
      if (!user.clerkId || user.clerkId !== clerkId) {
        user.clerkId = clerkId;
        updated = true;
      }

      /*
       * If the user's name is empty/default, update it.
       */
      if (
        cleanName &&
        (
          !user.name ||
          user.name.trim() === "" ||
          user.name.trim().toLowerCase() === "user"
        )
      ) {
        user.name = cleanName;
        updated = true;
      }

      /*
       * The mobile number is already normalized.
       */
      if (user.phone !== normalizedPhone) {
        user.phone = normalizedPhone;
        updated = true;
      }

      if (updated) {
        await user.save();

        console.log(
          `📝 Updated existing MongoDB user '${user.name}'`
        );
      } else {
        console.log(
          `✅ Existing user authenticated: '${user.name}'`
        );
      }
    }

    /*
     * ========================================================
     * NO USER FOR MOBILE
     * ========================================================
     *
     * Before creating a new user, make sure the Google email
     * isn't already attached to a different mobile number.
     */

    if (!user) {
      const emailUser =
        await User.findOne({
          email: normalizedEmail,
        });

      /*
       * ------------------------------------------------------
       * EMAIL ALREADY BELONGS TO ANOTHER MOBILE
       * ------------------------------------------------------
       */

      if (emailUser) {
        const existingPhone =
          emailUser.phone || "";

        /*
         * This should normally never happen because we already
         * searched by phone, but it protects the database from
         * account duplication.
         */

        if (
          existingPhone &&
          existingPhone !== normalizedPhone
        ) {
          console.log(
            "🚫 Google email already belongs to another mobile:",
            {
              email: normalizedEmail,
              registeredPhone: existingPhone,
              attemptedPhone: normalizedPhone,
            }
          );

          return res.status(409).json({
            code: "EMAIL_ALREADY_USED",
            message:
              "This Google email is already registered with another mobile number.",
          });
        }

        /*
         * If the email user exists but doesn't have a phone,
         * attach the current phone.
         */
        user = emailUser;

        let updated = false;

        if (!user.phone) {
          user.phone = normalizedPhone;
          updated = true;
        }

        if (!user.clerkId || user.clerkId !== clerkId) {
          user.clerkId = clerkId;
          updated = true;
        }

        if (
          cleanName &&
          (
            !user.name ||
            user.name.trim() === "" ||
            user.name.trim().toLowerCase() === "user"
          )
        ) {
          user.name = cleanName;
          updated = true;
        }

        if (updated) {
          await user.save();
        }
      }
    }

    /*
     * ========================================================
     * CREATE NEW USER
     * ========================================================
     */

    if (!user) {
      user = await User.create({
        clerkId,
        email: normalizedEmail,
        phone: normalizedPhone,
        name: cleanName || "User",
        savedAddresses: [],
        activeAddress: null,
        address: "",
      });

      console.log(
        `✨ Created new MongoDB user via Clerk: '${user.name}'`
      );
    }

    /*
     * ========================================================
     * ISSUE KATBOX JWT
     * ========================================================
     */

    const jwtSecret =
      process.env.JWT_SECRET;

    if (!jwtSecret) {
      console.error(
        "❌ JWT_SECRET is missing from environment variables."
      );

      return res.status(500).json({
        code: "JWT_SECRET_MISSING",
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

    console.log(
      "✅ Katbox authentication successful:",
      {
        userId: user._id,
        email: user.email,
        phone: user.phone,
        isChef: user.isChef,
        isAdmin: user.isAdmin,
      }
    );

    return res.json({
      token,
      user: buildUserResponse(user),
    });
  } catch (error: any) {
    console.error(
      "❌ Clerk login error:",
      error?.message || error
    );

    /*
     * Handle Mongo duplicate-key errors cleanly.
     */
    if (error?.code === 11000) {
      console.error(
        "❌ MongoDB duplicate key:",
        error?.keyValue
      );

      return res.status(409).json({
        code: "ACCOUNT_ALREADY_EXISTS",
        message:
          "An account with these details already exists. Please use your registered Google account.",
      });
    }

    return res.status(500).json({
      message:
        "Clerk authentication synchronization failed.",
    });
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
 * COMMENTED OUT - KEPT FOR FUTURE USE
 */

/*
router.post("/send-otp", otpRateLimiter, async (req, res) => {
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
});
*/

/*
 * ============================================================
 * VERIFY OTP VIA TWILIO
 * ============================================================
 *
 * COMMENTED OUT - KEPT FOR FUTURE USE
 */

/*
router.post("/verify-otp", async (req, res) => {
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
});
*/

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

export default router;