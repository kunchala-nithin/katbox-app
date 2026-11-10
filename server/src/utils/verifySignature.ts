
import crypto from "crypto";

interface VerifySignatureParams {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

/**
 * Verify Razorpay's Checkout signature using the backend-only
 * RAZORPAY_KEY_SECRET.
 *
 * Security:
 * 1. Rejects missing or invalid parameters.
 * 2. Validates the Razorpay signature's hexadecimal format.
 * 3. Generates the expected HMAC-SHA256 signature.
 * 4. Uses constant-time comparison to prevent timing attacks.
 *
 * IMPORTANT:
 * RAZORPAY_KEY_SECRET must only exist on the backend.
 * Never expose it in the React Native application.
 */
export const verifyRazorpaySignature = ({
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
}: VerifySignatureParams): boolean => {
  try {
    const secret = process.env.RAZORPAY_KEY_SECRET || "";

    // Validate backend secret and required parameters.
    if (
      !secret ||
      !razorpayOrderId ||
      !razorpayPaymentId ||
      !razorpaySignature
    ) {
      return false;
    }

    // Normalize incoming values.
    const orderId = String(razorpayOrderId).trim();
    const paymentId = String(razorpayPaymentId).trim();
    const providedSignature = String(razorpaySignature).trim();

    if (!orderId || !paymentId || !providedSignature) {
      return false;
    }

    // Razorpay Checkout signatures must be 64 hexadecimal characters.
    if (!/^[a-fA-F0-9]{64}$/.test(providedSignature)) {
      return false;
    }

    // Generate the expected HMAC-SHA256 signature.
    const generatedSignature = crypto
      .createHmac("sha256", secret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    const expectedBuffer = Buffer.from(generatedSignature, "hex");
    const providedBuffer = Buffer.from(providedSignature, "hex");

    // Ensure both buffers have the same length before comparison.
    if (expectedBuffer.length !== providedBuffer.length) {
      return false;
    }

    // Constant-time comparison.
    return crypto.timingSafeEqual(
      expectedBuffer,
      providedBuffer
    );
  } catch (error) {
    console.error("Razorpay signature verification error:", error);
    return false;
  }
};
