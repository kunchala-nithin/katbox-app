import { v2 as cloudinary } from "cloudinary";
import UserNotification from "../models/UserNotification";

const BATCH_SIZE = 200;
const NOTIFICATION_FOLDER = "katbox/notifications";

/**
 * Safely extracts only public IDs that belong to the KatBox notification folder.
 * This also supports older notification records that stored imageUrl but not
 * imagePublicId. Unknown/non-Cloudinary URLs are deliberately not deleted.
 */
const getNotificationPublicIdFromUrl = (imageUrl?: string): string | null => {
  if (!imageUrl) return null;

  try {
    const parsed = new URL(imageUrl);
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith("cloudinary.com")) {
      return null;
    }

    const path = decodeURIComponent(parsed.pathname);
    const marker = "/image/upload/";
    const uploadIndex = path.indexOf(marker);
    if (uploadIndex < 0) return null;

    let publicPath = path.slice(uploadIndex + marker.length);
    const segments = publicPath.split("/").filter(Boolean);
    const folderIndex = segments.findIndex(
      (_segment, index) =>
        segments[index] === "katbox" && segments[index + 1] === "notifications"
    );

    if (folderIndex < 0) return null;

    publicPath = segments.slice(folderIndex).join("/");
    // Cloudinary may include a version segment before the folder; slicing from
    // the folder intentionally excludes it. Remove the file extension only.
    publicPath = publicPath.replace(/\.[^/.]+$/, "");

    if (!publicPath.startsWith(`${NOTIFICATION_FOLDER}/`)) return null;
    return publicPath;
  } catch {
    return null;
  }
};

const deleteCloudinaryImage = async (publicId: string): Promise<boolean> => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
      invalidate: true,
    });

    // "not found" means the image is already gone, which is a completed cleanup.
    if (result.result === "ok" || result.result === "not found") return true;

    console.warn("[Notification cleanup] Cloudinary did not confirm deletion:", {
      publicId,
      result: result.result,
    });
    return false;
  } catch (error: any) {
    console.error("[Notification cleanup] Cloudinary deletion failed; will retry:", {
      publicId,
      message: error?.message,
    });
    return false;
  }
};

/**
 * Deletes expired in-app notifications after safely handling their associated
 * Cloudinary image. Failed image deletions keep the MongoDB records for retry.
 */
export const processExpiredAdminNotifications = async (): Promise<void> => {
  const now = new Date();

  const expired = await UserNotification.find({ expiresAt: { $lte: now } })
    .sort({ expiresAt: 1 })
    .limit(BATCH_SIZE)
    .select("_id imageUrl imagePublicId")
    .lean();

  if (!expired.length) return;

  const noImageIds: string[] = [];
  const byPublicId = new Map<string, string[]>();
  const unsafeImageIds: string[] = [];

  for (const notification of expired) {
    const publicId =
      notification.imagePublicId ||
      getNotificationPublicIdFromUrl(notification.imageUrl);

    if (!notification.imageUrl && !notification.imagePublicId) {
      noImageIds.push(String(notification._id));
      continue;
    }

    if (!publicId || !publicId.startsWith(`${NOTIFICATION_FOLDER}/`)) {
      // Preserve the record rather than orphaning an image we cannot identify.
      unsafeImageIds.push(String(notification._id));
      continue;
    }

    const ids = byPublicId.get(publicId) || [];
    ids.push(String(notification._id));
    byPublicId.set(publicId, ids);
  }

  if (noImageIds.length) {
    await UserNotification.deleteMany({ _id: { $in: noImageIds }, expiresAt: { $lte: now } });
  }

  for (const [publicId, notificationIds] of byPublicId) {
    // The same uploaded image may be referenced by several recipient records.
    // Do not remove it while any non-expired notification still uses it.
    const activeReference = await UserNotification.exists({
      imagePublicId: publicId,
      expiresAt: { $gt: now },
    });

    if (activeReference) {
      await UserNotification.deleteMany({
        _id: { $in: notificationIds },
        expiresAt: { $lte: now },
      });
      continue;
    }

    // For legacy records without imagePublicId, also check active imageUrl refs.
    const legacyActiveReference = await UserNotification.exists({
      imagePublicId: { $in: ["", null] },
      imageUrl: { $exists: true, $ne: "" },
      expiresAt: { $gt: now },
    }).then(async (exists) => {
      if (!exists) return false;
      const activeLegacy = await UserNotification.find({
        imagePublicId: { $in: ["", null] },
        imageUrl: { $exists: true, $ne: "" },
        expiresAt: { $gt: now },
      }).select("imageUrl").lean();
      return activeLegacy.some((item) => getNotificationPublicIdFromUrl(item.imageUrl) === publicId);
    });

    if (legacyActiveReference) {
      await UserNotification.deleteMany({
        _id: { $in: notificationIds },
        expiresAt: { $lte: now },
      });
      continue;
    }

    const deleted = await deleteCloudinaryImage(publicId);
    if (deleted) {
      await UserNotification.deleteMany({
        _id: { $in: notificationIds },
        expiresAt: { $lte: now },
      });
    }
    // If Cloudinary fails, leave the documents in MongoDB so the next run retries.
  }

  if (unsafeImageIds.length) {
    console.warn(
      `[Notification cleanup] Preserved ${unsafeImageIds.length} expired notification(s) because their image URL/public ID could not be safely mapped to the KatBox notification folder.`
    );
  }
};

/**
 * Remove the old TTL index created by the previous schema. This is essential:
 * otherwise MongoDB could delete notification records before Cloudinary cleanup.
 */
/**
 * Existing records were previously assigned a 90-day expiry. Convert those
 * records to createdAt + 2 minutes so the test policy also applies to notifications
 * that were already in MongoDB when this patch is deployed.
 */
export const migrateExistingNotificationExpiry = async (): Promise<void> => {
  const twoMinutesMs = 2 * 60 * 1000;
  const result = await UserNotification.collection.updateMany(
    {
      $expr: {
        $or: [
          { $gt: ["$expiresAt", { $add: ["$createdAt", twoMinutesMs] }] },
          { $eq: [{ $type: "$expiresAt" }, "missing"] },
        ],
      },
    },
    [
      {
        $set: {
          expiresAt: { $add: ["$createdAt", twoMinutesMs] },
        },
      },
    ]
  );

  if (result.modifiedCount > 0) {
    console.log(
      `[Notification cleanup] Updated ${result.modifiedCount} existing notification(s) to the 2-minute expiry policy.`
    );
  }
};

export const removeLegacyNotificationTTLIndex = async (): Promise<void> => {
  try {
    await UserNotification.collection.dropIndex("expiresAt_1");
    console.log("[Notification cleanup] Removed legacy expiresAt TTL index.");
  } catch (error: any) {
    // MongoDB error code 27 = index not found. That is the desired state.
    if (error?.code !== 27 && error?.codeName !== "IndexNotFound") {
      console.error("[Notification cleanup] Could not remove legacy TTL index:", error);
      throw error;
    }
  }
};
