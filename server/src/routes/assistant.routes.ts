import express from "express";
import { protect } from "../middleware/auth.middleware";
import {
  getAssistantConversation,
  saveAssistantMessages,
  clearAssistantConversation,
  getAssistantHistory, // ✅ Import the new history controller
} from "../controllers/assistant.controller";

const router = express.Router();

// Every endpoint uses the existing JWT authentication middleware.
router.use(protect);
router.get("/conversation", getAssistantConversation);
router.get("/history", getAssistantHistory); // ✅ New route for the 3-dot menu
router.put("/messages", saveAssistantMessages);
router.delete("/conversation", clearAssistantConversation);

export default router;