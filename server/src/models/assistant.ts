import mongoose, { Document, Schema } from "mongoose";

export type AssistantSender = "user" | "assistant";

export interface IAssistantMessage {
  id: string;
  text: string;
  sender: AssistantSender;
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
