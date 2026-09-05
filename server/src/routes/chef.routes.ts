import express from "express";
import { 
  createOrUpdateChef, 
  getChefs, 
  getMyChef, 
  protect,
  deleteChefImage,
  deleteChef 
} from "../controllers/chef.controller";

import multer from "multer";

const router = express.Router();

// Use memory storage for clean buffer ingestion
const upload = multer({ storage: multer.memoryStorage() });

// Apply protection to all routes
router.use(protect);

// Specific delete image route MUST come BEFORE any dynamic route
router.delete("/image", protect, deleteChefImage);

// Full cascade delete for chef + all menus + ALL Cloudinary images
router.delete("/my-chef", deleteChef);

// Multi-field upload supporting single avatar and unlimited banners
router.post(
  "/",
  upload.fields([
    { name: "avatar", maxCount: 1 },
    { name: "banners", maxCount: 20 },
  ]),
  createOrUpdateChef
);

router.get("/", getChefs);
router.get("/my-chef", getMyChef);

export default router;