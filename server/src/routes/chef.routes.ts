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
  getAllChefsForAdmin,
  toggleChefBlockStatus,
  updateChefByAdmin,
  deleteChefByAdmin,
  addChefCouponByAdmin,
  deleteChefCouponByAdmin,
} from "../controllers/chef.controller";

const router = express.Router();

const storage = multer.memoryStorage();

// One avatar + up to 20 banner images + up to 20 kitchen images.
// Keep both per-file and total-file limits to protect memory usage.
const upload = multer({
  storage,
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 41,
  },
});

// Create or update the authenticated chef's profile.
router.post(
  "/",
  protect,
  upload.fields([
    { name: "avatar", maxCount: 1 },
    { name: "banners", maxCount: 20 },
    { name: "kitchenImages", maxCount: 20 },
  ]),
  createOrUpdateChef
);

// Get the authenticated chef's profile.
router.get("/my-chef", protect, getMyChef);

// Delete the authenticated chef's profile.
router.delete("/my-chef", protect, deleteChef);

// Delete a chef image from Cloudinary.
router.post("/delete-image", protect, deleteChefImage);

// Customer-facing chef list.
// Pass selected delivery coordinates to calculate distance:
// GET /api/chefs?latitude=17.44&longitude=78.39&radiusKm=10
router.get("/", getChefs);

// Admin routes are declared before parameterized chef routes.
router.get("/admin/all", protect, getAllChefsForAdmin);
router.patch("/admin/:chefId/toggle-block", protect, toggleChefBlockStatus);
router.patch("/admin/:chefId", protect, updateChefByAdmin);
router.delete("/admin/:chefId", protect, deleteChefByAdmin);
router.post("/admin/:chefId/coupons", protect, addChefCouponByAdmin);
router.delete(
  "/admin/:chefId/coupons/:couponId",
  protect,
  deleteChefCouponByAdmin
);

// Chef-level public data.
router.get("/:chefId/coupons", getChefCoupons);
router.get("/:chefId/reviews", getChefReviews);
router.post("/apply-coupon", applyChefCoupon);

export default router;
