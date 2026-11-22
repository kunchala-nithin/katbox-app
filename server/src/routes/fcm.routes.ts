
import express from "express";
import { protect } from "../middleware/auth.middleware";
import {
  registerFCMDevice,
  unregisterFCMDevice,
} from "../controllers/fcm.controller";

const router = express.Router();

// All FCM device operations require a valid KatBox JWT.
router.use(protect);

router.post("/register", registerFCMDevice);
router.post("/unregister", unregisterFCMDevice);

export default router;
