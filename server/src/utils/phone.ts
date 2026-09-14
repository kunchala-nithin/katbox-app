import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Normalizes and validates an Indian phone number into E.164 format (+91XXXXXXXXXX).
 * Rejects invalid strings, short numbers, or unsupported country codes.
 */
export const normalizeIndianPhone = (rawPhone: string): string | null => {
  if (!rawPhone || typeof rawPhone !== 'string') return null;

  let cleaned = rawPhone.trim();

  // If it doesn't start with +, assume Indian number if 10 digits
  if (!cleaned.startsWith('+')) {
    if (cleaned.length === 10) {
      cleaned = `+91${cleaned}`;
    } else if (cleaned.length === 12 && cleaned.startsWith('91')) {
      cleaned = `+${cleaned}`;
    }
  }

  const phoneNumber = parsePhoneNumberFromString(cleaned);

  if (!phoneNumber || !phoneNumber.isValid()) {
    return null;
  }

  // Ensure it's specifically an Indian number for now
  if (phoneNumber.country !== 'IN') {
    return null;
  }

  return phoneNumber.format('E.164'); // e.g., +919876543210
};