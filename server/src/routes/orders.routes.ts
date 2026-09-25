// orders.routes.ts
import { Router } from "express";
import multer from "multer";
import {
  createOrder,
  getOrderById,
  getMyOrders,
  getChefOrders,
  getAllOrders,
  updateOrderStatus,
  updateScheduleStatus,
  pauseOrderDelivery,
  unpauseOrderDelivery,
  rescheduleOrderDelivery,
  extendOrderTimer,
  submitOrderFeedback,
  verifyAdvancePayment,
  // ✅ NEW: Admin-gated acceptance endpoint
  acceptOrderByAdmin,
  // ✅ NEW: Chef-gated acceptance endpoint
  chefAcceptOrder,
} from "../controllers/orders.controller";
import { protect } from "../middleware/auth.middleware";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/create", protect, upload.single("screenshot"), createOrder);
router.get("/my-orders", protect, getMyOrders);
router.get("/chef-orders", protect, getChefOrders);
router.get("/all", protect, getAllOrders);
router.get("/admin/orders", protect, getAllOrders);
router.patch("/:orderId/status", protect, updateOrderStatus);
router.patch("/:orderId/schedule-status", protect, updateScheduleStatus);
router.patch("/:orderId/extend-timer", protect, extendOrderTimer);
router.patch("/:orderId/pause", protect, pauseOrderDelivery);
router.patch("/:orderId/unpause", protect, unpauseOrderDelivery);
router.patch("/:orderId/reschedule", protect, rescheduleOrderDelivery);
router.patch("/:orderId/verify-advance", protect, verifyAdvancePayment);

// ✅ Admin clicks "Accept Order" — for COD orders.
// Must be registered BEFORE the generic `/:orderId` GET route below
// so Express does not accidentally treat "admin-accept" as an order id.
router.patch("/:orderId/admin-accept", protect, acceptOrderByAdmin);

// ✅ NEW: Chef clicks "Accept Order" — for QuickBites/Homemade ONLINE orders.
// Must be registered BEFORE the generic `/:orderId` GET route below.
router.patch("/:orderId/chef-accept", protect, chefAcceptOrder);

router.post("/:orderId/feedback", protect, upload.array("images", 5), submitOrderFeedback);
router.get("/:orderId", getOrderById);

export default router;