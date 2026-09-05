import { rateLimit } from 'express-rate-limit';

export const otpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    message: "Too many OTP requests from this IP, please try again after 15 minutes",
  },
});