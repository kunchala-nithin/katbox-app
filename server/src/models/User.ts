
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
     * Phone numbers are stored in normalized E.164 format.
     * Example: +919876543210
     *
     * The field itself does not create a normal index.
     * A partial unique index is declared below instead.
     *
     * Empty legacy phone values are excluded from that index,
     * so multiple existing documents with phone: "" are allowed.
     */
    phone: {
      type: String,
      required: true,
      default: "",
      trim: true,
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
 * IMPORTANT: Unique phone-number protection
 *
 * Enforces:
 * - One non-empty phone number can belong to only one user.
 * - Multiple legacy documents with phone: "" are allowed.
 * - Existing users retain their account information.
 *
 * Phone numbers must be normalized before being saved.
 */
userSchema.index(
  { phone: 1 },
  {
    unique: true,
    name: "phone_unique_nonempty",
    partialFilterExpression: {
      phone: {
        $type: "string",
        $gt: "",
      },
    },
  }
);

/*
 * Reuse the existing model during hot reloads/server restarts.
 */
export default mongoose.models.User ||
  mongoose.model<IUser>("User", userSchema);
