
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

  // Coupon management
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

// Create or update the authenticated chef's profile.
// Supports an avatar and multiple banner images.
router.post(
  "/",
  protect,
  upload.fields([
    { name: "avatar", maxCount: 1 },
    { name: "banners", maxCount: 20 },
  ]),
  createOrUpdateChef
);

// Get the authenticated chef's profile.
router.get("/my-chef", protect, getMyChef);

// Delete the authenticated chef's profile.
router.delete("/my-chef", protect, deleteChef);

// Delete a chef image from Cloudinary.
router.post("/delete-image", protect, deleteChefImage);

// ============================================================
// CUSTOMER-FACING CHEF LIST
// ============================================================

// Get chefs.
//
// Optional query parameters for nearby-chef discovery:
// latitude  = customer's selected delivery latitude
// longitude = customer's selected delivery longitude
// radiusKm  = search radius in kilometres (default intended: 5)
//
// Example:
// GET /api/chefs?latitude=17.44&longitude=78.39&radiusKm=5
//
// Distance filtering and sorting must be implemented in getChefs
// inside chef.controller.ts.
router.get("/", getChefs);

// ============================================================
// ADMIN ROUTES
// Declare these before parameterized chef routes.
// ============================================================

// Fetch all chefs, including blocked chefs.
router.get("/admin/all", protect, getAllChefsForAdmin);

// Block or unblock a chef.
router.patch(
  "/admin/:chefId/toggle-block",
  protect,
  toggleChefBlockStatus
);

// Update a chef profile as an admin.
router.patch("/admin/:chefId", protect, updateChefByAdmin);

// Permanently delete a chef as an admin.
router.delete("/admin/:chefId", protect, deleteChefByAdmin);

// Add a coupon to a chef as an admin.
router.post(
  "/admin/:chefId/coupons",
  protect,
  addChefCouponByAdmin
);

// Delete a chef coupon as an admin.
router.delete(
  "/admin/:chefId/coupons/:couponId",
  protect,
  deleteChefCouponByAdmin
);

// ============================================================
// CHEF-LEVEL PUBLIC DATA
// ============================================================

// Get a chef's coupons.
router.get("/:chefId/coupons", getChefCoupons);

// Get a chef's reviews.
router.get("/:chefId/reviews", getChefReviews);

// Apply a chef coupon.
router.post("/apply-coupon", applyChefCoupon);

export default router;
