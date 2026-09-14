import express from "express";
import multer from "multer";
import { protect } from "../controllers/chef.controller";
import {
  addChefCategory,
  updateChefCategory,
  deleteChefCategory,
  getChefCategories,
  saveCategoryItems,
  deleteChefCategoryImage,
  deleteSubCategory,
  deleteSingleItem,
  // Menu Controllers
  addChefMenu,
  updateChefMenu,
  deleteChefMenu,
  getChefMenus,
  saveDaawathCategories,
  deleteChefMenuImage,
  // Plan Controllers
  addChefPlan,
  updateChefPlan,
  deleteChefPlan,
  getChefPlans,
  deletePlanImage,
  savePlanMealBoxItems
} from "../controllers/chefCategory.controller";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 500,
  },
});

// ==========================================
// 1. CHEF MENU (CATERING) ROUTES (MUST BE BEFORE /:id WILDCARDS)
// ==========================================
router.delete("/menu/image", protect, deleteChefMenuImage);

router.post(
  "/menu/add",
  protect,
  upload.fields([
    { name: "heroImage", maxCount: 1 },
    { name: "itemImages", maxCount: 500 },
  ]),
  addChefMenu
);

router.put(
  "/menu/:id",
  protect,
  upload.fields([
    { name: "heroImage", maxCount: 1 },
    { name: "itemImages", maxCount: 500 },
  ]),
  updateChefMenu
);

router.post(
  "/menu/:id/daawath",
  protect,
  upload.array("images", 500),
  saveDaawathCategories
);

router.delete("/menu/:id", protect, deleteChefMenu);

// Both explicit and direct chef menu queries
router.get("/menu/chef/:chefId", getChefMenus);
router.get("/menu/:chefId", getChefMenus);

// ==========================================
// 2. CHEF PLAN ROUTES (MUST BE BEFORE /:id WILDCARDS)
// ==========================================
router.delete("/plan/image", protect, deletePlanImage);

router.post(
  "/plans/add",
  protect,
  upload.fields([{ name: "heroImage", maxCount: 1 }]),
  addChefPlan
);

router.put(
  "/plans/:id",
  protect,
  upload.fields([{ name: "heroImage", maxCount: 1 }]),
  updateChefPlan
);

router.post(
  "/plans/:id/mealbox",
  protect,
  upload.array("images", 500),
  savePlanMealBoxItems
);

router.delete("/plans/:id", protect, deleteChefPlan);
router.get("/plans/chef/:chefId", getChefPlans);
router.get("/plans/:chefId", getChefPlans);

// ==========================================
// 3. CHEF CATEGORY SPECIFIC SUB-ROUTES
// ==========================================
router.delete("/image", protect, deleteChefCategoryImage);
router.delete("/:categoryId/sub-category/:subCategoryId", protect, deleteSubCategory);
router.delete("/:categoryId/item/:itemId", protect, deleteSingleItem);

router.post(
  "/add",
  protect,
  upload.fields([{ name: "heroImage", maxCount: 1 }]),
  addChefCategory
);

router.post(
  "/:id/items",
  protect,
  upload.array("images", 100),
  saveCategoryItems
);

router.get("/chef/:chefId", getChefCategories);

// ==========================================
// 4. GENERIC CATEGORY WILDCARD ROUTES (LAST)
// ==========================================
router.put(
  "/:id",
  protect,
  upload.fields([{ name: "heroImage", maxCount: 1 }]),
  updateChefCategory
);

router.delete("/:id", protect, deleteChefCategory);

export default router;