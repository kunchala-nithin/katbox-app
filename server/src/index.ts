import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import connectDB from "./config/db";
import authRoutes from "./routes/auth.routes";
import protectedRoutes from "./routes/protected.routes";

import http from "http";
import { Server } from "socket.io";
import cartRoutes from "./routes/cart.routes";
import couponRoutes from "./routes/coupon.routes";
import chefRoutes from "./routes/chef.routes";

import chefCategoryRoutes from "./routes/chefCategory.routes";
import orderRoutes from "./routes/orders.routes";
import paymentRoutes from "./routes/payments.routes";

/*
 * ============================================================
 * ENVIRONMENT VALIDATION (runs once at server boot)
 * ============================================================
 *
 * We explicitly verify that all critical environment variables
 * are present BEFORE the server starts listening. This prevents
 * the app from booting in a half-configured state where a
 * request like /auth/send-otp would fail silently after a long
 * timeout.
 *
 * Any missing variable is logged clearly so it's obvious what
 * to fix in the .env / Render dashboard.
 * ============================================================
 */

const REQUIRED_ENV_VARS = [
  "MONGO_URI",
  "JWT_SECRET",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_VERIFY_SERVICE_SID",
];

const missingEnvVars: string[] = [];

for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key] || !String(process.env[key]).trim()) {
    missingEnvVars.push(key);
  }
}

if (missingEnvVars.length > 0) {
  console.error(
    "❌ Missing required environment variables:",
    missingEnvVars.join(", ")
  );
  console.error(
    "   The server will still start, but features depending on these " +
      "variables (like Twilio OTP) will fail until they are configured."
  );
} else {
  console.log("✅ All required environment variables are present.");
}

/*
 * Extra sanity check — Twilio prefixes.
 */
if (process.env.TWILIO_ACCOUNT_SID &&
    !process.env.TWILIO_ACCOUNT_SID.startsWith("AC")) {
  console.error(
    "❌ TWILIO_ACCOUNT_SID should start with 'AC'. " +
      "Current value starts with:",
    process.env.TWILIO_ACCOUNT_SID.substring(0, 2)
  );
}

if (process.env.TWILIO_VERIFY_SERVICE_SID &&
    !process.env.TWILIO_VERIFY_SERVICE_SID.startsWith("VA")) {
  console.error(
    "❌ TWILIO_VERIFY_SERVICE_SID should start with 'VA'. " +
      "Current value starts with:",
    process.env.TWILIO_VERIFY_SERVICE_SID.substring(0, 2)
  );
}

/*
 * ============================================================
 * APP + SERVER SETUP
 * ============================================================
 */

const app = express();

// ⭐ Create HTTP server
const server = http.createServer(app);

// ⭐ Create Socket.IO server
export const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/*
 * ============================================================
 * ROUTES
 * ============================================================
 */

app.use("/api/auth", authRoutes);
app.use("/auth", authRoutes);
app.use("/protected", protectedRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/coupon", couponRoutes);
app.use("/api/chefs", chefRoutes);
app.use("/api/chef-categories", chefCategoryRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);

/*
 * ============================================================
 * HEALTH CHECK
 * ============================================================
 *
 * Returns basic server status + a quick view of whether the
 * Twilio env vars are loaded (without exposing their values).
 * Useful when debugging "OTP not sending" issues from a
 * browser or Postman.
 * ============================================================
 */

app.get("/health", (_req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    twilio: {
      accountSidConfigured: !!process.env.TWILIO_ACCOUNT_SID,
      authTokenConfigured: !!process.env.TWILIO_AUTH_TOKEN,
      verifyServiceSidConfigured:
        !!process.env.TWILIO_VERIFY_SERVICE_SID,
    },
  });
});

/*
 * ============================================================
 * GLOBAL ERROR HANDLER
 * ============================================================
 *
 * Catches any unhandled route errors so the process doesn't
 * crash and clients receive a JSON response instead of a
 * hanging request.
 * ============================================================
 */

app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("❌ Unhandled server error:", err);

    if (res.headersSent) {
      return;
    }

    res.status(500).json({
      message: "Internal server error",
    });
  }
);

/*
 * ============================================================
 * DATABASE
 * ============================================================
 */

connectDB();

/*
 * ============================================================
 * SOCKET CONNECTION
 * ============================================================
 */

io.on("connection", (socket) => {
  console.log("⚡ Client connected:", socket.id);

  socket.on("join", (userId) => {
    socket.join(userId);
    console.log("User joined room:", userId);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

/*
 * ============================================================
 * START SERVER
 * ============================================================
 */

const PORT = process.env.PORT || 4000;

// ⭐ Use server.listen instead of app.listen
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});