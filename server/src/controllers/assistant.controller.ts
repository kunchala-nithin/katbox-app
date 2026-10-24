// src/controllers/assistant.controller.ts
import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import AssistantConversation from "../models/assistant";

const MAX_MESSAGES = 300;
const MAX_MESSAGE_LENGTH = 5000;
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

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
      return res.status(401).json({ message: "Authenticated user ID is missing." });
    }

    const conversation = await AssistantConversation.findOne({ userId }).lean();
    
    // ✅ Manual check: If older than 2 days, clear it immediately
    if (conversation && conversation.updatedAt) {
      const age = Date.now() - new Date(conversation.updatedAt).getTime();
      if (age > TWO_DAYS_MS) {
        await AssistantConversation.updateOne({ userId }, { $set: { messages: [] } });
        return res.status(200).json({ messages: [], updatedAt: null });
      }
    }

    return res.status(200).json({
      messages: conversation?.messages ?? [],
      updatedAt: conversation?.updatedAt ?? null,
    });
  } catch (error) {
    console.error("Failed to load assistant conversation:", error);
    return res.status(500).json({ message: "Unable to load assistant conversation." });
  }
};

/** GET /api/assistant/history (For the 3-dot menu) */
export const getAssistantHistory = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Authenticated user ID is missing." });
    }

    // Fetch all conversations for this user sorted by newest
    // (In this schema, userId is unique, so there's only one active doc. 
    // To support a true history list, we would normally need an array of past sessions. 
    // For now, we return the current active chat if it has messages.)
    const conversation = await AssistantConversation.findOne({ userId }).lean();
    
    if (!conversation || !conversation.messages || conversation.messages.length === 0) {
      return res.status(200).json({ history: [] });
    }

    // Check 2 day expiry
    const age = Date.now() - new Date(conversation.updatedAt).getTime();
    if (age > TWO_DAYS_MS) {
      await AssistantConversation.updateOne({ userId }, { $set: { messages: [] } });
      return res.status(200).json({ history: [] });
    }

    // Return a single history item representing this session
    return res.status(200).json({
      history: [
        {
          sessionId: conversation._id,
          previewText: conversation.messages[0]?.text || "Previous Chat",
          updatedAt: conversation.updatedAt,
          messages: conversation.messages,
        }
      ]
    });
  } catch (error) {
    console.error("Failed to load assistant history:", error);
    return res.status(500).json({ message: "Unable to load history." });
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
      return res.status(401).json({ message: "Authenticated user ID is missing." });
    }

    const { messages } = req.body ?? {};
    if (!Array.isArray(messages)) {
      return res.status(400).json({ message: "Messages must be an array." });
    }
    if (messages.length > MAX_MESSAGES) {
      return res.status(400).json({ message: `A maximum of ${MAX_MESSAGES} messages is allowed.` });
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
      if (!message || typeof message.text !== "string" || !["user", "assistant"].includes(message.sender)) {
        return res.status(400).json({ message: "A message has an invalid format." });
      }

      const text = message.text.trim();
      if (!text || text.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({ message: `Message text must contain 1 to ${MAX_MESSAGE_LENGTH} characters.` });
      }

      const id = typeof message.id === "string" && message.id.trim() ? message.id.slice(0, 150) : "";
      if (!id) {
        return res.status(400).json({ message: "Every message must have a valid ID." });
      }

      const rawKind = typeof message.kind === "string" ? message.kind.trim() : "text";
      const kind = ALLOWED_KINDS.includes(rawKind) ? rawKind : "text";

      let payload: any = undefined;
      if (kind !== "text" && message.payload !== undefined) {
        try {
          payload = JSON.parse(JSON.stringify(message.payload));
        } catch {
          payload = undefined;
        }
      }

      const parsedDate = message.createdAt ? new Date(message.createdAt) : new Date();
      validatedMessages.push({
        id,
        text,
        sender: message.sender as "user" | "assistant",
        kind,
        payload,
        createdAt: Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate,
      });
    }

    const conversation = await AssistantConversation.findOneAndUpdate(
      { userId },
      {
        $set: { messages: validatedMessages },
        $setOnInsert: { userId },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      message: "Assistant conversation saved successfully.",
      messages: conversation.messages,
      updatedAt: conversation.updatedAt,
    });
  } catch (error) {
    console.error("Failed to save assistant conversation:", error);
    return res.status(500).json({ message: "Unable to save assistant conversation." });
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
      return res.status(401).json({ message: "Authenticated user ID is missing." });
    }

    await AssistantConversation.findOneAndUpdate(
      { userId },
      { $set: { messages: [] }, $setOnInsert: { userId } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      message: "Assistant conversation cleared successfully.",
      messages: [],
    });
  } catch (error) {
    console.error("Failed to clear assistant conversation:", error);
    return res.status(500).json({ message: "Unable to clear assistant conversation." });
  }
};