
import { Response } from "express";
import mongoose from "mongoose";
import User from "../models/User";
import FCMDevice, {
  FCMAppType,
  FCMPlatform,
  FCMUserRole,
} from "../models/FCMDevice";
import { AuthRequest } from "../middleware/auth.middleware";

/**
 * ============================================================
 * REGISTER FCM DEVICE
 * ============================================================
 *
 * POST /api/fcm/register
 *
 * The user identity always comes from the verified KatBox JWT.
 * The role always comes from MongoDB, never from the request body.
 *
 * Customer app:
 *   - Customer users are allowed.
 *   - Admin users are allowed.
 *
 * Chef app:
 *   - Only users with isChef === true are allowed.
 */
export const registerFCMDevice = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const userId = req.user?.userId;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication identity.",
      });
    }

    const token =
      typeof req.body?.token === "string"
        ? req.body.token.trim()
        : "";

    const appType =
      typeof req.body?.appType === "string"
        ? req.body.appType.trim().toLowerCase()
        : "";

    const platform =
      typeof req.body?.platform === "string"
        ? req.body.platform.trim().toLowerCase()
        : "";

    const deviceId =
      typeof req.body?.deviceId === "string"
        ? req.body.deviceId.trim().slice(0, 200)
        : "";

    if (!token || token.length > 4096) {
      return res.status(400).json({
        success: false,
        message: "A valid FCM token is required.",
      });
    }

    if (!["customer", "chef"].includes(appType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid app type.",
      });
    }

    if (!["android", "ios"].includes(platform)) {
      return res.status(400).json({
        success: false,
        message: "Invalid device platform.",
      });
    }

    const user = await User.findById(userId).select(
      "_id isChef isAdmin"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Authenticated user was not found.",
      });
    }

    let role: FCMUserRole;

    if (appType === "chef") {
      if (user.isChef !== true) {
        return res.status(403).json({
          success: false,
          message: "Chef app registration is not permitted for this account.",
        });
      }

      role = "chef";
    } else {
      if (user.isChef === true && user.isAdmin !== true) {
        return res.status(403).json({
          success: false,
          message: "Please register this account through the Chef app.",
        });
      }

      role = user.isAdmin === true ? "admin" : "customer";
    }

    const normalizedAppType = appType as FCMAppType;
    const normalizedPlatform = platform as FCMPlatform;

    const device = await FCMDevice.findOneAndUpdate(
      { token },
      {
        $set: {
          userId: user._id,
          token,
          appType: normalizedAppType,
          platform: normalizedPlatform,
          role,
          deviceId,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.status(200).json({
      success: true,
      message: "FCM device registered successfully.",
      data: {
        appType: device.appType,
        platform: device.platform,
        role: device.role,
      },
    });
  } catch (error: any) {
    console.error("FCM device registration error:", {
      message: error?.message,
      code: error?.code,
    });

    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "This FCM device token could not be registered.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to register FCM device.",
    });
  }
};

/**
 * ============================================================
 * UNREGISTER FCM DEVICE
 * ============================================================
 *
 * POST /api/fcm/unregister
 *
 * Deletes only the supplied token belonging to the
 * currently authenticated MongoDB user.
 */
export const unregisterFCMDevice = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const userId = req.user?.userId;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication identity.",
      });
    }

    const token =
      typeof req.body?.token === "string"
        ? req.body.token.trim()
        : "";

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "FCM token is required.",
      });
    }

    const result = await FCMDevice.deleteOne({
      userId,
      token,
    });

    return res.status(200).json({
      success: true,
      message: "FCM device unregistered successfully.",
      removed: result.deletedCount === 1,
    });
  } catch (error: any) {
    console.error("FCM device unregistration error:", {
      message: error?.message,
      code: error?.code,
    });

    return res.status(500).json({
      success: false,
      message: "Unable to unregister FCM device.",
    });
  }
};
