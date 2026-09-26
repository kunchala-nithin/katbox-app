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
  name: string;
  phone: string;
  email?: string;
  address?: string;
  activeAddress?: IActiveAddress;
  savedAddresses: ISavedAddress[];
  isChef: boolean;
  isAdmin: boolean;
  /**
   * ✅ Expo push notification token.
   *
   * Set by the client after login (POST /auth/push-token) and also
   * via PATCH /auth/update-profile. Used by the order controllers to
   * fire killed/minimized-app notifications for:
   *   • new orders (chef + admins)
   *   • order lifecycle updates (customer)
   */
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
     * This is now the primary identity key.
     *
     * The authentication route enforces:
     *
     *   one mobile number -> one user document
     *
     * (Twilio OTP flow handles login. No Google / Clerk
     * email is required to authenticate.)
     */
    phone: {
      type: String,
      required: true,
      default: "",
      trim: true,
      index: true,
    },

    /*
     * Optional email field
     *
     * Kept for backward compatibility with any legacy records
     * that still hold a Google email. New sign-ups via OTP
     * will leave this empty.
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
     * ✅ Expo push notification token.
     *
     * Stored as a plain string. Empty string means "no token registered
     * yet". The notification helper `isValidExpoToken()` guards against
     * sending to invalid/empty tokens.
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