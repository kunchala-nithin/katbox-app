import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db";
import authRoutes from "./routes/auth.routes";
import protectedRoutes from "./routes/protected.routes";
import http from "http";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import cartRoutes from "./routes/cart.routes";
import couponRoutes from "./routes/coupon.routes";
import chefRoutes from "./routes/chef.routes";
import chefCategoryRoutes from "./routes/chefCategory.routes";
import orderRoutes from "./routes/orders.routes";
import paymentRoutes from "./routes/payments.routes";
import bannerRoutes from "./routes/banner.routes";
import websiteMessageRoutes from "./routes/websiteMessage.routes";
import assistantRoutes from "./routes/assistant.routes";
import { setSocketServer } from "./utils/socket";

dotenv.config();
const app = express();
const server = http.createServer(app);

export const io = new Server(server, { cors: { origin: "*" } });
setSocketServer(io);

// Authenticate Socket.IO clients when they provide a KatBox JWT.
// Existing non-role notification clients remain compatible with the
// legacy `join` event while the Chef app uses authenticated room joining.
io.use((socket, next) => {
  try {
    const rawToken = socket.handshake.auth?.token;
    if (!rawToken) return next();
    const secret = process.env.JWT_SECRET;
    if (!secret) return next(new Error("Server authentication configuration is incomplete"));
    const decoded = jwt.verify(String(rawToken), secret) as jwt.JwtPayload;
    const userId = decoded.userId;
    if (typeof userId !== "string") return next(new Error("Invalid authentication identity"));
    socket.data.userId = userId;
    return next();
  } catch {
    return next(new Error("Invalid or expired token"));
  }
});

app.use(cors());
app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/auth", authRoutes);
app.use("/protected", protectedRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/coupon", couponRoutes);
app.use("/api/chefs", chefRoutes);
app.use("/api/chef-categories", chefCategoryRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/banners", bannerRoutes);
app.use("/api/messages", websiteMessageRoutes);
app.use("/api/assistant", assistantRoutes);

connectDB();
app.route("/health")
  .get((_req, res) => res.status(200).json({ status: "OK" }))
  .head((_req, res) => res.status(200).end());

io.on("connection", (socket) => {
  console.log("⚡ Client connected:", socket.id);
  // A JWT-authenticated socket is automatically restricted to its own room.
  if (socket.data.userId) socket.join(String(socket.data.userId));

  // Legacy join support for existing order-notification clients.
  socket.on("join", (userId) => {
    if (socket.data.userId && String(userId) !== String(socket.data.userId)) return;
    if (!socket.data.userId) socket.join(String(userId));
    console.log("User joined room:", userId);
  });
  socket.on("disconnect", () => console.log("Client disconnected"));
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
