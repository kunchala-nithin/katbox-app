// src/controllers/assistant.controller.ts
//
// Backward-compatible extension of the assistant conversation controller.
// Existing callers that only send { id, text, sender } keep working:
// `kind` defaults to 'text' and `payload` is dropped when omitted.

import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import AssistantConversation from "../models/assistant";

const MAX_MESSAGES = 300;
const MAX_MESSAGE_LENGTH = 5000;

const ALLOWED_KINDS = [
  "text",
  "hub",
  "catering_form",
  "mealbox_form",
  "chef_search",
  "faq_topics",
  "faq_answer",
  "results",
  "orders",
  "error",
];

const getAuthenticatedUserId = (req: AuthRequest): string | null => {
  const userId = req.user?.userId;
  return typeof userId === "string" && userId.trim() ? userId : null;
};

/** GET /api/assistant/conversation */
export const getAssistantConversation = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      return res
        .status(401)
        .json({ message: "Authenticated user ID is missing." });
    }

    const conversation = await AssistantConversation.findOne({ userId }).lean();
    return res.status(200).json({
      messages: conversation?.messages ?? [],
      updatedAt: conversation?.updatedAt ?? null,
    });
  } catch (error) {
    console.error("Failed to load assistant conversation:", error);
    return res
      .status(500)
      .json({ message: "Unable to load assistant conversation." });
  }
};

/** PUT /api/assistant/messages */
export const saveAssistantMessages = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      return res
        .status(401)
        .json({ message: "Authenticated user ID is missing." });
    }

    const { messages } = req.body ?? {};
    if (!Array.isArray(messages)) {
      return res.status(400).json({ message: "Messages must be an array." });
    }
    if (messages.length > MAX_MESSAGES) {
      return res.status(400).json({
        message: `A maximum of ${MAX_MESSAGES} messages is allowed.`,
      });
    }

    const validatedMessages: Array<{
      id: string;
      text: string;
      sender: "user" | "assistant";
      kind: string;
      payload?: any;
      createdAt: Date;
    }> = [];

    for (const message of messages) {
      if (
        !message ||
        typeof message.text !== "string" ||
        !["user", "assistant"].includes(message.sender)
      ) {
        return res
          .status(400)
          .json({ message: "A message has an invalid format." });
      }

      const text = message.text.trim();
      if (!text || text.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({
          message: `Message text must contain 1 to ${MAX_MESSAGE_LENGTH} characters.`,
        });
      }

      const id =
        typeof message.id === "string" && message.id.trim()
          ? message.id.slice(0, 150)
          : "";
      if (!id) {
        return res
          .status(400)
          .json({ message: "Every message must have a valid ID." });
      }

      // Backward compatible: an old message with no `kind` becomes 'text'.
      const rawKind =
        typeof message.kind === "string" ? message.kind.trim() : "text";
      const kind = ALLOWED_KINDS.includes(rawKind) ? rawKind : "text";

      // Payload is optional. We only persist it for non-text messages.
      let payload: any = undefined;
      if (kind !== "text" && message.payload !== undefined) {
        try {
          // JSON round-trip guards against non-serializable values
          payload = JSON.parse(JSON.stringify(message.payload));
        } catch {
          payload = undefined;
        }
      }

      const parsedDate = message.createdAt
        ? new Date(message.createdAt)
        : new Date();
      validatedMessages.push({
        id,
        text,
        sender: message.sender as "user" | "assistant",
        kind,
        payload,
        createdAt: Number.isNaN(parsedDate.getTime())
          ? new Date()
          : parsedDate,
      });
    }

    const conversation = await AssistantConversation.findOneAndUpdate(
      { userId },
      {
        $set: { messages: validatedMessages },
        $setOnInsert: { userId },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.status(200).json({
      message: "Assistant conversation saved successfully.",
      messages: conversation.messages,
      updatedAt: conversation.updatedAt,
    });
  } catch (error) {
    console.error("Failed to save assistant conversation:", error);
    return res
      .status(500)
      .json({ message: "Unable to save assistant conversation." });
  }
};

/** DELETE /api/assistant/conversation */
export const clearAssistantConversation = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      return res
        .status(401)
        .json({ message: "Authenticated user ID is missing." });
    }

    await AssistantConversation.findOneAndUpdate(
      { userId },
      { $set: { messages: [] }, $setOnInsert: { userId } },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.status(200).json({
      message: "Assistant conversation cleared successfully.",
      messages: [],
    });
  } catch (error) {
    console.error("Failed to clear assistant conversation:", error);
    return res
      .status(500)
      .json({ message: "Unable to clear assistant conversation." });
  }
};