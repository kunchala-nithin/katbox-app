import { Router } from "express";
import { protect } from "../middleware/auth.middleware";
import { requireAdmin } from "../middleware/requireAdmin";
import upload from "../middleware/upload";
import { getNotificationInbox, getNotificationRecipients, markAllNotificationsRead, markNotificationRead, sendCustomNotification, uploadNotificationImage } from "../controllers/adminNotifications.controller";

const router = Router();
router.get("/recipients", protect, requireAdmin, getNotificationRecipients);
router.post("/upload-image", protect, requireAdmin, upload.single("image"), uploadNotificationImage);
router.post("/send", protect, requireAdmin, sendCustomNotification);
router.get("/inbox", protect, getNotificationInbox);
router.patch("/inbox/read-all", protect, markAllNotificationsRead);
router.patch("/inbox/:id/read", protect, markNotificationRead);
export default router;
