// src/models/assistant.ts
//
// Extended assistant conversation schema. Older persisted messages with
// only { id, text, sender, createdAt } remain fully valid — `kind`
// defaults to "text" and `payload` is optional.

import mongoose, { Document, Schema } from "mongoose";

export type AssistantSender = "user" | "assistant";

export type AssistantMessageKind =
  | "text"
  | "hub"
  | "catering_form"
  | "mealbox_form"
  | "chef_search"
  | "faq_topics"
  | "faq_answer"
  | "results"
  | "orders"
  | "error";

export interface IAssistantMessage {
  id: string;
  text: string;
  sender: AssistantSender;
  kind?: AssistantMessageKind;
  payload?: any;
  createdAt: Date;
}

export interface IAssistantConversation extends Document {
  userId: string;
  messages: IAssistantMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const assistantMessageSchema = new Schema<IAssistantMessage>(
  {
    id: { type: String, required: true },
    text: { type: String, required: true, maxlength: 5000 },
    sender: { type: String, enum: ["user", "assistant"], required: true },
    kind: {
      type: String,
      enum: [
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
      ],
      default: "text",
    },
    // Mixed payload carries hub/form/result metadata. Kept optional so
    // messages saved before this schema change still load correctly.
    payload: { type: Schema.Types.Mixed, default: undefined },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const assistantConversationSchema = new Schema<IAssistantConversation>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    messages: { type: [assistantMessageSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.models.AssistantConversation ||
  mongoose.model<IAssistantConversation>(
    "AssistantConversation",
    assistantConversationSchema
  );