import dotenv from "dotenv";
dotenv.config();

import express from "express";
import jwt from "jsonwebtoken";
import twilio from "twilio";
import User, { ISavedAddress, IActiveAddress } from "../models/User";
import { otpRateLimiter } from "../middleware/otpRateLimit";
import { AuthRequest, protect } from "../middleware/auth.middleware";
import { normalizeIndianPhone } from "../utils/phone";

const router = express.Router();

// Initialize Twilio Client safely
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

const twilioClient = accountSid && authToken ? twilio(accountSid, authToken) : null;

/**
 * Helper: build consistent user response payload
 */
const buildUserResponse = (user: any) => ({
  id: user._id,
  _id: user._id,
  name: user.name || "User",
  phone: user.phone,
  email: user.email || "",
  address: user.address || "",
  activeAddress: user.activeAddress || null,
  savedAddresses: user.savedAddresses || [],
  isChef: user.isChef,
});

/**
 * SEND OTP VIA TWILIO VERIFY API v2
 */
router.post("/send-otp", otpRateLimiter, async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ message: "Phone required" });
    }

    const normalizedPhone = normalizeIndianPhone(phone);
    if (!normalizedPhone) {
      return res.status(400).json({ message: "Invalid mobile number" });
    }

    if (!twilioClient || !verifyServiceSid) {
      console.error("❌ Twilio credentials are not properly configured on the server.");
      return res.status(500).json({ message: "Twilio service temporarily unavailable" });
    }

    console.log(`📱 Requesting Twilio OTP verification for ${normalizedPhone}`);

    const verification = await twilioClient.verify.v2
      .services(verifyServiceSid)
      .verifications.create({
        to: normalizedPhone,
        channel: "sms",
      });

    console.log(`✅ Twilio verification SID created: ${verification.sid}`);

    return res.json({ message: "OTP sent successfully via SMS" });
  } catch (error: any) {
    console.error("❌ Twilio send-otp error:", error?.message || error);

    if (error?.code === 60200 || error?.status === 400) {
      return res.status(400).json({ message: "Invalid mobile number format" });
    }
    if (error?.code === 60203) {
      return res.status(429).json({ message: "Too many OTP requests. Please try again later." });
    }

    return res.status(500).json({ message: "Unable to send OTP. Please try again later." });
  }
});

/**
 * VERIFY OTP VIA TWILIO VERIFY API v2 & ISSUE KATBOX JWT
 */
router.post("/verify-otp", async (req, res) => {
  try {
    const { phone, otp, name } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ message: "Phone & OTP required" });
    }

    const normalizedPhone = normalizeIndianPhone(phone);
    if (!normalizedPhone) {
      return res.status(400).json({ message: "Invalid mobile number" });
    }

    if (!twilioClient || !verifyServiceSid) {
      console.error("❌ Twilio credentials are not properly configured on the server.");
      return res.status(500).json({ message: "Twilio service temporarily unavailable" });
    }

    console.log(`🔍 Verifying Twilio OTP for ${normalizedPhone}`);

    const verificationCheck = await twilioClient.verify.v2
      .services(verifyServiceSid)
      .verificationChecks.create({
        to: normalizedPhone,
        code: otp.trim(),
      });

    console.log(`📌 Twilio verification check status: ${verificationCheck.status}`);

    if (verificationCheck.status !== "approved") {
      return res.status(400).json({ message: "Invalid OTP or verification expired" });
    }

    // Twilio verification approved — Find or create MongoDB User
    let user = await User.findOne({ phone: normalizedPhone });

    const cleanName = name && typeof name === "string" ? name.trim() : "";

    if (!user) {
      user = await User.create({
        phone: normalizedPhone,
        name: cleanName || "User",
        savedAddresses: [],
        activeAddress: null,
        address: "",
      });
      console.log(`✨ Created new MongoDB user for ${normalizedPhone}`);
    } else if (cleanName && (!user.name || user.name.trim() === "" || user.name === "User")) {
      user.name = cleanName;
      await user.save();
      console.log(`📝 Updated user name for ${normalizedPhone}`);
    }

    const token = jwt.sign(
      { userId: user._id, _id: user._id, id: user._id },
      process.env.JWT_SECRET as string,
      { expiresIn: "30d" }
    );

    return res.json({
      token,
      user: buildUserResponse(user),
    });
  } catch (error: any) {
    console.error("❌ Twilio verify-otp error:", error?.message || error);

    if (error?.status === 404 || error?.code === 20404) {
      return res.status(400).json({ message: "OTP expired or not found" });
    }

    return res.status(400).json({ message: "Verification failed. Please request a new OTP." });
  }
});

/**
 * GET CURRENT USER
 */
router.get("/me", protect, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.userId || req.user?._id || req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const user = await User.findById(userId);

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      user: buildUserResponse(user),
    });
  } catch (error) {
    res.status(500).json({ message: "Server error fetching user" });
  }
});

/**
 * PATCH UPDATE USER PROFILE
 */
router.patch("/update-profile", protect, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.userId || req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized - User ID not found in token" });
    }

    const { name, address, email, savedAddresses, activeAddress } = req.body;

    const updateFields: any = {};

    if (name !== undefined) {
      updateFields.name = typeof name === "string" ? name.trim() : name;
    }
    if (email !== undefined) {
      updateFields.email = typeof email === "string" ? email.trim() : email;
    }

    if (activeAddress !== undefined && activeAddress !== null) {
      const aa: IActiveAddress = {
        id: activeAddress.id || `active_${Date.now()}`,
        title: activeAddress.title || "Current Location",
        houseDetails: activeAddress.houseDetails || "",
        fullAddress: activeAddress.fullAddress || "",
        latitude: typeof activeAddress.latitude === "number" ? activeAddress.latitude : 0,
        longitude: typeof activeAddress.longitude === "number" ? activeAddress.longitude : 0,
        tag: activeAddress.tag || "Home",
        updatedAt: new Date(),
      };
      updateFields.activeAddress = aa;

      const combined =
        aa.houseDetails && aa.houseDetails.trim().length > 0
          ? `${aa.houseDetails}, ${aa.fullAddress}`
          : aa.fullAddress;
      updateFields.address = combined || "";
    } else if (address !== undefined) {
      updateFields.address = typeof address === "string" ? address.trim() : address;
    }

    if (Array.isArray(savedAddresses)) {
      const uniqueAddresses: ISavedAddress[] = [];
      const seen = new Set<string>();

      for (const addr of savedAddresses) {
        if (!addr || !addr.fullAddress) continue;
        const normalizedKey = `${(addr.houseDetails || "").trim().toLowerCase()}_${addr.fullAddress.trim().toLowerCase()}`;
        if (!seen.has(normalizedKey)) {
          seen.add(normalizedKey);
          uniqueAddresses.push({
            id: addr.id || `addr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            title: addr.title || "Home",
            houseDetails: addr.houseDetails || "",
            fullAddress: addr.fullAddress,
            latitude: addr.latitude || 0,
            longitude: addr.longitude || 0,
            tag: addr.tag || "Home",
            createdAt: addr.createdAt ? new Date(addr.createdAt) : new Date(),
          });
        }
      }
      updateFields.savedAddresses = uniqueAddresses;
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      success: true,
      message: "Profile and addresses updated successfully in MongoDB",
      user: buildUserResponse(updatedUser),
    });
  } catch (err: any) {
    console.error("❌ Error updating profile:", err);
    return res.status(500).json({ message: "Error updating profile", error: err.message });
  }
});

// Also support PUT /update-profile in case the client or axios dispatches PUT instead of PATCH
router.put("/update-profile", protect, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.userId || req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized - User ID not found in token" });
    }

    const { name, address, email, savedAddresses, activeAddress } = req.body;
    const updateFields: any = {};

    if (name !== undefined) updateFields.name = typeof name === "string" ? name.trim() : name;
    if (email !== undefined) updateFields.email = typeof email === "string" ? email.trim() : email;

    if (activeAddress !== undefined && activeAddress !== null) {
      const aa: IActiveAddress = {
        id: activeAddress.id || `active_${Date.now()}`,
        title: activeAddress.title || "Current Location",
        houseDetails: activeAddress.houseDetails || "",
        fullAddress: activeAddress.fullAddress || "",
        latitude: typeof activeAddress.latitude === "number" ? activeAddress.latitude : 0,
        longitude: typeof activeAddress.longitude === "number" ? activeAddress.longitude : 0,
        tag: activeAddress.tag || "Home",
        updatedAt: new Date(),
      };
      updateFields.activeAddress = aa;
      const combined =
        aa.houseDetails && aa.houseDetails.trim().length > 0
          ? `${aa.houseDetails}, ${aa.fullAddress}`
          : aa.fullAddress;
      updateFields.address = combined || "";
    } else if (address !== undefined) {
      updateFields.address = typeof address === "string" ? address.trim() : address;
    }

    if (Array.isArray(savedAddresses)) {
      const uniqueAddresses: ISavedAddress[] = [];
      const seen = new Set<string>();

      for (const addr of savedAddresses) {
        if (!addr || !addr.fullAddress) continue;
        const normalizedKey = `${(addr.houseDetails || "").trim().toLowerCase()}_${addr.fullAddress.trim().toLowerCase()}`;
        if (!seen.has(normalizedKey)) {
          seen.add(normalizedKey);
          uniqueAddresses.push({
            id: addr.id || `addr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            title: addr.title || "Home",
            houseDetails: addr.houseDetails || "",
            fullAddress: addr.fullAddress,
            latitude: addr.latitude || 0,
            longitude: addr.longitude || 0,
            tag: addr.tag || "Home",
            createdAt: addr.createdAt ? new Date(addr.createdAt) : new Date(),
          });
        }
      }
      updateFields.savedAddresses = uniqueAddresses;
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      success: true,
      message: "Profile and addresses updated successfully in MongoDB",
      user: buildUserResponse(updatedUser),
    });
  } catch (err: any) {
    console.error("❌ Error updating profile:", err);
    return res.status(500).json({ message: "Error updating profile", error: err.message });
  }
});

export default router;