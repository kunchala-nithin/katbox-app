import { Request, Response } from "express";
import cloudinary from "../config/cloudinary";
import Chef from "../models/Chef";
import User from "../models/User";
import { ChefMenu } from "../models/chefCategory";
import jwt from "jsonwebtoken";

// ================= SHARED CLEANUP FUNCTION =================
export const cleanupChefData = async (chefId: string, userId: string) => {
  try {
    // 1. Find and delete all menus + their images
    const menus = await ChefMenu.find({ chef: chefId });

    for (const menu of menus) {
      // Delete hero image
      if (menu.heroCloudinaryId) {
        try { await cloudinary.uploader.destroy(menu.heroCloudinaryId); } catch (e) { }
      }

      // Delete plate items images
      for (const item of menu.plateItems || []) {
        if (item.cloudinaryId) {
          try { await cloudinary.uploader.destroy(item.cloudinaryId); } catch (e) { }
        }
      }

      // Delete all Daawath categories & items images
      if (menu.daawathCategories && menu.daawathCategories.length > 0) {
        for (const cat of menu.daawathCategories) {
          if (cat.cloudinaryId) {
            try { await cloudinary.uploader.destroy(cat.cloudinaryId); } catch (e) { }
          }
          // Now we loop over cat.items (replaces vegItems and nonVegItems)
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

// DELETE SINGLE IMAGE FROM CLOUDINARY
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

// Upload buffer to Cloudinary with compression
const uploadFromBuffer = (fileBuffer: Buffer) => {
  return new Promise<any>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "chefs",
        resource_type: "image",
        quality: "auto:good",
        fetch_format: "auto",
      },
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
      location,
      specialty,
      price,
      foodType,
      fssaiNo,
      isAvailable,
      coupons,
      existingBanners,
      deletedBannerIds,
    } = req.body;

    const userId = req.user.id;
    const files = (req.files as { [fieldname: string]: Express.Multer.File[] }) || {};

    const avatarFiles = files["avatar"] || [];
    const bannerFiles = files["banners"] || [];

    const existingChef = await Chef.findOne({ user: userId });

    // Parse coupons array safely if passed as JSON string
    let parsedCoupons: any[] = [];
    if (coupons) {
      try {
        parsedCoupons = typeof coupons === "string" ? JSON.parse(coupons) : coupons;
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

    // 3. Upload new banner files to Cloudinary
    const newlyUploadedBanners: { url: string; cloudinaryId: string }[] = [];
    for (const bFile of bannerFiles) {
      const upload: any = await uploadFromBuffer(bFile.buffer);
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

      // Handle avatar replacement
      if (avatarFiles.length > 0) {
        if (existingChef.avatarCloudinaryId) {
          await cloudinary.uploader.destroy(existingChef.avatarCloudinaryId).catch(() => {});
        }
        const upload: any = await uploadFromBuffer(avatarFiles[0].buffer);
        avatarUrl = upload.secure_url;
        avatarCloudinaryId = upload.public_id;
      }

      existingChef.name = name;
      existingChef.exp = exp;
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
        const avatarUpload: any = await uploadFromBuffer(avatarFiles[0].buffer);
        avatarUrl = avatarUpload.secure_url;
        avatarCloudinaryId = avatarUpload.public_id;
      }

      chef = await Chef.create({
        user: userId,
        name,
        exp,
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