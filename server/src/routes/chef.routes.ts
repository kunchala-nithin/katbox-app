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
  updateChefByAdmin,
  deleteChefByAdmin,
} from "../controllers/chef.controller";

const router = express.Router();

// ============================================================
// MULTER — in-memory storage
// ============================================================
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 21,
  },
});

// ============================================================
// PUBLIC / CHEF-SELF ROUTES
// ============================================================

router.post(
  "/",
  protect,
  upload.fields([
    { name: "avatar", maxCount: 1 },
    { name: "banners", maxCount: 20 },
  ]),
  createOrUpdateChef
);

router.get("/my-chef", protect, getMyChef);

router.delete("/my-chef", protect, deleteChef);

router.post("/delete-image", protect, deleteChefImage);

// ============================================================
// CUSTOMER-FACING LIST
// ============================================================
router.get("/", getChefs);

// ============================================================
// ✅ ADMIN ROUTES (must be declared BEFORE /:chefId/*)
// ============================================================
// Order matters here:
//   1. /admin/all             → literal path, safe
//   2. /admin/:chefId/toggle-block → 3 segments, unambiguous
//   3. /admin/:chefId          → 2 segments, matches only admin edit
//   4. /admin/:chefId (DELETE) → 2 segments, matches only admin delete
//
// None of these collide with /:chefId/coupons or /:chefId/reviews
// because those require a literal second segment.
// ============================================================

// Admin: fetch EVERY chef (including blocked) with userIsChef/email/phone
router.get("/admin/all", protect, getAllChefsForAdmin);

// Admin: block / unblock a chef (toggles User.isChef)
router.patch("/admin/:chefId/toggle-block", protect, toggleChefBlockStatus);

// Admin: full profile edit
router.patch("/admin/:chefId", protect, updateChefByAdmin);

// Admin: permanent delete (runs full Cloudinary + menu cleanup)
router.delete("/admin/:chefId", protect, deleteChefByAdmin);

// ============================================================
// CHEF-LEVEL PUBLIC DATA
// ============================================================

router.get("/:chefId/coupons", getChefCoupons);

router.get("/:chefId/reviews", getChefReviews);

router.post("/apply-coupon", applyChefCoupon);

export default router;