import { Request, Response } from "express";
import cloudinary from "../config/cloudinary";
import Chef from "../models/Chef";
import User from "../models/User";
import { ChefMenu } from "../models/chefCategory";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

// ============================================================
// CLOUDINARY UPLOAD PRESETS (STRICT COMPRESSION)
// ============================================================
type UploadKind = "avatar" | "banner";

const UPLOAD_PRESETS: Record<UploadKind, any> = {
  avatar: {
    folder: "chefs/avatars",
    resource_type: "image",
    transformation: [
      {
        width: 500,
        height: 500,
        crop: "fill",
        gravity: "face",
        quality: "auto:eco",
        fetch_format: "auto",
        flags: "progressive",
      },
    ],
  },
  banner: {
    folder: "chefs/banners",
    resource_type: "image",
    transformation: [
      {
        width: 1400,
        height: 900,
        crop: "limit",
        quality: "auto:good",
        fetch_format: "auto",
        flags: "progressive",
      },
    ],
  },
};

// ================= SHARED CLEANUP FUNCTION =================
export const cleanupChefData = async (chefId: string, userId: string) => {
  try {
    // 1. Find and delete all menus + their images
    const menus = await ChefMenu.find({ chef: chefId });

    for (const menu of menus) {
      if (menu.heroCloudinaryId) {
        try { await cloudinary.uploader.destroy(menu.heroCloudinaryId); } catch (e) { }
      }

      for (const item of menu.plateItems || []) {
        if (item.cloudinaryId) {
          try { await cloudinary.uploader.destroy(item.cloudinaryId); } catch (e) { }
        }
      }

      if (menu.daawathCategories && menu.daawathCategories.length > 0) {
        for (const cat of menu.daawathCategories) {
          if (cat.cloudinaryId) {
            try { await cloudinary.uploader.destroy(cat.cloudinaryId); } catch (e) { }
          }
          for (const item of cat.items || []) {
            if (item.cloudinaryId) {
              try { await cloudinary.uploader.destroy(item.cloudinaryId); } catch (e) { }
            }
          }
        }
      }

      await ChefMenu.findByIdAndDelete(menu._id);
    }

    // 2. Delete chef's avatar & all banner images
    const chef = await Chef.findById(chefId);
    if (chef) {
      if (chef.avatarCloudinaryId) {
        try { await cloudinary.uploader.destroy(chef.avatarCloudinaryId); } catch (e) { }
      }
      if (chef.banners && chef.banners.length > 0) {
        for (const b of chef.banners) {
          if (b.cloudinaryId) {
            try { await cloudinary.uploader.destroy(b.cloudinaryId); } catch (e) { }
          }
        }
      }
    }

    // 3. Delete the chef document
    await Chef.findByIdAndDelete(chefId);

    // 4. Reset user flag
    if (userId) {
      await User.findByIdAndUpdate(userId, { isChef: false });
    }

    console.log(`✅ Full cleanup completed for chef: ${chefId}`);
  } catch (err) {
    console.error("Cleanup error:", err);
  }
};

// ================= RECALCULATE CHEF RATING HELPER =================
export const recalculateChefRating = async (chefId: string | mongoose.Types.ObjectId) => {
  try {
    const chef = await Chef.findById(chefId);
    if (!chef) return null;

    const reviews = Array.isArray(chef.reviews) ? chef.reviews : [];
    const totalReviews = reviews.length;

    let averageRating = 4.8;
    if (totalReviews > 0) {
      const sum = reviews.reduce((acc: number, r: any) => acc + (Number(r.rating) || 0), 0);
      averageRating = Number((sum / totalReviews).toFixed(1));
    }

    chef.totalReviews = totalReviews;
    chef.averageRating = averageRating;
    chef.rating = String(averageRating);

    await chef.save();

    return { averageRating, totalReviews };
  } catch (err) {
    console.error("recalculateChefRating error:", err);
    return null;
  }
};

// ================= DELETE SINGLE IMAGE FROM CLOUDINARY =================
export const deleteChefImage = async (req: any, res: Response) => {
  try {
    const { publicId } = req.body;

    if (!publicId) {
      return res.status(400).json({ message: "publicId is required" });
    }

    await cloudinary.uploader.destroy(publicId);

    return res.json({
      success: true,
      message: "Image deleted from Cloudinary",
    });
  } catch (err: any) {
    console.error("Cloudinary delete error:", err);

    return res.status(500).json({
      message: "Failed to delete image",
    });
  }
};

// ============================================================
// UPLOAD BUFFER → CLOUDINARY (STRICT COMPRESSION APPLIED)
// ============================================================
const uploadFromBuffer = (
  fileBuffer: Buffer,
  kind: UploadKind = "banner"
) => {
  return new Promise<any>((resolve, reject) => {
    const preset = UPLOAD_PRESETS[kind];

    const stream = cloudinary.uploader.upload_stream(
      preset,
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    stream.end(fileBuffer);
  });
};

// Auth middleware
export const protect = (req: any, res: Response, next: any) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    const decoded: any = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    );

    req.user = { id: decoded.userId };
    next();
  } catch (err) {
    console.log("Auth error:", err);

    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
};

export const createOrUpdateChef = async (req: any, res: Response) => {
  try {
    const {
      name,
      exp,
      phone,
      aadhar,
      location,
      specialty,
      price,
      foodType,
      fssaiNo,
      isAvailable,
      coupons,
      existingBanners,
      deletedBannerIds,
      removeAvatarOnSave,
    } = req.body;

    const userId = req.user.id;
    const files = (req.files as { [fieldname: string]: Express.Multer.File[] }) || {};

    const avatarFiles = files["avatar"] || [];
    const bannerFiles = files["banners"] || [];

    const existingChef = await Chef.findOne({ user: userId });

    // ─── SANITIZE PHONE (10 digits strict) ───
    const sanitizedPhone = String(phone || "").replace(/\D/g, "").slice(0, 10);
    // ─── SANITIZE AADHAR (12 digits strict) ───
    const sanitizedAadhar = String(aadhar || "").replace(/\D/g, "").slice(0, 12);

    // Parse coupons array safely if passed as JSON string
    let parsedCoupons: any[] = [];
    if (coupons) {
      try {
        const raw = typeof coupons === "string" ? JSON.parse(coupons) : coupons;
        if (Array.isArray(raw)) {
          parsedCoupons = raw.map((c: any) => ({
            code: String(c.code || "").trim().toUpperCase(),
            type: c.type === "flat" ? "flat" : "percent",
            value: String(c.value || "").trim(),
            description: String(c.description || "").trim(),
            minOrder: Number(c.minOrder) || 0,
            maxDiscount: Number(c.maxDiscount) || 500,
          }));
        }
      } catch (e) {
        console.log("Error parsing coupons", e);
      }
    }

    // 1. Process deleted banner IDs from Cloudinary
    if (deletedBannerIds) {
      try {
        const toDelete: string[] = JSON.parse(deletedBannerIds);
        for (const pubId of toDelete) {
          if (pubId) {
            await cloudinary.uploader.destroy(pubId).catch(() => {});
          }
        }
      } catch (e) {
        console.log("Error parsing deletedBannerIds", e);
      }
    }

    // 2. Parse existing banners retained by the user
    let retainedBanners: { url: string; cloudinaryId: string }[] = [];
    if (existingBanners) {
      try {
        retainedBanners = JSON.parse(existingBanners);
      } catch (e) {
        console.log("Error parsing existingBanners", e);
      }
    }

    // 3. Upload new banner files to Cloudinary (STRICT COMPRESSION)
    const newlyUploadedBanners: { url: string; cloudinaryId: string }[] = [];
    for (const bFile of bannerFiles) {
      const upload: any = await uploadFromBuffer(bFile.buffer, "banner");
      newlyUploadedBanners.push({
        url: upload.secure_url,
        cloudinaryId: upload.public_id,
      });
    }

    const finalBanners = [...retainedBanners, ...newlyUploadedBanners];

    let chef;

    if (existingChef) {
      let avatarUrl = existingChef.avatar;
      let avatarCloudinaryId = existingChef.avatarCloudinaryId;

      // ─── AVATAR REPLACEMENT ───
      if (avatarFiles.length > 0) {
        // Destroy OLD avatar first
        if (existingChef.avatarCloudinaryId) {
          await cloudinary.uploader
            .destroy(existingChef.avatarCloudinaryId)
            .catch(() => {});
        }
        // Upload NEW avatar with strict compression
        const upload: any = await uploadFromBuffer(avatarFiles[0].buffer, "avatar");
        avatarUrl = upload.secure_url;
        avatarCloudinaryId = upload.public_id;
      } else if (
        String(removeAvatarOnSave) === "true" &&
        existingChef.avatarCloudinaryId
      ) {
        // User explicitly removed avatar without uploading a new one
        await cloudinary.uploader
          .destroy(existingChef.avatarCloudinaryId)
          .catch(() => {});
        avatarUrl = "";
        avatarCloudinaryId = "";
      }

      existingChef.name = name;
      existingChef.exp = exp;
      existingChef.phone = sanitizedPhone;
      existingChef.aadhar = sanitizedAadhar;
      existingChef.location = location;
      existingChef.specialty = specialty;
      existingChef.price = price;
      existingChef.foodType = foodType;
      existingChef.fssaiNo = fssaiNo || "";
      existingChef.avatar = avatarUrl;
      existingChef.avatarCloudinaryId = avatarCloudinaryId;
      existingChef.coupons = parsedCoupons;
      existingChef.banners = finalBanners;

      existingChef.isAvailable =
        typeof isAvailable !== "undefined"
          ? isAvailable === "true" || isAvailable === true
          : existingChef.isAvailable;

      chef = await existingChef.save();
      return res.json({ success: true, chef });
    } else {
      let avatarUrl = "";
      let avatarCloudinaryId = "";

      if (avatarFiles.length > 0) {
        const avatarUpload: any = await uploadFromBuffer(
          avatarFiles[0].buffer,
          "avatar"
        );
        avatarUrl = avatarUpload.secure_url;
        avatarCloudinaryId = avatarUpload.public_id;
      }

      chef = await Chef.create({
        user: userId,
        name,
        exp,
        phone: sanitizedPhone,
        aadhar: sanitizedAadhar,
        location,
        specialty,
        price,
        foodType,
        fssaiNo: fssaiNo || "",
        avatar: avatarUrl,
        avatarCloudinaryId,
        coupons: parsedCoupons,
        banners: finalBanners,
        isAvailable: isAvailable === "false" ? false : true,
      });

      await User.findByIdAndUpdate(userId, { isChef: true });
      return res.json({ success: true, chef });
    }
  } catch (err: any) {
    console.error("Save chef error:", err);
    res.status(500).json({ message: "Server error while saving chef", error: err.message });
  }
};

// FULL DELETE CHEF (via API)
export const deleteChef = async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const chef = await Chef.findOne({ user: userId });
    if (!chef) {
      return res.status(404).json({ message: "Chef not found" });
    }

    await cleanupChefData(chef._id.toString(), userId);

    return res.json({
      success: true,
      message: "Chef profile and ALL related data deleted permanently",
    });
  } catch (err: any) {
    console.error("Delete chef error:", err);
    return res.status(500).json({
      message: "Server error while deleting chef",
      error: err.message,
    });
  }
};

// GET ALL CHEFS
export const getChefs = async (_req: Request, res: Response) => {
  try {
    const chefs = await Chef.find().sort({ createdAt: -1 });

    return res.json({
      success: true,
      chefs,
    });
  } catch (error) {
    console.error("Get chefs error:", error);

    return res.status(500).json({
      message: "Server error",
    });
  }
};

// GET MY CHEF
export const getMyChef = async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const chef = await Chef.findOne({ user: userId });

    return res.json({
      success: true,
      chef: chef || null,
    });
  } catch (error) {
    console.error("Get my chef error:", error);

    return res.status(500).json({
      message: "Server error",
    });
  }
};

// GET SPECIFIC CHEF'S COUPONS ONLY
export const getChefCoupons = async (req: Request, res: Response) => {
  try {
    const rawChefId = req.params.chefId;
    const chefId = Array.isArray(rawChefId) ? rawChefId[0] : rawChefId;
    if (!chefId) {
      return res.status(400).json({ success: false, message: "Chef ID is required" });
    }

    const query: any = {};
    if (mongoose.Types.ObjectId.isValid(chefId)) {
      query.$or = [{ _id: chefId }, { user: chefId }];
    } else {
      query.$or = [{ name: chefId }];
    }

    const chef = await Chef.findOne(query);
    if (!chef) {
      return res.status(404).json({ success: false, message: "Chef not found", coupons: [] });
    }

    const coupons = (chef.coupons || []).map((cp: any) => ({
      _id: cp._id,
      code: cp.code,
      type: cp.type === "flat" ? "FLAT" : "PERCENT",
      value: Number(cp.value) || 0,
      description: cp.description || (cp.type === "flat" ? `Flat ₹${cp.value} OFF` : `${cp.value}% OFF`),
      minOrder: Number(cp.minOrder) || 0,
      maxDiscount: Number(cp.maxDiscount) || 500,
    }));

    return res.json({
      success: true,
      coupons,
      chefId: chef._id,
      chefName: chef.name,
    });
  } catch (error: any) {
    console.error("Get chef coupons error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch coupons for chef",
      coupons: [],
    });
  }
};

// ================= GET SPECIFIC CHEF'S REVIEWS ONLY =================
export const getChefReviews = async (req: Request, res: Response) => {
  try {
    const rawChefId = req.params.chefId;
    const chefId = Array.isArray(rawChefId) ? rawChefId[0] : rawChefId;

    if (!chefId) {
      return res.status(400).json({
        success: false,
        message: "Chef ID is required",
        reviews: [],
      });
    }

    const query: any = {};
    if (mongoose.Types.ObjectId.isValid(chefId)) {
      query.$or = [{ _id: chefId }, { user: chefId }];
    } else {
      query.$or = [{ name: chefId }];
    }

    const chef = await Chef.findOne(query);
    if (!chef) {
      return res.status(404).json({
        success: false,
        message: "Chef not found",
        reviews: [],
      });
    }

    const rawReviews: any[] = Array.isArray(chef.reviews) ? [...chef.reviews] : [];
    rawReviews.sort((a: any, b: any) => {
      const tA = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tB = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tB - tA;
    });

    const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<number, number>;
    rawReviews.forEach((r: any) => {
      const rounded = Math.max(1, Math.min(5, Math.round(Number(r.rating) || 0)));
      if (rounded >= 1 && rounded <= 5) breakdown[rounded] += 1;
    });

    const totalReviews = rawReviews.length;
    let averageRating = Number(chef.averageRating) || 0;
    if (totalReviews > 0) {
      const sum = rawReviews.reduce((acc: number, r: any) => acc + (Number(r.rating) || 0), 0);
      averageRating = Number((sum / totalReviews).toFixed(1));
    } else if (!averageRating) {
      const fallback = Number(chef.rating);
      averageRating = Number.isFinite(fallback) ? fallback : 4.8;
    }

    const normalizedReviews = rawReviews.map((r: any) => ({
      _id: r?._id ? String(r._id) : undefined,
      orderId: r?.orderId || "",
      userId: r?.userId || "",
      userName: r?.userName || "Customer",
      userAvatar: r?.userAvatar || "",
      rating: Number(r?.rating) || 0,
      comment: r?.comment || "",
      images: Array.isArray(r?.images)
        ? r.images.map((img: any) => ({
            url: img?.url || "",
            cloudinaryId: img?.cloudinaryId || "",
          }))
        : [],
      createdAt: r?.createdAt || null,
    }));

    return res.json({
      success: true,
      chefId: chef._id,
      chefName: chef.name,
      averageRating,
      totalReviews,
      breakdown,
      reviews: normalizedReviews,
    });
  } catch (error: any) {
    console.error("Get chef reviews error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch reviews for chef",
      reviews: [],
    });
  }
};

// APPLY SPECIFIC CHEF'S COUPON STRICTLY
export const applyChefCoupon = async (req: Request, res: Response) => {
  try {
    const { code, cartTotal, chefId } = req.body;

    if (!code || !chefId) {
      return res.status(400).json({ success: false, message: "Coupon code and Chef ID are required" });
    }

    const query: any = {};
    if (mongoose.Types.ObjectId.isValid(chefId)) {
      query.$or = [{ _id: chefId }, { user: chefId }];
    } else {
      query.$or = [{ name: chefId }];
    }

    const chef = await Chef.findOne(query);
    if (!chef) {
      return res.status(404).json({ success: false, message: "Chef not found" });
    }

    const cleanCode = String(code).trim().toUpperCase();
    const matchedCoupon = (chef.coupons || []).find((c: any) => c.code.toUpperCase() === cleanCode);

    if (!matchedCoupon) {
      return res.status(400).json({
        success: false,
        message: `Coupon '${cleanCode}' is not valid for Chef ${chef.name}`,
      });
    }

    const total = Number(cartTotal) || 0;
    const minOrder = Number(matchedCoupon.minOrder) || 0;
    if (total < minOrder) {
      return res.status(400).json({
        success: false,
        message: `Minimum order of ₹${minOrder} required to use this coupon`,
      });
    }

    let discount = 0;
    const couponVal = Number(matchedCoupon.value) || 0;

    if (matchedCoupon.type === "percent") {
      discount = Math.round((total * couponVal) / 100);
      const maxDiscount = Number(matchedCoupon.maxDiscount) || 500;
      if (maxDiscount > 0 && discount > maxDiscount) {
        discount = maxDiscount;
      }
    } else {
      discount = couponVal;
    }

    if (discount > total) {
      discount = total;
    }

    return res.json({
      success: true,
      message: `Coupon '${cleanCode}' applied successfully!`,
      code: cleanCode,
      discount,
      chefId: chef._id,
      chefName: chef.name,
    });
  } catch (error: any) {
    console.error("Apply chef coupon error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while applying coupon",
    });
  }
};