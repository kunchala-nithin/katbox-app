/**
 * ============================================================
 * PHONE NUMBER UTILITIES (Indian)
 * ============================================================
 *
 * Normalizes and validates Indian mobile numbers into E.164
 * format (+91XXXXXXXXXX).
 *
 * ⚠️ IMPORTANT — DEPENDENCY-FREE IMPLEMENTATION
 * --------------------------------------------
 * The previous implementation imported
 * `parsePhoneNumberFromString` from `libphonenumber-js`.
 *
 * That library is excellent, but importing it introduces a
 * module-load failure mode: if the package isn't installed
 * (or is a version that doesn't export that named symbol),
 * `auth.routes.ts` crashes on `import { normalizeIndianPhone }
 * from "../utils/phone"` — which surfaces to the mobile client
 * as a "Unable to send OTP" error after a long delay.
 *
 * We now do the validation inline. Indian mobile numbers are
 * extremely well-defined:
 *
 *   • Country code: +91
 *   • Subscriber number: 10 digits
 *   • First digit: 6, 7, 8, or 9
 *
 * That's the entire rule set for the mobile (non-landline)
 * range. No external library is needed.
 *
 * If you later need to support additional countries, this
 * function should be extended (or replaced by a proper
 * library), but for Katbox's current scope this is sufficient
 * and strictly safer.
 * ============================================================
 */

/**
 * The regex for a valid Indian mobile number (subscriber part).
 *
 *   ^[6-9]  → first digit must be 6, 7, 8, or 9
 *   \d{9}$  → followed by exactly 9 more digits
 */
const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;

/**
 * ============================================================
 * NORMALIZE INDIAN PHONE
 * ============================================================
 *
 * Accepts any of the following:
 *
 *   "9133450555"         → 10-digit bare
 *   "09133450555"        → 11-digit with leading 0 (trunk prefix)
 *   "919133450555"       → 12-digit with country code
 *   "+919133450555"      → E.164
 *   "+91 91334 50555"    → with spaces
 *   "+91-91334-50555"    → with dashes
 *   "  +919133450555  "  → with surrounding whitespace
 *
 * Returns:
 *   "+919133450555"      on success
 *   null                 on any invalid input
 *
 * Never throws.
 * ============================================================
 */
export const normalizeIndianPhone = (
  rawPhone: string
): string | null => {
  /*
   * ----------------------------------------------------------
   * TYPE GUARD
   * ----------------------------------------------------------
   */
  if (!rawPhone || typeof rawPhone !== "string") {
    return null;
  }

  /*
   * ----------------------------------------------------------
   * STRIP NON-DIGITS (except leading +)
   * ----------------------------------------------------------
   *
   * We preserve the "+" so we can detect whether a country
   * code was explicitly provided.
   */
  const trimmed = rawPhone.trim();

  if (!trimmed) {
    return null;
  }

  const hadLeadingPlus = trimmed.startsWith("+");
  const digitsOnly = trimmed.replace(/\D/g, "");

  if (!digitsOnly) {
    return null;
  }

  /*
   * ----------------------------------------------------------
   * STRIP THE COUNTRY CODE / TRUNK PREFIX
   * ----------------------------------------------------------
   *
   * Case A: "+91XXXXXXXXXX" → 12 digits, starts with 91
   *         (only when the user explicitly typed "+")
   * Case B: "91XXXXXXXXXX"  → 12 digits, starts with 91
   * Case C: "0XXXXXXXXXX"   → 11 digits, starts with 0
   * Case D: "XXXXXXXXXX"    → 10 digits, no prefix
   *
   * We end up with exactly 10 subscriber digits.
   */
  let subscriberDigits = digitsOnly;

  if (subscriberDigits.length === 12 && subscriberDigits.startsWith("91")) {
    // Case A / B
    subscriberDigits = subscriberDigits.slice(2);
  } else if (subscriberDigits.length === 11 && subscriberDigits.startsWith("0")) {
    // Case C
    subscriberDigits = subscriberDigits.slice(1);
  } else if (hadLeadingPlus && subscriberDigits.length === 10) {
    // Case D with an explicit "+" but no country code
    // (e.g. "+9133450555" — technically wrong but common typo)
    // We treat it as a bare 10-digit number.
    subscriberDigits = subscriberDigits;
  } else if (subscriberDigits.length === 10) {
    // Case D — already correct
    subscriberDigits = subscriberDigits;
  } else {
    // Anything else (7, 8, 9, 13+ digits) is invalid.
    return null;
  }

  /*
   * ----------------------------------------------------------
   * FINAL VALIDATION
   * ----------------------------------------------------------
   *
   * After normalizing, we must have exactly 10 digits that
   * match the Indian mobile pattern ([6-9]\d{9}).
   */
  if (subscriberDigits.length !== 10) {
    return null;
  }

  if (!INDIAN_MOBILE_REGEX.test(subscriberDigits)) {
    return null;
  }

  /*
   * ----------------------------------------------------------
   * RETURN E.164
   * ----------------------------------------------------------
   */
  return `+91${subscriberDigits}`;
};

/**
 * ============================================================
 * ✅ NEW: IS VALID INDIAN PHONE
 * ============================================================
 *
 * Convenience boolean check. Useful for early form validation
 * on the client (though the client has its own mask).
 */
export const isValidIndianPhone = (
  rawPhone: string
): boolean => {
  return normalizeIndianPhone(rawPhone) !== null;
};

/**
 * ============================================================
 * ✅ NEW: FORMAT FOR DISPLAY
 * ============================================================
 *
 * Renders an E.164 number as a human-readable Indian format:
 *
 *   "+919133450555" → "+91 91334 50555"
 *
 * Returns the input unchanged if it can't be normalized.
 */
export const formatIndianPhoneForDisplay = (
  rawPhone: string
): string => {
  const normalized = normalizeIndianPhone(rawPhone);

  if (!normalized) {
    return rawPhone;
  }

  // normalized = "+91XXXXXXXXXX"
  const subscriber = normalized.slice(3); // strip "+91"

  return `+91 ${subscriber.slice(0, 5)} ${subscriber.slice(5)}`;
};