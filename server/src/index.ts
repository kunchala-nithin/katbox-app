import express from "express";
import cors from "cors";
import dotenv from "dotenv";
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

dotenv.config();

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
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/auth", authRoutes);
app.use("/protected", protectedRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/coupon", couponRoutes);
app.use("/api/chefs", chefRoutes);
app.use("/api/chef-categories", chefCategoryRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);

// Connect DB
connectDB();

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "OK" });
});

// ⭐ Socket connection
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

const PORT = process.env.PORT || 4000;

// ⭐ Use server.listen instead of app.listen
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});