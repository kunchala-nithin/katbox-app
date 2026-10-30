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
  // Customer-initiated cancellation endpoint
  cancelOrderByCustomer,
  // Admin-only refund processor
  processRefund,
} from "../controllers/orders.controller";
import { protect } from "../middleware/auth.middleware";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

/* ─────────────────────────────────────────────────────────────────
   UPCOMING DELIVERIES / PER-DATE STATUS FLOW
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
         by the chef /all-orders.tsx individual-status dropdown, and
         by the admin /all-orders.tsx individual-status dropdown.

     • PATCH  /:orderId/status
         Updates the WHOLE order's status. On "Cash Collected" it
         auto-marks every still-open schedule as "Delivered".

     • PATCH  /:orderId/pause
     • PATCH  /:orderId/unpause
     • PATCH  /:orderId/reschedule
         Customer-facing per-date scheduling actions for the mealbox
         flow. All three call `markModified("deliverySchedules")` so
         the changes are always persisted.

   Downstream consumers of these fields read them dynamically per-date:

     • OrderConfirmationScreen  → "Upcoming Deliveries" section
     • Orders tab               → "Upcoming Deliveries" section
     • admin/all-orders.tsx     → "Delivery Schedules" section
     • chef/all-orders.tsx      → "Upcoming Delivery Schedules" section

   RAZORPAY PAYMENT FLOW
   ─────────────────────────────────────────────────────────────────

     1. POST /create
        Creates the KatBox order in MongoDB with paymentStatus
        "Payment Pending". This happens BEFORE opening Razorpay so
        every payment attempt is linked to a real KatBox orderId.

     2. POST /api/payments/create-order
        Creates a Razorpay order for the full order total, using the
        existing KatBox orderId. This endpoint is mounted separately
        in payments.routes.ts and must use authentication middleware.

     3. POST /api/payments/verify
        Verifies the Razorpay signature and captured amount on the
        backend. On success, it marks the same MongoDB order as Paid
        and notifies the chef. No admin manual payment verification
        is required for Razorpay orders.

   NOTE: Do not add the old /:orderId/verify-advance endpoint here.
   Razorpay payment confirmation is handled only by the protected
   payments verification endpoint above.
   ───────────────────────────────────────────────────────────────── */

// Create the KatBox order first. Supports JSON requests and the
// existing multipart feedback/screenshot-compatible request format.
router.post("/create", protect, upload.single("screenshot"), createOrder);

router.get("/my-orders", protect, getMyOrders);
router.get("/chef-orders", protect, getChefOrders);
router.get("/all", protect, getAllOrders);
router.get("/admin/orders", protect, getAllOrders);

// Customer-initiated cancellation.
// Ownership + status checks live inside the controller.
router.patch("/:orderId/cancel", protect, cancelOrderByCustomer);

// Admin-only refund processor.
// Admin authorization and refund eligibility are checked in the controller.
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
