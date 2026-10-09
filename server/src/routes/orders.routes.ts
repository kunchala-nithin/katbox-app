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
  // ✅ Customer-initiated cancellation endpoint
  cancelOrderByCustomer,
  // ✅ NEW — Admin-only refund processor.
  //    Sets refundStatus = "Refunded" and refundedAt = now for a
  //    cancelled order whose refundAmount > 0. The customer's Bill
  //    Summary then flips from "Refund initiated — 3–4 hrs" to
  //    "Advance amount refunded".
  processRefund,
} from "../controllers/orders.controller";
import { protect } from "../middleware/auth.middleware";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/create", protect, upload.single("screenshot"), createOrder);
router.get("/my-orders", protect, getMyOrders);
router.get("/chef-orders", protect, getChefOrders);
router.get("/all", protect, getAllOrders);
router.get("/admin/orders", protect, getAllOrders);

// ✅ Customer-initiated cancellation.
//    • Ownership + status checks live inside the controller
//      (atomic findOneAndUpdate guarded by orderStatus: "Placed").
//    • Returns 200 with the updated order on success.
//    • Returns 400 with the professional "Cancellation and refund is not
//      possible. Please contact support." message when the order is
//      already Accepted / Preparing / anything beyond.
//    • Returns 403 / 404 / 409 for ownership / missing / race-loss cases.
router.patch("/:orderId/cancel", protect, cancelOrderByCustomer);

// ✅ NEW — Admin-only refund processor.
//    • Caller must have isAdmin === true (verified inside the controller).
//    • Only valid for a cancelled order whose refundAmount > 0 and whose
//      refundStatus is not already "Refunded".
//    • On success: refundStatus = "Refunded", refundedAt = now.
//    • Idempotent: returns 200 with the current state if already refunded.
router.patch("/:orderId/refund", protect, processRefund);

router.patch("/:orderId/status", protect, updateOrderStatus);
router.patch("/:orderId/schedule-status", protect, updateScheduleStatus);
router.patch("/:orderId/extend-timer", protect, extendOrderTimer);
router.patch("/:orderId/pause", protect, pauseOrderDelivery);
router.patch("/:orderId/unpause", protect, unpauseOrderDelivery);
router.patch("/:orderId/reschedule", protect, rescheduleOrderDelivery);
router.patch("/:orderId/verify-advance", protect, verifyAdvancePayment);
router.post("/:orderId/feedback", protect, upload.array("images", 5), submitOrderFeedback);
router.get("/:orderId", getOrderById);

export default router;