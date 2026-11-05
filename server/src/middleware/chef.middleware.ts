import type { Response, NextFunction } from "express";
import type { AuthRequest } from "./auth.middleware";
import User from "../models/User";

/** Must be mounted AFTER the existing protect middleware. */
export const requireChef = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const user = await User.findById(userId).select("isChef isAdmin").lean();
    if (!user || user.isChef !== true) {
      return res.status(403).json({ success: false, message: "Chef access required" });
    }

    return next();
  } catch (error) {
    console.error("Chef authorization error:", error);
    return res.status(500).json({ success: false, message: "Unable to verify Chef access" });
  }
};
