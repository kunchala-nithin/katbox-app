import { Request, Response } from "express";
import mongoose from "mongoose";
import cloudinary from "../config/cloudinary";
import User from "../models/User";
import FCMDevice from "../models/FCMDevices";
import UserNotification, { NotificationDestination } from "../models/UserNotification";
import { getFirebaseMessaging } from "../config/firebaseAdmin";
import type { AuthRequest } from "../middleware/auth.middleware";

const destinations: NotificationDestination[] = ["home", "orders", "profile", "chef_orders", "chef_profile"];
const NOTIFICATION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const asStringData = (data: Record<string, unknown>) => Object.fromEntries(Object.entries(data).filter(([,v]) => v !== undefined && v !== null).map(([k,v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));

export const uploadNotificationImage = async (req: Request, res: Response) => {
  try {
    const file = (req as any).file;
    if (!file?.buffer) return res.status(400).json({ success: false, message: "Choose an image from your gallery first." });
    if (!String(file.mimetype || "").startsWith("image/")) return res.status(400).json({ success: false, message: "Only image files are supported." });
    if (file.size > 8 * 1024 * 1024) return res.status(413).json({ success: false, message: "Image must be 8 MB or smaller." });
    const result: any = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ folder: "katbox/notifications", resource_type: "image", quality: "auto:good", fetch_format: "auto" }, (error, uploaded) => error ? reject(error) : resolve(uploaded));
      stream.end(file.buffer);
    });
    return res.status(201).json({ success: true, imageUrl: result.secure_url, publicId: result.public_id });
  } catch (error: any) {
    console.error("[Admin notifications] Image upload failed:", error);
    return res.status(500).json({ success: false, message: error?.message || "Cloudinary image upload failed." });
  }
};

export const getNotificationRecipients = async (req: AuthRequest, res: Response) => {
  try {
    const role = String(req.query.role || "all");
    const search = String(req.query.search || "").trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const filter: any = { isAdmin: { $ne: true } };
    if (role === "customer") filter.isChef = false;
    if (role === "chef") filter.isChef = true;
    if (search) filter.$or = [{ name: { $regex: search, $options: "i" } }, { phone: { $regex: search, $options: "i" } }, { email: { $regex: search, $options: "i" } }];
    const users = await User.find(filter).select("name phone email isChef").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean();
    const activeIds = await FCMDevice.distinct("userId", { enabled: true, userId: { $in: users.map(u => u._id) } });
    const active = new Set(activeIds.map(String));
    return res.json({ success: true, data: users.filter(u => active.has(String(u._id))).map(u => ({ id: String(u._id), name: u.name || "KatBox user", phone: u.phone || "", email: u.email || "", role: u.isChef ? "chef" : "customer" })) });
  } catch (error: any) {
    console.error("[Admin notifications] Recipient lookup failed:", error);
    return res.status(500).json({ success: false, message: error?.message || "Unable to load notification recipients." });
  }
};

export const sendCustomNotification = async (req: AuthRequest, res: Response) => {
  try {
    const title = String(req.body.title || "").trim();
    const message = String(req.body.message || "").trim();
    const imageUrl = String(req.body.imageUrl || "").trim();
    const requestedPublicId = String(req.body.imagePublicId || "").trim();
    const audience = String(req.body.audience || "");
    const destination = req.body.destination ? String(req.body.destination) : undefined;
    const userIds: string[] = Array.isArray(req.body.userIds) ? req.body.userIds.map((value: unknown) => String(value)) : [];
    if (!title || title.length > 100 || !message || message.length > 1000) return res.status(400).json({ success: false, message: "Enter a title (up to 100 characters) and message (up to 1,000 characters)." });
    if (!["customers", "chefs", "both", "selected"].includes(audience)) return res.status(400).json({ success: false, message: "Choose a valid audience." });
    if (destination && !destinations.includes(destination as NotificationDestination)) return res.status(400).json({ success: false, message: "Choose a valid KatBox destination." });
    if (imageUrl && !/^https:\/\//i.test(imageUrl)) return res.status(400).json({ success: false, message: "The uploaded image URL is invalid." });
    if (audience === "selected" && (!userIds.length || userIds.some(id => !mongoose.Types.ObjectId.isValid(id)))) return res.status(400).json({ success: false, message: "Select at least one valid recipient." });

    let imagePublicId = requestedPublicId;
    if (imageUrl) {
      try {
        const parsed = new URL(imageUrl);
        const path = decodeURIComponent(parsed.pathname);
        const marker = "/image/upload/";
        const uploadIndex = path.indexOf(marker);
        const segments = uploadIndex >= 0 ? path.slice(uploadIndex + marker.length).split("/").filter(Boolean) : [];
        const folderIndex = segments.findIndex((_part, index) => segments[index] === "katbox" && segments[index + 1] === "notifications");
        const derived = folderIndex >= 0 ? segments.slice(folderIndex).join("/").replace(/\.[^/.]+$/, "") : "";
        if (parsed.protocol !== "https:" || !parsed.hostname.endsWith("cloudinary.com") || !derived.startsWith("katbox/notifications/")) {
          return res.status(400).json({ success: false, message: "The image must be uploaded to KatBox notifications in Cloudinary." });
        }
        if (imagePublicId && imagePublicId !== derived) return res.status(400).json({ success: false, message: "The image URL and Cloudinary public ID do not match." });
        imagePublicId = derived;
      } catch {
        return res.status(400).json({ success: false, message: "The uploaded image URL is invalid." });
      }
    } else if (imagePublicId) {
      return res.status(400).json({ success: false, message: "An image public ID was provided without an image URL." });
    }

    const userFilter: any = { isAdmin: { $ne: true } };
    if (audience === "customers") userFilter.isChef = false;
    if (audience === "chefs") userFilter.isChef = true;
    if (audience === "selected") userFilter._id = { $in: userIds };
    const users = await User.find(userFilter).select("_id isChef").lean();
    const deviceFilter: any = { userId: { $in: users.map(u => u._id) }, enabled: true };
    const devices = await FCMDevice.find(deviceFilter).select("userId token appId").lean();
    const eligibleIds = [...new Set(devices.map(d => String(d.userId)))];
    const expiresAt = new Date(Date.now() + NOTIFICATION_RETENTION_MS);
    const docs = eligibleIds.map(id => ({
      userId: new mongoose.Types.ObjectId(id),
      title,
      message,
      imageUrl,
      imagePublicId,
      destination: destination || undefined,
      expiresAt,
    }));
    if (docs.length) await UserNotification.insertMany(docs, { ordered: false });

    let pushAccepted = 0, pushFailed = 0;
    const batches: typeof devices[] = [];
    for (let i = 0; i < devices.length; i += 500) batches.push(devices.slice(i, i + 500));
    for (const batch of batches) {
      try {
        const response = await getFirebaseMessaging().sendEachForMulticast({
          tokens: batch.map(d => d.token), notification: { title, body: message, ...(imageUrl ? { imageUrl } : {}) },
          data: asStringData({ type: "custom_notification", destination: destination || "", imageUrl, notificationTitle: title }),
          android: { priority: "high", notification: { channelId: "katbox_general_v1", sound: "default", ...(imageUrl ? { imageUrl } : {}) } },
          apns: { payload: { aps: { sound: "default", ...(imageUrl ? { "mutable-content": 1 } : {}) } }, ...(imageUrl ? { fcmOptions: { imageUrl } } : {}) },
        });
        response.responses.forEach((r, i) => {
          if (r.success) pushAccepted++;
          else {
            pushFailed++;
            const code = r.error?.code || "";
            if (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token")) void FCMDevice.deleteOne({ _id: batch[i]._id });
            console.error("[Admin notifications] FCM token delivery failed:", code);
          }
        });
      } catch (error) {
        pushFailed += batch.length;
        console.error("[Admin notifications] FCM batch failed:", error);
      }
    }
    return res.status(200).json({ success: true, recipients: eligibleIds.length, inAppCreated: docs.length, pushAccepted, pushFailed, message: "Notification processing completed." });
  } catch (error: any) {
    console.error("[Admin notifications] Send failed:", error);
    return res.status(500).json({ success: false, message: error?.message || "Unable to send custom notification." });
  }
};

export const getNotificationInbox = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const now = new Date();
    const activeFilter = { userId, expiresAt: { $gt: now } };
    const [items, unread] = await Promise.all([
      UserNotification.find(activeFilter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      UserNotification.countDocuments({ ...activeFilter, isRead: false }),
    ]);
    return res.json({ success: true, data: items, unreadCount: unread });
  } catch (error: any) {
    console.error("[Notifications] Inbox fetch failed:", error);
    return res.status(500).json({ success: false, message: "Unable to load notifications." });
  }
};

export const markNotificationRead = async (req: AuthRequest, res: Response) => {
  try {
    const updated = await UserNotification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user!.userId, expiresAt: { $gt: new Date() } },
      { isRead: true },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, message: "Notification not found." });
    return res.json({ success: true, data: updated });
  } catch (error) { console.error("[Notifications] Mark read failed:", error); return res.status(500).json({ success: false, message: "Unable to update notification." }); }
};

export const markAllNotificationsRead = async (req: AuthRequest, res: Response) => {
  try {
    await UserNotification.updateMany(
      { userId: req.user!.userId, isRead: false, expiresAt: { $gt: new Date() } },
      { isRead: true }
    );
    return res.json({ success: true });
  }
  catch (error) { console.error("[Notifications] Mark all read failed:", error); return res.status(500).json({ success: false, message: "Unable to update notifications." }); }
};
