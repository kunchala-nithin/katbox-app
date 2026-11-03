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
  cancelOrderByCustomer,
  processRefund,
} from "../controllers/orders.controller";
import { protect } from "../middleware/auth.middleware";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

/* ─────────────────────────────────────────────────────────────────
   UPCOMING DELIVERIES / PER-DATE STATUS FLOW

   MealBox orders persist upcomingDeliveries and matching deliverySchedules.
   Each schedule owns its date and status. Razorpay payment verification is
   handled only by the protected payments verification endpoint.

   RAZORPAY PAYMENT FLOW
   1. POST /create saves the KatBox order in MongoDB as Payment Pending.
   2. POST /api/payments/create-order creates a Razorpay order for the
      server-calculated advance or full amount saved on that KatBox order.
   3. POST /api/payments/verify verifies the signature and captured amount,
      updates the same MongoDB order, and notifies the assigned chef.

   Do not add the old /:orderId/verify-advance endpoint here.
   ───────────────────────────────────────────────────────────────── */

// Create the KatBox order first. Supports JSON requests and the
// existing multipart feedback/screenshot-compatible request format.
router.post("/create", protect, upload.single("screenshot"), createOrder);

router.get("/my-orders", protect, getMyOrders);
router.get("/chef-orders", protect, getChefOrders);
router.get("/all", protect, getAllOrders);
router.get("/admin/orders", protect, getAllOrders);

// Customer-initiated cancellation.
router.patch("/:orderId/cancel", protect, cancelOrderByCustomer);

// Admin-only refund processor.
router.patch("/:orderId/refund", protect, processRefund);

// Whole-order status update.
router.patch("/:orderId/status", protect, updateOrderStatus);

// Per-delivery-date status update.
router.patch("/:orderId/schedule-status", protect, updateScheduleStatus);

router.patch("/:orderId/extend-timer", protect, extendOrderTimer);

// Customer-facing per-date mealbox scheduling actions.
router.patch("/:orderId/pause", protect, pauseOrderDelivery);
router.patch("/:orderId/unpause", protect, unpauseOrderDelivery);
router.patch("/:orderId/reschedule", protect, rescheduleOrderDelivery);

// Customer feedback with up to five uploaded images.
router.post(
  "/:orderId/feedback",
  protect,
  upload.array("images", 5),
  submitOrderFeedback,
);

// Fetch one order. Kept in its existing position/behavior for compatibility.
router.get("/:orderId", getOrderById);

export default router;
