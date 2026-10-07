import { Response } from "express";
import WebsiteMessage from "../models/WebsiteMessage";
import { AuthRequest } from "../middleware/auth.middleware";

const normalizeString = (value: unknown): string => {
  return typeof value === "string" ? value.trim() : "";
};

const normalizeEmail = (value: unknown): string => {
  return normalizeString(value).toLowerCase();
};

const isValidEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

/**
 * POST /api/messages
 *
 * Public endpoint used by the Katbox website join form.
 *
 * Payload:
 *   {
 *     type: "join",
 *     role: "customer" | "chef",
 *     name,
 *     email,
 *     phone,
 *     city,
 *     about
 *   }
 */
export const createWebsiteMessage = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const body = req.body || {};

    const role = normalizeString(body.role) as "customer" | "chef";
    const name = normalizeString(body.name);
    const email = normalizeEmail(body.email);
    const phone = normalizeString(body.phone);
    const city = normalizeString(body.city);
    const about = normalizeString(body.about);

    if (role !== "customer" && role !== "chef") {
      return res.status(400).json({
        success: false,
        message: "Role must be customer or chef",
      });
    }

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "A valid email address is required",
      });
    }

    if (!name || !phone || !city) {
      return res.status(400).json({
        success: false,
        message: "Name, phone and city are required",
      });
    }

    const message = await WebsiteMessage.create({
      type: "join",
      role,
      name,
      email,
      phone,
      city,
      about,
      source: "katbox-website",
      status: "new",
    });

    return res.status(201).json({
      success: true,
      message:
        role === "chef"
          ? "Chef application saved successfully."
          : "Customer interest saved successfully.",
      data: {
        id: message._id,
        type: message.type,
        role: message.role,
        name: message.name,
        email: message.email,
      },
    });
  } catch (error: any) {
    console.error("Create website message error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to save website form submission",
    });
  }
};

/**
 * GET /api/messages/admin
 *
 * Admin-only endpoint used by the mobile admin/all-msgs.tsx screen.
 */
export const getWebsiteMessages = async (
  _req: AuthRequest,
  res: Response
) => {
  try {
    const messages = await WebsiteMessage.find({})
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      messages,
      total: messages.length,
      newCount: messages.filter((message: any) => message.status === "new")
        .length,
    });
  } catch (error: any) {
    console.error("Get website messages error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch website messages",
    });
  }
};

/**
 * PATCH /api/messages/admin/:messageId/read
 *
 * Marks one website message as read.
 */
export const markWebsiteMessageRead = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { messageId } = req.params;

    if (!messageId) {
      return res.status(400).json({
        success: false,
        message: "Message ID is required",
      });
    }

    const message = await WebsiteMessage.findByIdAndUpdate(
      messageId,
      { $set: { status: "read" } },
      { new: true }
    ).lean();

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Website message not found",
      });
    }

    return res.json({
      success: true,
      message: "Website message marked as read",
      data: message,
    });
  } catch (error: any) {
    console.error("Mark website message read error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update website message",
    });
  }
};