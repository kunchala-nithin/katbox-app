import mongoose, { Schema, Document } from "mongoose";

export interface ISavedAddress {
  _id?: mongoose.Types.ObjectId;
  id?: string;
  title: string;
  houseDetails?: string;
  fullAddress: string;
  latitude: number;
  longitude: number;
  tag: "Home" | "Work" | "Other";
  createdAt?: Date;
}

export interface IActiveAddress {
  id?: string;
  title: string;
  houseDetails?: string;
  fullAddress: string;
  latitude: number;
  longitude: number;
  tag: "Home" | "Work" | "Other";
  updatedAt?: Date;
}

export interface IUser extends Document {
  clerkId?: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  activeAddress?: IActiveAddress;
  savedAddresses: ISavedAddress[];
  isChef: boolean;
  isAdmin: boolean;
  pushToken?: string;
  orderHistory: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const savedAddressSchema = new Schema<ISavedAddress>(
  {
    id: {
      type: String,
    },

    title: {
      type: String,
      required: true,
    },

    houseDetails: {
      type: String,
      default: "",
    },

    fullAddress: {
      type: String,
      required: true,
    },

    latitude: {
      type: Number,
      default: 0,
    },

    longitude: {
      type: Number,
      default: 0,
    },

    tag: {
      type: String,
      enum: ["Home", "Work", "Other"],
      default: "Home",
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: true,
  }
);

const activeAddressSchema = new Schema<IActiveAddress>(
  {
    id: {
      type: String,
    },

    title: {
      type: String,
      default: "Current Location",
    },

    houseDetails: {
      type: String,
      default: "",
    },

    fullAddress: {
      type: String,
      default: "",
    },

    latitude: {
      type: Number,
      default: 0,
    },

    longitude: {
      type: Number,
      default: 0,
    },

    tag: {
      type: String,
      enum: ["Home", "Work", "Other"],
      default: "Home",
    },

    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: false,
  }
);

const userSchema = new Schema<IUser>(
  {
    /*
     * Clerk user ID
     *
     * sparse + unique means:
     * - two users cannot have the same Clerk ID
     * - documents without a Clerk ID are allowed
     */
    clerkId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },

    /*
     * User's display name
     */
    name: {
      type: String,
      required: true,
      trim: true,
    },

    /*
     * Indian mobile number
     *
     * We intentionally DO NOT make this unique at the
     * MongoDB level yet because existing databases may
     * contain duplicate/empty phone values.
     *
     * The authentication route enforces:
     *
     * one mobile number -> one Google email
     */
    phone: {
      type: String,
      required: true,
      default: "",
      trim: true,
      index: true,
    },

    /*
     * Google email
     *
     * Always stored in normalized lowercase form.
     */
    email: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },

    /*
     * Legacy/general address field
     */
    address: {
      type: String,
      default: "",
    },

    /*
     * Currently active delivery address
     */
    activeAddress: {
      type: activeAddressSchema,
      default: null,
    },

    /*
     * User's saved delivery addresses
     */
    savedAddresses: {
      type: [savedAddressSchema],
      default: [],
    },

    /*
     * Chef role
     */
    isChef: {
      type: Boolean,
      default: false,
    },

    /*
     * Admin role
     */
    isAdmin: {
      type: Boolean,
      default: false,
    },

    /*
     * Expo push notification token
     */
    pushToken: {
      type: String,
      default: "",
    },

    /*
     * Orders belonging to this user
     */
    orderHistory: [
      {
        type: Schema.Types.ObjectId,
        ref: "Order",
      },
    ],
  },
  {
    timestamps: true,
  }
);

/*
 * Reuse the existing model during hot reloads/server restarts.
 */
export default mongoose.models.User ||
  mongoose.model<IUser>("User", userSchema);