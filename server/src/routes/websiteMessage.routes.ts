import express from "express";
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
 * We intentionally load the user from MongoDB instead of trusting
 * a client-provided isAdmin value in the JWT payload.
 */
const requireAdmin = async (
  req: AuthRequest,
  res: any,
  next: any
) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const user = await User.findById(userId).select("isAdmin").lean();

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

// Public website form submission.
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