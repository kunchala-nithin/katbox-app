import mongoose, { Document, Schema } from "mongoose";

export type WebsiteMessageType = "join";
export type WebsiteJoinRole = "customer" | "chef";
export type WebsiteMessageStatus = "new" | "read";

export interface IWebsiteMessage extends Document {
  type: WebsiteMessageType;
  role: WebsiteJoinRole;
  name: string;
  email: string;
  phone: string;
  city: string;
  about?: string;
  source: string;
  status: WebsiteMessageStatus;
  createdAt: Date;
  updatedAt: Date;
}

const websiteMessageSchema = new Schema<IWebsiteMessage>(
  {
    type: {
      type: String,
      enum: ["join"],
      required: true,
      default: "join",
      index: true,
    },

    role: {
      type: String,
      enum: ["customer", "chef"],
      required: true,
      index: true,
    },

    name: {
      type: String,
      trim: true,
      required: true,
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },

    phone: {
      type: String,
      trim: true,
      required: true,
    },

    city: {
      type: String,
      trim: true,
      required: true,
    },

    about: {
      type: String,
      trim: true,
      default: "",
    },

    source: {
      type: String,
      default: "katbox-website",
      trim: true,
    },

    status: {
      type: String,
      enum: ["new", "read"],
      default: "new",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

websiteMessageSchema.index({ createdAt: -1 });
websiteMessageSchema.index({ role: 1, status: 1, createdAt: -1 });

export default mongoose.models.WebsiteMessage ||
  mongoose.model<IWebsiteMessage>("WebsiteMessage", websiteMessageSchema);
