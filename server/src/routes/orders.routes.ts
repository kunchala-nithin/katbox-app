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

/* ─────────────────────────────────────────────────────────────────
   ✅ UPCOMING DELIVERIES / PER-DATE STATUS FLOW
   ─────────────────────────────────────────────────────────────────

   The mealbox flow persists an array of upcoming delivery dates on
   the order document (`upcomingDeliveries: string[]`), AND a
   matching `deliverySchedules` array where EACH entry carries its
   OWN `date` and `status`.

   The endpoints involved:

     • POST   /create
         Persists `upcomingDeliveries` (sorted ascending) and builds
         a `deliverySchedules` entry per date, all starting with
         status = "Scheduled". Called once at order placement.

     • PATCH  /:orderId/schedule-status
         Updates ONE delivery date's status WITHOUT touching the
         other dates. Called by the customer Pause/Resume actions,
         by the chef /all-orders.tsx individual-status dropdown,
         and by the admin /all-orders.tsx individual-status dropdown.

     • PATCH  /:orderId/status
         Updates the WHOLE order's status. On "Cash Collected" it
         auto-marks every still-open schedule as "Delivered".

     • PATCH  /:orderId/pause
     • PATCH  /:orderId/unpause
     • PATCH  /:orderId/reschedule
         Customer-facing per-date scheduling actions for the mealbox
         flow. All three call `markModified("deliverySchedules")` so
         the changes are always persisted.

   Downstream consumers of these fields (all read them DYNAMICALLY
   per-date, so each delivery card shows its own current status):

     • OrderConfirmationScreen  → "Upcoming Deliveries" section
     • Orders tab               → "Upcoming Deliveries" section
     • admin/all-orders.tsx     → "Delivery Schedules" section
     • chef/all-orders.tsx      → "Upcoming Delivery Schedules" section
   ───────────────────────────────────────────────────────────────── */

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

// ✅ Updates the WHOLE order's status. On "Cash Collected" it auto-marks
//    every still-open schedule as "Delivered". Also used by the chef and
//    admin screens to Accept / Decline / progress the order as a whole.
router.patch("/:orderId/status", protect, updateOrderStatus);

// ✅ Updates ONE delivery date's status WITHOUT touching the other dates.
//    This is the endpoint that powers the per-date status on each
//    upcoming-delivery card in the customer Orders tab, admin all-orders,
//    and chef all-orders screens.
router.patch("/:orderId/schedule-status", protect, updateScheduleStatus);

router.patch("/:orderId/extend-timer", protect, extendOrderTimer);

// ✅ Customer-facing per-date scheduling actions for the mealbox flow.
router.patch("/:orderId/pause", protect, pauseOrderDelivery);
router.patch("/:orderId/unpause", protect, unpauseOrderDelivery);
router.patch("/:orderId/reschedule", protect, rescheduleOrderDelivery);

router.patch("/:orderId/verify-advance", protect, verifyAdvancePayment);
router.post("/:orderId/feedback", protect, upload.array("images", 5), submitOrderFeedback);
router.get("/:orderId", getOrderById);

export default router;