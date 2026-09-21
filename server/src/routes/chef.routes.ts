import express from "express";
import multer from "multer";
import {
  createOrUpdateChef,
  deleteChef,
  getChefs,
  getMyChef,
  getChefCoupons,
  getChefReviews,
  applyChefCoupon,
  deleteChefImage,
  protect,
  // ✅ NEW: admin-only controller imports
  getAllChefsForAdmin,
  toggleChefBlockStatus,
} from "../controllers/chef.controller";

const router = express.Router();

// ============================================================
// MULTER — in-memory storage
// ============================================================
// Files are buffered in memory and then streamed straight to
// Cloudinary by the controller. This avoids writing to disk
// on the server (which is important for Render / Heroku).
// ============================================================
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    // 8 MB per file — generous enough for banners
    fileSize: 8 * 1024 * 1024,
    // 1 avatar + up to 20 banners
    files: 21,
  },
});

// ============================================================
// PUBLIC / CHEF-SELF ROUTES
// ============================================================

// Create or update the logged-in chef's own profile
// (multipart/form-data with optional avatar + banners)
router.post(
  "/",
  protect,
  upload.fields([
    { name: "avatar", maxCount: 1 },
    { name: "banners", maxCount: 20 },
  ]),
  createOrUpdateChef
);

// Get the logged-in chef's own profile
router.get("/my-chef", protect, getMyChef);

// Permanently delete the logged-in chef + ALL related data
router.delete("/my-chef", protect, deleteChef);

// Delete a single Cloudinary image by publicId
router.post("/delete-image", protect, deleteChefImage);

// ============================================================
// CUSTOMER-FACING LIST
// ============================================================
// Returns ALL non-blocked chefs.
// Chefs whose linked User.isChef === false are HIDDEN here.
// Used by: Home.tsx, AllChefCards.tsx, ChefInfoScreen.tsx, etc.
// ============================================================
router.get("/", getChefs);

// ============================================================
// ✅ NEW: ADMIN ROUTES
// ============================================================
// Both routes are protected by the same `protect` middleware
// used elsewhere. If you later add a dedicated admin guard
// (e.g. `requireAdmin`), insert it here:
//
//   import { requireAdmin } from "../middleware/admin.middleware";
//   router.get("/admin/all", protect, requireAdmin, getAllChefsForAdmin);
//
// ============================================================

// Admin: fetch EVERY chef including blocked ones, with
// `userIsChef`, `userEmail`, `userPhone` attached.
router.get("/admin/all", protect, getAllChefsForAdmin);

// Admin: toggle (or force-set) the linked User's isChef flag.
// Body (optional): { isChef: boolean }
router.patch("/admin/:chefId/toggle-block", protect, toggleChefBlockStatus);

// ============================================================
// CHEF-LEVEL PUBLIC DATA
// ============================================================

// Get a specific chef's active coupons
router.get("/:chefId/coupons", getChefCoupons);

// Get a specific chef's reviews + rating breakdown
router.get("/:chefId/reviews", getChefReviews);

// Apply a specific chef's coupon (with service-type guard)
router.post("/apply-coupon", applyChefCoupon);

export default router;