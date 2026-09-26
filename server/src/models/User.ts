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
  activeAddress?: IActiveAddress | null;
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

/*
 * ============================================================
 * SAVED ADDRESS SUB-SCHEMA
 * ============================================================
 *
 * Each saved address gets its own _id so the client can
 * reference it for edit / delete without relying on array
 * indices (which shift when entries are removed).
 */
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

/*
 * ============================================================
 * ACTIVE ADDRESS SUB-SCHEMA
 * ============================================================
 *
 * Single embedded object (not an array). `_id: false` because
 * there is exactly one active address at a time.
 */
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

/*
 * ============================================================
 * USER SCHEMA
 * ============================================================
 */
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
     *
     * ✅ Indexed with `unique: true` (was previously
     *    `index: true` only — which allowed theoretical
     *    duplicate-user races during concurrent
     *    /auth/verify-otp requests from the same number).
     */
    phone: {
      type: String,
      required: true,
      default: "",
      trim: true,
      unique: true,
      sparse: true, // allow missing phone only for legacy records
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
     * Stored as a plain string. Empty string means "no token
     * registered yet". The notification helper
     * `isValidExpoToken()` guards against sending to
     * invalid/empty tokens.
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

    /*
     * ----------------------------------------------------------
     * ✅ AUTO-INDEX IN PRODUCTION?
     * ----------------------------------------------------------
     *
     * In production, `autoIndex: true` can slow down app boot
     * on large collections because Mongoose will inspect and
     * build indexes every time the app connects. Set
     * autoIndex: false in production and build indexes via a
     * migration script or `syncIndexes()`.
     *
     * Default is true for dev convenience.
     */
    autoIndex: process.env.NODE_ENV !== "production",
  }
);

/*
 * ============================================================
 * ✅ COMPOUND INDEX FOR LOOKUPS
 * ============================================================
 *
 * `/auth/send-otp` and `/auth/verify-otp` both look up users
 * by phone. The unique index above already covers this, but
 * adding an explicit compound index on (phone, createdAt)
 * makes the `findOne({ phone })` queries used by
 * buildUserResponse / admin listing noticeably faster on
 * larger collections.
 */
userSchema.index({ phone: 1, createdAt: -1 });

/*
 * ============================================================
 * ✅ HELPER: ENSURE UNIQUE INDEX IN PRODUCTION
 * ============================================================
 *
 * When `autoIndex: false` (production), call this once after
 * the DB connection is established to guarantee the unique
 * index on `phone` exists. This is what prevents a
 * concurrent /verify-otp race from creating two users with
 * the same phone number.
 *
 * Usage (in config/db.ts or index.ts after connectDB):
 *   import User from "./models/User";
 *   await User.syncIndexes();
 */
userSchema.statics.ensureIndexes = async function () {
  try {
    await this.syncIndexes();
    console.log("✅ User indexes ensured.");
  } catch (err) {
    console.error("⚠️ User index sync failed:", err);
  }
};

/*
 * Reuse the existing model during hot reloads/server restarts.
 */
export default mongoose.models.User ||
  mongoose.model<IUser>("User", userSchema);