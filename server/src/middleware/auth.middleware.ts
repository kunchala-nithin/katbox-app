import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

export interface AuthRequest extends Request {
  user?: { userId: string; _id?: string; id?: string; [key: string]: any };
}

export const protect = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Not authorized, token missing" });
  }
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error("JWT_SECRET is missing");
    return res.status(500).json({ success: false, message: "Server authentication configuration is incomplete" });
  }
  try {
    const token = authHeader.slice(7).trim();
    if (!token) return res.status(401).json({ success: false, message: "Invalid authentication token" });
    const decoded = jwt.verify(token, jwtSecret) as jwt.JwtPayload;
    const userId = decoded.userId;
    if (typeof userId !== "string" || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({ success: false, message: "Invalid authentication identity" });
    }
    req.user = { ...decoded, userId, _id: userId, id: userId };
    return next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
};
