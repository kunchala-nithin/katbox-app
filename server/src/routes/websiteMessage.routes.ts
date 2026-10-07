import express, { NextFunction, Response } from "express";
import {
  createWebsiteMessage,
  getWebsiteMessages,
  markWebsiteMessageRead,
} from "../controllers/websiteMessage.controller";
import { AuthRequest, protect } from "../middleware/auth.middleware";
import User from "../models/User";

const router = express.Router();

/**
 * Admin guard for website message endpoints.
 *
 * The Katbox JWT has historically exposed the authenticated user ID
 * as `userId`, while some middleware versions expose it as `id`.
 * Accept both shapes so this route remains compatible with the
 * existing authentication flow.
 */
const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const rawUserId =
      req.user?.userId ||
      req.user?.id ||
      req.user?._id;

    const userId = rawUserId ? String(rawUserId) : "";

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const user = await User.findById(userId)
      .select("_id isAdmin")
      .lean();

    if (!user || user.isAdmin !== true) {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    next();
  } catch (error) {
    console.error("Website message admin guard error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to verify admin access",
    });
  }
};

// Public website join form submission.
router.post("/", createWebsiteMessage);

// Admin-only message list and status update.
router.get("/admin", protect, requireAdmin, getWebsiteMessages);

router.patch(
  "/admin/:messageId/read",
  protect,
  requireAdmin,
  markWebsiteMessageRead
);

export default router;
