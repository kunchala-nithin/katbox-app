import mongoose from "mongoose";

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
  },
  type: {
    type: String,
    enum: ["FLAT", "PERCENT"],
    required: true,
  },
  value: {
    type: Number,
    required: true,
  },
  minOrder: {
    type: Number,
    default: 0,
  },
  maxDiscount: {
    type: Number,
    default: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  expiry: Date,
});

export default mongoose.model("Coupon", couponSchema);