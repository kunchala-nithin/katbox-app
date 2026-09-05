import { Router } from "express";
import {
  createOrder,
  getOrderById,
  getMyOrders,
  getChefOrders,
  updateOrderStatus,
  pauseOrderDelivery,
  unpauseOrderDelivery,
  rescheduleOrderDelivery,
  extendOrderTimer,
} from "../controllers/orders.controller";
import { protect } from "../middleware/auth.middleware";

const router = Router();

router.post("/create", protect, createOrder);
router.get("/my-orders", protect, getMyOrders);
router.get("/chef-orders", protect, getChefOrders);
router.patch("/:orderId/status", protect, updateOrderStatus);
router.patch("/:orderId/extend-timer", protect, extendOrderTimer);
router.patch("/:orderId/pause", protect, pauseOrderDelivery);
router.patch("/:orderId/unpause", protect, unpauseOrderDelivery);
router.patch("/:orderId/reschedule", protect, rescheduleOrderDelivery);
router.get("/:orderId", getOrderById);

export default router;