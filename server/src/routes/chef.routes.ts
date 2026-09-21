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
  // Admin-only controller imports
  getAllChefsForAdmin,
  toggleChefBlockStatus,
  updateChefByAdmin,
  deleteChefByAdmin,
  // ✅ NEW: coupon management
  addChefCouponByAdmin,
  deleteChefCouponByAdmin,
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
// ✅ ADMIN ROUTES (declared BEFORE /:chefId/* to avoid collisions)
// ============================================================

// Admin: fetch EVERY chef (including blocked) with userIsChef/email/phone
router.get("/admin/all", protect, getAllChefsForAdmin);

// Admin: block / unblock a chef (toggles User.isChef)
router.patch("/admin/:chefId/toggle-block", protect, toggleChefBlockStatus);

// Admin: full profile edit
router.patch("/admin/:chefId", protect, updateChefByAdmin);

// Admin: permanent delete
router.delete("/admin/:chefId", protect, deleteChefByAdmin);

// ✅ NEW: Admin coupon management
router.post("/admin/:chefId/coupons", protect, addChefCouponByAdmin);
router.delete("/admin/:chefId/coupons/:couponId", protect, deleteChefCouponByAdmin);

// ============================================================
// CHEF-LEVEL PUBLIC DATA
// ============================================================

router.get("/:chefId/coupons", getChefCoupons);

router.get("/:chefId/reviews", getChefReviews);

router.post("/apply-coupon", applyChefCoupon);

export default router;