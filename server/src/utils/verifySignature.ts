import crypto from "crypto";

interface VerifySignatureParams {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

/**
 * Verify Razorpay's checkout signature using the backend-only key secret.
 * Uses a constant-time comparison and rejects malformed/missing signatures.
 */
export const verifyRazorpaySignature = ({
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
}: VerifySignatureParams): boolean => {
  const secret = process.env.RAZORPAY_KEY_SECRET || "";
  if (!secret || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) return false;

  const generatedSignature = crypto
    .createHmac("sha256", secret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  const provided = String(razorpaySignature).trim();
  if (!/^[a-fA-F0-9]{64}$/.test(provided)) return false;

  const expectedBuffer = Buffer.from(generatedSignature, "hex");
  const providedBuffer = Buffer.from(provided, "hex");
  return expectedBuffer.length === providedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, providedBuffer);
};
