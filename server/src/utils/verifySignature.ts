import crypto from "crypto";

interface VerifySignatureParams {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

/**
 * Validates Razorpay Payment Signature using Cryptographic HMAC-SHA256
 */
export const verifyRazorpaySignature = ({
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
}: VerifySignatureParams): boolean => {
  const secret = process.env.RAZORPAY_KEY_SECRET || "";

  if (!secret) {
    console.error("CRITICAL ERROR: Missing RAZORPAY_KEY_SECRET in environment variables.");
    return false;
  }

  // HMAC SHA256 payload = razorpay_order_id + "|" + razorpay_payment_id
  const generatedSignature = crypto
    .createHmac("sha256", secret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  return generatedSignature === razorpaySignature;
};