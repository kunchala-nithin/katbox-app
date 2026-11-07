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
import { requireChef } from "../middleware/requireChef";
import { requireAdmin } from "../middleware/requireAdmin";

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024, files: 41 } });

// Chef profile and private operations require a currently approved MongoDB role.
router.post(
  "/",
  protect,
  requireChef,
  upload.fields([
    { name: "avatar", maxCount: 1 },
    { name: "banners", maxCount: 20 },
    { name: "kitchenImages", maxCount: 20 },
  ]),
  createOrUpdateChef
);
router.get("/my-chef", protect, requireChef, getMyChef);
router.delete("/my-chef", protect, requireChef, deleteChef);
router.post("/delete-image", protect, requireChef, deleteChefImage);

// Customer-facing public endpoints.
router.get("/", getChefs);
router.get("/:chefId/coupons", getChefCoupons);
router.get("/:chefId/reviews", getChefReviews);
router.post("/apply-coupon", applyChefCoupon);

// Every admin endpoint verifies isAdmin from MongoDB, not a client-supplied role.
router.get("/admin/all", protect, requireAdmin, getAllChefsForAdmin);
router.patch("/admin/:chefId/toggle-block", protect, requireAdmin, toggleChefBlockStatus);
router.patch("/admin/:chefId", protect, requireAdmin, updateChefByAdmin);
router.delete("/admin/:chefId", protect, requireAdmin, deleteChefByAdmin);
router.post("/admin/:chefId/coupons", protect, requireAdmin, addChefCouponByAdmin);
router.delete("/admin/:chefId/coupons/:couponId", protect, requireAdmin, deleteChefCouponByAdmin);

export default router;
