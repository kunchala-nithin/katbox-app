import { Request, Response } from "express";
import ChefCategory, { ChefMenu, ChefPlan } from "../models/chefCategory";
import Chef from "../models/Chef";
import cloudinary from "../config/cloudinary";

// ============================================================
// 🚀 PARALLEL CLOUDINARY UPLOAD HELPER
// Wraps `upload_stream` in a promise so we can fan-out uploads
// with `Promise.all` instead of sequential `for...await` loops.
// ============================================================
const uploadToCloudinary = (
  buffer: Buffer,
  folder: string
): Promise<any> => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder,
          quality: "auto:good",
          fetch_format: "auto",
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      )
      .end(buffer);
  });
};

// ==========================================
// CHEF CATEGORY CONTROLLERS
// ==========================================

export const addChefCategory = async (req: any, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const chef = await Chef.findOne({ user: userId });
    if (!chef) return res.status(404).json({ message: "Chef not found" });

    const { name } = req.body;
    const heroFile = req.files?.heroImage?.[0];

    if (!name || !heroFile) {
      return res.status(400).json({ message: "Name and hero image are required" });
    }

    const upload: any = await uploadToCloudinary(heroFile.buffer, "chef-categories");

    const heroImageUrl = upload.secure_url.replace(
      "/upload/",
      "/upload/f_auto,q_auto:good,w_900,c_limit/"
    );

    const category = await ChefCategory.create({
      user: userId,
      chef: chef._id,
      name,
      heroImageUrl,
      heroCloudinaryId: upload.public_id,
      subCategories: [],
    });

    res.status(201).json(category);
  } catch (err: any) {
    console.error("Add chef category error:", err);
    res.status(500).json({ message: "Error creating category" });
  }
};

export const updateChefCategory = async (req: any, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const category = await ChefCategory.findById(id);
    if (!category) return res.status(404).json({ message: "Category not found" });

    if (category.user.toString() !== userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const { name } = req.body;
    const heroFile = req.files?.heroImage?.[0];

    let heroImageUrl = category.heroImageUrl;
    let heroCloudinaryId = category.heroCloudinaryId;

    if (heroFile) {
      if (heroCloudinaryId) {
        try { await cloudinary.uploader.destroy(heroCloudinaryId); } catch (e) {}
      }

      const upload: any = await uploadToCloudinary(heroFile.buffer, "chef-categories");

      heroImageUrl = upload.secure_url.replace(
        "/upload/",
        "/upload/f_auto,q_auto:good,w_900,c_limit/"
      );
      heroCloudinaryId = upload.public_id;
    }

    const updated = await ChefCategory.findByIdAndUpdate(
      id,
      { name, heroImageUrl, heroCloudinaryId },
      { new: true }
    );

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating category" });
  }
};

export const getChefCategories = async (req: Request, res: Response) => {
  try {
    const categories = await ChefCategory.find({ chef: req.params.chefId });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ message: "Error fetching categories" });
  }
};

export const deleteChefCategory = async (req: any, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const category = await ChefCategory.findById(id);
    if (!category) return res.status(404).json({ message: "Category not found" });

    if (category.user.toString() !== userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    if (category.heroCloudinaryId) {
      try {
        await cloudinary.uploader.destroy(category.heroCloudinaryId);
      } catch (e) {}
    }

    if (category.subCategories && category.subCategories.length > 0) {
      for (const sub of category.subCategories) {
        if (sub.items && sub.items.length > 0) {
          for (const item of sub.items) {
            if (item.cloudinaryId) {
              try {
                await cloudinary.uploader.destroy(item.cloudinaryId);
              } catch (e) {}
            }
          }
        }
      }
    }

    await ChefCategory.findByIdAndDelete(id);
    res.json({ message: "Category and all associated images deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting category" });
  }
};

export const deleteChefCategoryImage = async (req: any, res: Response) => {
  try {
    const { publicId } = req.body;
    if (!publicId) {
      return res.status(400).json({ message: "publicId is required" });
    }

    await cloudinary.uploader.destroy(publicId);
    res.json({ success: true, message: "Image deleted from Cloudinary" });
  } catch (err: any) {
    console.error("Cloudinary delete error:", err);
    res.status(500).json({ message: "Failed to delete image" });
  }
};

export const saveCategoryItems = async (req: any, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const category = await ChefCategory.findById(id);
    if (!category) return res.status(404).json({ message: "Category not found" });

    if (category.user.toString() !== userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const parsedSubCategories = JSON.parse(req.body.subCategories || "[]");
    const files: any[] = req.files || [];
    let filePointer = 0;

    const consumeNextFile = () => {
      if (filePointer >= files.length) return null;
      return files[filePointer++];
    };

    // ---- Build orphan cleanup list ----
    const existingCloudinaryIds = new Set<string>();
    if (category.subCategories) {
      category.subCategories.forEach((sub: any) => {
        if (sub.items) {
          sub.items.forEach((item: any) => {
            if (item.cloudinaryId) existingCloudinaryIds.add(item.cloudinaryId);
          });
        }
      });
    }

    const incomingCloudinaryIds = new Set<string>();
    parsedSubCategories.forEach((sub: any) => {
      if (sub.items) {
        sub.items.forEach((item: any) => {
          if (item.cloudinaryId) incomingCloudinaryIds.add(item.cloudinaryId);
        });
      }
    });

    const orphanedIds = [...existingCloudinaryIds].filter(id => !incomingCloudinaryIds.has(id));

    // ---- Queue every new-file upload in parallel ----
    type UploadSlot = { subIndex: number; itemIndex: number; promise: Promise<any> };
    const uploadSlots: UploadSlot[] = [];

    for (let sIdx = 0; sIdx < parsedSubCategories.length; sIdx++) {
      const sub = parsedSubCategories[sIdx];
      const itemsArr = sub.items || [];
      for (let iIdx = 0; iIdx < itemsArr.length; iIdx++) {
        const item = itemsArr[iIdx];
        const isNewFile = item.image && item.image.startsWith("file");
        if (isNewFile) {
          const file = consumeNextFile();
          if (file) {
            uploadSlots.push({
              subIndex: sIdx,
              itemIndex: iIdx,
              promise: uploadToCloudinary(file.buffer, "chef-categories/items"),
            });
          }
        }
      }
    }

    // ---- Fan out: orphan deletes + new uploads concurrently ----
    const orphanDeletePromises = orphanedIds.map(id =>
      cloudinary.uploader.destroy(id).catch(() => null)
    );

    const uploadResults = await Promise.all(
      uploadSlots.map(slot => slot.promise)
    );

    // Fire deletes in background (don't block the response on cleanup)
    Promise.allSettled(orphanDeletePromises).catch(() => null);

    // ---- Map upload results back to their positions ----
    const uploadMap = new Map<string, any>();
    uploadSlots.forEach((slot, idx) => {
      uploadMap.set(`${slot.subIndex}-${slot.itemIndex}`, uploadResults[idx]);
    });

    // ---- Assemble final sub-categories ----
    const finalSubCategories: any[] = [];

    for (let sIdx = 0; sIdx < parsedSubCategories.length; sIdx++) {
      const sub = parsedSubCategories[sIdx];
      const items: any[] = [];
      const itemsArr = sub.items || [];

      for (let iIdx = 0; iIdx < itemsArr.length; iIdx++) {
        const item = itemsArr[iIdx];
        let imageUrl = item.imageUrl || "";
        let cloudinaryId = item.cloudinaryId || "";

        const upload: any = uploadMap.get(`${sIdx}-${iIdx}`);
        if (upload) {
          imageUrl = upload.secure_url.replace(
            "/upload/",
            "/upload/f_auto,q_auto:good,w_500,c_limit/"
          );
          cloudinaryId = upload.public_id;
        }

        items.push({
          name: item.name,
          description: item.description || "",
          imageUrl,
          cloudinaryId,
          price: Number(item.price),
          quantity: item.quantity,
          isVeg: item.isVeg !== undefined ? item.isVeg : true,
          variants: item.variants || [],
        });
      }

      finalSubCategories.push({
        name: sub.name,
        items,
      });
    }

    const updatedCategory = await ChefCategory.findByIdAndUpdate(
      id,
      { subCategories: finalSubCategories },
      { new: true }
    );

    res.json(updatedCategory);
  } catch (err: any) {
    console.error("Save category items error:", err);
    res.status(500).json({ message: "Failed to save sub categories and items" });
  }
};

export const deleteSubCategory = async (req: any, res: Response) => {
  try {
    const userId = req.user?.id;
    const { categoryId, subCategoryId } = req.params;

    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const category = await ChefCategory.findById(categoryId);
    if (!category) return res.status(404).json({ message: "Category not found" });

    if (category.user.toString() !== userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const subCategory = category.subCategories.find((sub: any) => sub._id.toString() === subCategoryId);
    if (!subCategory) return res.status(404).json({ message: "Sub-category not found" });

    if (subCategory.items && subCategory.items.length > 0) {
      for (const item of subCategory.items) {
        if (item.cloudinaryId) {
          try {
            await cloudinary.uploader.destroy(item.cloudinaryId);
          } catch (e) {}
        }
      }
    }

    await ChefCategory.updateOne(
      { _id: categoryId },
      { $pull: { subCategories: { _id: subCategoryId } } }
    );

    res.json({ success: true, message: "Sub-category and associated images deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting sub-category" });
  }
};

export const deleteSingleItem = async (req: any, res: Response) => {
  try {
    const userId = req.user?.id;
    const { categoryId, itemId } = req.params;

    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const category = await ChefCategory.findById(categoryId);
    if (!category) return res.status(404).json({ message: "Category not found" });

    if (category.user.toString() !== userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    let foundItem: any = null;
    if (category.subCategories) {
      for (const sub of category.subCategories) {
        if (sub.items) {
          const item = sub.items.find((i: any) => i._id.toString() === itemId);
          if (item) {
            foundItem = item;
            break;
          }
        }
      }
    }

    if (!foundItem) return res.status(404).json({ message: "Item not found" });

    if (foundItem.cloudinaryId) {
      try { 
        await cloudinary.uploader.destroy(foundItem.cloudinaryId); 
      } catch (e) {}
    }

    await ChefCategory.updateOne(
      { _id: categoryId },
      { $pull: { "subCategories.$[].items": { _id: itemId } } }
    );

    res.json({ success: true, message: "Item and image deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting item" });
  }
};

// ==========================================
// CHEF MENU (CATERING) CONTROLLERS
// ==========================================

export const addChefMenu = async (req: any, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Authentication required. Please login again." });
    }

    const chef = await Chef.findOne({ user: userId });

    if (!chef) {
      return res.status(404).json({ message: "Chef not found. Please create a chef profile first." });
    }

    const { name, price, itemsPerPlate, mealType, plateItems, categoryId, isNonVeg } = req.body;

    if (!name || !price || !itemsPerPlate || !mealType) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const parsedItems: any[] = JSON.parse(plateItems || "[]");

    const heroFile = req.files?.heroImage?.[0];
    const itemFiles: any[] = req.files?.itemImages || [];

    if (!heroFile) {
      return res.status(400).json({ message: "Hero image is required" });
    }

    // --- Queue all uploads in parallel ---
    const heroPromise = uploadToCloudinary(heroFile.buffer, "chefmenus");

    const itemUploadTasks: Array<{ index: number; promise: Promise<any> }> = [];
    let fileIndex = 0;
    for (let i = 0; i < parsedItems.length; i++) {
      const item = parsedItems[i];
      const isNewFile = item.imageUrl && (item.imageUrl.startsWith("file") || item.imageUrl.startsWith("content"));
      if (isNewFile && itemFiles[fileIndex]) {
        const file = itemFiles[fileIndex++];
        itemUploadTasks.push({
          index: i,
          promise: uploadToCloudinary(file.buffer, "chefmenus/items"),
        });
      }
    }

    const [heroUpload, ...itemUploadResults] = await Promise.all([
      heroPromise,
      ...itemUploadTasks.map(t => t.promise),
    ]);

    const heroImageUrl = (heroUpload as any).secure_url.replace(
      "/upload/",
      "/upload/f_auto,q_auto:good,w_900,c_limit/"
    );

    const uploadMap = new Map<number, any>();
    itemUploadTasks.forEach((task, idx) => {
      uploadMap.set(task.index, itemUploadResults[idx]);
    });

    const uploadedItems: any[] = [];
    for (let i = 0; i < parsedItems.length; i++) {
      const item = parsedItems[i];
      const isNewFile = item.imageUrl && (item.imageUrl.startsWith("file") || item.imageUrl.startsWith("content"));
      let imageUrl = item.imageUrl || "";
      let cloudinaryId = item.cloudinaryId || "";

      const upload: any = uploadMap.get(i);
      if (isNewFile && upload) {
        imageUrl = upload.secure_url.replace(
          "/upload/",
          "/upload/f_auto,q_auto:good,w_400,c_limit/"
        );
        cloudinaryId = upload.public_id;
      } else if (isNewFile && !upload) {
        imageUrl = "";
        cloudinaryId = "";
      }

      uploadedItems.push({
        name: item.name || "",
        imageUrl,
        cloudinaryId,
      });
    }

    const menu = await ChefMenu.create({
      user: userId,
      chef: chef._id,
      categoryId: categoryId || undefined,
      name,
      price: Number(price),
      itemsPerPlate: Number(itemsPerPlate),
      mealType,
      heroImageUrl,
      heroCloudinaryId: (heroUpload as any).public_id,
      plateItems: uploadedItems,
      isNonVeg: isNonVeg === "true",
    });

    res.json(menu);
  } catch (err: any) {
    console.error("Add chef menu error:", err);
    res.status(500).json({ message: "Error creating chef menu", error: err.message });
  }
};

export const updateChefMenu = async (req: any, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const menu = await ChefMenu.findById(id);
    if (!menu) return res.status(404).json({ message: "Menu not found" });

    if (menu.user.toString() !== userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const { name, price, itemsPerPlate, mealType, plateItems, categoryId, isNonVeg } = req.body;

    let heroImageUrl = menu.heroImageUrl;
    let heroCloudinaryId = menu.heroCloudinaryId;

    const heroFile = req.files?.heroImage?.[0];
    const heroPromise = heroFile
      ? uploadToCloudinary(heroFile.buffer, "chefmenus")
      : Promise.resolve(null);

    const parsedItems: any[] = plateItems ? JSON.parse(plateItems) : [];
    const itemFiles: any[] = req.files?.itemImages || [];
    const existingPlateItems: any[] = menu.plateItems || [];

    const incomingCloudinaryIds = new Set<string>();
    parsedItems.forEach((item: any) => {
      const url = item.imageUrl || "";
      const isNewFile = url.startsWith("file") || url.startsWith("content");
      if (!isNewFile && item.cloudinaryId) {
        incomingCloudinaryIds.add(item.cloudinaryId);
      }
    });

    // Delete orphans in background
    const orphanDeletePromises: Promise<any>[] = [];
    for (const existing of existingPlateItems) {
      if (existing.cloudinaryId && !incomingCloudinaryIds.has(existing.cloudinaryId)) {
        orphanDeletePromises.push(
          cloudinary.uploader.destroy(existing.cloudinaryId).catch(() => null)
        );
      }
    }

    const itemUploadTasks: Array<{ index: number; promise: Promise<any> }> = [];
    let fileIndex = 0;
    for (let i = 0; i < parsedItems.length; i++) {
      const item = parsedItems[i];
      const url = item.imageUrl || "";
      const isNewFile = url && (url.startsWith("file") || url.startsWith("content"));
      if (isNewFile && itemFiles[fileIndex]) {
        const file = itemFiles[fileIndex++];
        itemUploadTasks.push({
          index: i,
          promise: uploadToCloudinary(file.buffer, "chefmenus/items"),
        });
      }
    }

    const [heroResult, ...itemUploadResults] = await Promise.all([
      heroPromise,
      ...itemUploadTasks.map(t => t.promise),
    ]);

    if (heroFile && heroResult) {
      if (heroCloudinaryId) {
        try { await cloudinary.uploader.destroy(heroCloudinaryId); } catch (e) {}
      }
      const h: any = heroResult;
      heroImageUrl = h.secure_url.replace("/upload/", "/upload/f_auto,q_auto:good,w_900,c_limit/");
      heroCloudinaryId = h.public_id;
    }

    Promise.allSettled(orphanDeletePromises).catch(() => null);

    const uploadMap = new Map<number, any>();
    itemUploadTasks.forEach((task, idx) => {
      uploadMap.set(task.index, itemUploadResults[idx]);
    });

    const rebuiltItems: any[] = [];
    for (let i = 0; i < parsedItems.length; i++) {
      const item = parsedItems[i];
      let imageUrl = item.imageUrl || "";
      let cloudinaryId = item.cloudinaryId || "";

      const isNewFile = imageUrl && (imageUrl.startsWith("file") || imageUrl.startsWith("content"));

      if (isNewFile) {
        const upload: any = uploadMap.get(i);
        if (upload) {
          imageUrl = upload.secure_url.replace(
            "/upload/",
            "/upload/f_auto,q_auto:good,w_400,c_limit/"
          );
          cloudinaryId = upload.public_id;
        } else {
          const match = existingPlateItems.find((ex: any) => ex.name === item.name);
          imageUrl = match?.imageUrl || "";
          cloudinaryId = match?.cloudinaryId || "";
        }
      } else if (!imageUrl) {
        imageUrl = "";
        cloudinaryId = "";
      }

      rebuiltItems.push({
        name: item.name || "",
        imageUrl,
        cloudinaryId,
      });
    }

    const updated = await ChefMenu.findByIdAndUpdate(
      id,
      {
        name,
        price: Number(price),
        itemsPerPlate: Number(itemsPerPlate),
        mealType,
        categoryId: categoryId || undefined,
        heroImageUrl,
        heroCloudinaryId,
        plateItems: rebuiltItems,
        isNonVeg: isNonVeg === "true",
      },
      { new: true }
    );

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating chef menu" });
  }
};

export const getChefMenus = async (req: Request, res: Response) => {
  try {
    const menus = await ChefMenu.find({ chef: req.params.chefId });
    res.json(menus);
  } catch (err) {
    res.status(500).json({ message: "Error fetching chef menus" });
  }
};

export const deleteChefMenu = async (req: any, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const menu = await ChefMenu.findById(id);
    if (!menu) return res.status(404).json({ message: "Menu not found" });

    if (menu.user.toString() !== userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const deletes: Promise<any>[] = [];
    if (menu.heroCloudinaryId) deletes.push(cloudinary.uploader.destroy(menu.heroCloudinaryId).catch(() => null));

    for (const item of menu.plateItems) {
      if (item.cloudinaryId) deletes.push(cloudinary.uploader.destroy(item.cloudinaryId).catch(() => null));
    }

    if (menu.daawathCategories && menu.daawathCategories.length > 0) {
      for (const cat of menu.daawathCategories) {
        if (cat.cloudinaryId) deletes.push(cloudinary.uploader.destroy(cat.cloudinaryId).catch(() => null));
        if (cat.items && cat.items.length > 0) {
          for (const item of cat.items) {
            if (item.cloudinaryId) deletes.push(cloudinary.uploader.destroy(item.cloudinaryId).catch(() => null));
          }
        }
      }
    }

    if (menu.daawathAddons && menu.daawathAddons.length > 0) {
      for (const addon of menu.daawathAddons) {
        if (addon.cloudinaryId) deletes.push(cloudinary.uploader.destroy(addon.cloudinaryId).catch(() => null));
      }
    }

    await ChefMenu.findByIdAndDelete(id);
    Promise.allSettled(deletes).catch(() => null);

    res.json({ message: "Chef menu and all associated images deleted successfully" });
  } catch (err) {
    console.error("Delete chef menu error:", err);
    res.status(500).json({ message: "Error deleting chef menu" });
  }
};

export const deleteChefMenuImage = async (req: any, res: Response) => {
  try {
    const { publicId } = req.body;
    if (!publicId) return res.status(400).json({ message: "publicId is required" });

    await cloudinary.uploader.destroy(publicId);
    res.json({ success: true, message: "Image deleted from Cloudinary" });
  } catch (err: any) {
    console.error("Cloudinary delete error:", err);
    res.status(500).json({ message: "Failed to delete image" });
  }
};

export const saveDaawathCategories = async (req: any, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const menu = await ChefMenu.findById(id);
    if (!menu) return res.status(404).json({ message: "Menu not found" });

    if (menu.user.toString() !== userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const parsedCategories = JSON.parse(req.body.categories || "[]");
    const parsedAddons = JSON.parse(req.body.daawathAddons || "[]");
    const files: any[] = req.files || [];
    let filePointer = 0;
    const consumeNextFile = () => {
      if (filePointer >= files.length) return null;
      return files[filePointer++];
    };

    // ---- Queue all uploads in parallel ----
    type CatSlot = { kind: "cat"; catIndex: number; promise: Promise<any> };
    type ItemSlot = { kind: "item"; catIndex: number; itemIndex: number; promise: Promise<any> };
    type AddonSlot = { kind: "addon"; addonIndex: number; promise: Promise<any> };
    type AnySlot = CatSlot | ItemSlot | AddonSlot;

    const slots: AnySlot[] = [];
    const orphanDeletePromises: Promise<any>[] = [];

    for (let c = 0; c < parsedCategories.length; c++) {
      const category = parsedCategories[c];

      // Category image (now optional — most categories will simply have no image)
      const catIsNewFile = category.imageUrl?.startsWith("file");
      if (category.cloudinaryId && (!category.imageUrl || catIsNewFile)) {
        orphanDeletePromises.push(
          cloudinary.uploader.destroy(category.cloudinaryId).catch(() => null)
        );
      }
      if (catIsNewFile) {
        const file = consumeNextFile();
        if (file) {
          slots.push({
            kind: "cat",
            catIndex: c,
            promise: uploadToCloudinary(file.buffer, "chefmenus/categories"),
          });
        }
      }

      // Category items
      const catItems = category.items || [];
      for (let i = 0; i < catItems.length; i++) {
        const item = catItems[i];
        const itemIsNewFile = item.imageUrl?.startsWith("file");
        if (item.cloudinaryId && (!item.imageUrl || itemIsNewFile)) {
          orphanDeletePromises.push(
            cloudinary.uploader.destroy(item.cloudinaryId).catch(() => null)
          );
        }
        if (itemIsNewFile) {
          const file = consumeNextFile();
          if (file) {
            slots.push({
              kind: "item",
              catIndex: c,
              itemIndex: i,
              promise: uploadToCloudinary(file.buffer, "chefmenus/items"),
            });
          }
        }
      }
    }

    // Addons
    for (let a = 0; a < parsedAddons.length; a++) {
      const addon = parsedAddons[a];
      const addonIsNewFile = addon.imageUrl?.startsWith("file");
      if (addon.cloudinaryId && (!addon.imageUrl || addonIsNewFile)) {
        orphanDeletePromises.push(
          cloudinary.uploader.destroy(addon.cloudinaryId).catch(() => null)
        );
      }
      if (addonIsNewFile) {
        const file = consumeNextFile();
        if (file) {
          slots.push({
            kind: "addon",
            addonIndex: a,
            promise: uploadToCloudinary(file.buffer, "chefmenus/addons"),
          });
        }
      }
    }

    // Fan out uploads
    const uploadResults = await Promise.all(slots.map(s => s.promise));
    Promise.allSettled(orphanDeletePromises).catch(() => null);

    // Index results
    const catUploadMap = new Map<number, any>();
    const itemUploadMap = new Map<string, any>();
    const addonUploadMap = new Map<number, any>();

    slots.forEach((slot, idx) => {
      const r = uploadResults[idx];
      if (slot.kind === "cat") catUploadMap.set(slot.catIndex, r);
      else if (slot.kind === "item") itemUploadMap.set(`${slot.catIndex}-${slot.itemIndex}`, r);
      else if (slot.kind === "addon") addonUploadMap.set(slot.addonIndex, r);
    });

    // ---- Assemble final categories ----
    const finalCategories: any[] = [];
    for (let c = 0; c < parsedCategories.length; c++) {
      const category = parsedCategories[c];
      let categoryImageUrl = category.imageUrl || "";
      let categoryCloudinaryId = category.cloudinaryId || "";

      const catUpload: any = catUploadMap.get(c);
      if (catUpload) {
        categoryImageUrl = catUpload.secure_url.replace(
          "/upload/",
          "/upload/f_auto,q_auto:good,w_300,c_limit/"
        );
        categoryCloudinaryId = catUpload.public_id;
      }

      const items: any[] = [];
      const catItems = category.items || [];
      for (let i = 0; i < catItems.length; i++) {
        const item = catItems[i];
        let itemImageUrl = item.imageUrl || "";
        let itemCloudinaryId = item.cloudinaryId || "";

        const itemUpload: any = itemUploadMap.get(`${c}-${i}`);
        if (itemUpload) {
          itemImageUrl = itemUpload.secure_url.replace(
            "/upload/",
            "/upload/f_auto,q_auto:good,w_400,c_limit/"
          );
          itemCloudinaryId = itemUpload.public_id;
        }

        items.push({
          name: item.name,
          imageUrl: itemImageUrl,
          cloudinaryId: itemCloudinaryId,
          price: item.price !== undefined && item.price !== "" && item.price !== null ? Number(item.price) : undefined,
        });
      }

      finalCategories.push({
        name: category.name,
        imageUrl: categoryImageUrl,
        cloudinaryId: categoryCloudinaryId,
        maxItems: category.maxItems !== undefined ? Number(category.maxItems) : 1,
        items: items,
      });
    }

    // ---- Assemble final addons ----
    const finalAddons: any[] = [];
    for (let a = 0; a < parsedAddons.length; a++) {
      const addon = parsedAddons[a];
      let addonImageUrl = addon.imageUrl || "";
      let addonCloudinaryId = addon.cloudinaryId || "";

      const addonUpload: any = addonUploadMap.get(a);
      if (addonUpload) {
        addonImageUrl = addonUpload.secure_url.replace("/upload/", "/upload/f_auto,q_auto:good,w_400,c_limit/");
        addonCloudinaryId = addonUpload.public_id;
      }

      finalAddons.push({
        name: addon.name,
        imageUrl: addonImageUrl,
        cloudinaryId: addonCloudinaryId,
        price: addon.price !== undefined && addon.price !== null && addon.price !== "" ? Number(addon.price) : undefined
      });
    }

    const updatedMenu = await ChefMenu.findByIdAndUpdate(
      id,
      { 
        daawathCategories: finalCategories,
        daawathAddons: finalAddons
      },
      { new: true }
    );

    res.json(updatedMenu);
  } catch (err: any) {
    console.error("Save Daawath error:", err);
    res.status(500).json({ message: "Failed to save Daawath configurations" });
  }
};

// ==========================================
// CHEF PLAN CONTROLLERS
// ==========================================

export const addChefPlan = async (req: any, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const chef = await Chef.findOne({ user: userId });
    if (!chef) return res.status(404).json({ message: "Chef not found" });

    const { name, description, mealsPerDay, mealsPerWeek, price, category, categoryId } = req.body;
    const heroFile = req.files?.heroImage?.[0];

    if (!name || !description || !mealsPerDay || !mealsPerWeek || !price || !category || !heroFile) {
      return res.status(400).json({ message: "All fields and hero image are required" });
    }

    const upload: any = await uploadToCloudinary(heroFile.buffer, "chef-plans");

    const heroImageUrl = upload.secure_url.replace(
      "/upload/",
      "/upload/f_auto,q_auto:good,w_900,c_limit/"
    );

    const plan = await ChefPlan.create({
      user: userId,
      chef: chef._id,
      categoryId: categoryId || undefined,
      name,
      description,
      mealsPerDay: Number(mealsPerDay),
      mealsPerWeek: Number(mealsPerWeek),
      price: Number(price),
      category,
      heroImageUrl,
      cloudinaryId: upload.public_id,
    });

    res.status(201).json(plan);
  } catch (err: any) {
    console.error("Add chef plan error:", err);
    res.status(500).json({ message: "Error creating plan" });
  }
};

export const updateChefPlan = async (req: any, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const plan = await ChefPlan.findById(id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });

    if (plan.user.toString() !== userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const { name, description, mealsPerDay, mealsPerWeek, price, category, categoryId } = req.body;
    const heroFile = req.files?.heroImage?.[0];

    let heroImageUrl = plan.heroImageUrl;
    let cloudinaryId = plan.cloudinaryId;

    if (heroFile) {
      if (cloudinaryId) {
        try { await cloudinary.uploader.destroy(cloudinaryId); } catch (e) {}
      }

      const upload: any = await uploadToCloudinary(heroFile.buffer, "chef-plans");

      heroImageUrl = upload.secure_url.replace(
        "/upload/",
        "/upload/f_auto,q_auto:good,w_900,c_limit/"
      );
      cloudinaryId = upload.public_id;
    }

    const updated = await ChefPlan.findByIdAndUpdate(
      id,
      { 
        name, 
        description, 
        mealsPerDay: Number(mealsPerDay), 
        mealsPerWeek: Number(mealsPerWeek), 
        price: Number(price), 
        category, 
        ...(categoryId && { categoryId }),
        heroImageUrl,
        cloudinaryId 
      },
      { new: true }
    );

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating plan" });
  }
};

export const getChefPlans = async (req: Request, res: Response) => {
  try {
    const plans = await ChefPlan.find({ chef: req.params.chefId });
    res.json(plans);
  } catch (err) {
    res.status(500).json({ message: "Error fetching plans" });
  }
};

export const deleteChefPlan = async (req: any, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const plan = await ChefPlan.findById(id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });

    if (plan.user.toString() !== userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const deletes: Promise<any>[] = [];
    if (plan.cloudinaryId) deletes.push(cloudinary.uploader.destroy(plan.cloudinaryId).catch(() => null));

    if (plan.mealBoxData) {
      for (const [dayKey, dayData] of plan.mealBoxData.entries()) {
        const meals = [dayData.Breakfast, dayData.Lunch, dayData.Dinner, dayData.Snacks];
        for (const meal of meals) {
          if (meal) {
            for (const [sectionKey, sectionWrapper] of meal.entries()) {
              const itemsList = sectionWrapper?.items || [];
              for (const item of itemsList) {
                if (item.cloudinaryId) deletes.push(cloudinary.uploader.destroy(item.cloudinaryId).catch(() => null));
              }
            }
          }
        }
      }
    }

    await ChefPlan.findByIdAndDelete(id);
    Promise.allSettled(deletes).catch(() => null);

    res.json({ message: "Plan deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting plan" });
  }
};

export const deletePlanImage = async (req: any, res: Response) => {
  try {
    const { publicId } = req.body;
    if (!publicId) return res.status(400).json({ message: "publicId is required" });
    await cloudinary.uploader.destroy(publicId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete image" });
  }
};

export const savePlanMealBoxItems = async (req: any, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const plan = await ChefPlan.findById(id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });

    if (plan.user.toString() !== userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const mealBoxDataInput = JSON.parse(req.body.mealBoxData || "{}");
    const files = req.files || [];
    let filePointer = 0;
    const consumeNextFile = () => {
      if (filePointer >= files.length) return null;
      return files[filePointer++];
    };

    // ---- Identify incoming cloudinary ids (for orphan cleanup) ----
    const incomingCloudinaryIds = new Set<string>();
    Object.values(mealBoxDataInput).forEach((dayData: any) => {
      if (dayData) {
        ["Breakfast", "Lunch", "Dinner", "Snacks"].forEach((mealType) => {
          const sections = dayData[mealType] || {};
          Object.values(sections).forEach((sectionWrapper: any) => {
            const itemsList = sectionWrapper?.items || (Array.isArray(sectionWrapper) ? sectionWrapper : []);
            if (Array.isArray(itemsList)) {
              itemsList.forEach((item) => {
                if (item.cloudinaryId) incomingCloudinaryIds.add(item.cloudinaryId);
              });
            }
          });
        });
      }
    });

    // Queue orphan deletes (background)
    const orphanDeletePromises: Promise<any>[] = [];
    if (plan.mealBoxData) {
      for (const [dayKey, dayData] of plan.mealBoxData.entries()) {
        const meals = [dayData.Breakfast, dayData.Lunch, dayData.Dinner, dayData.Snacks];
        for (const meal of meals) {
          if (meal) {
            for (const [sectionKey, sectionWrapper] of meal.entries()) {
              const itemsList = sectionWrapper?.items || [];
              for (const item of itemsList) {
                if (item.cloudinaryId && !incomingCloudinaryIds.has(item.cloudinaryId)) {
                  orphanDeletePromises.push(
                    cloudinary.uploader.destroy(item.cloudinaryId).catch(() => null)
                  );
                }
              }
            }
          }
        }
      }
    }

    // ---- Queue all uploads in parallel ----
    type MealSlot = {
      dayKey: string;
      mealType: string;
      sectionKey: string;
      itemIndex: number;
      promise: Promise<any>;
    };
    const slots: MealSlot[] = [];

    for (const [dayKey, dayData] of Object.entries(mealBoxDataInput)) {
      const currentDay: any = dayData;
      for (const mealType of ["Breakfast", "Lunch", "Dinner", "Snacks"]) {
        const sections = currentDay[mealType] || {};
        for (const [sectionKey, sectionWrapper] of Object.entries(sections)) {
          const rawItems = (sectionWrapper && Array.isArray((sectionWrapper as any).items))
            ? (sectionWrapper as any).items
            : (Array.isArray(sectionWrapper) ? sectionWrapper : []);

          if (!Array.isArray(rawItems)) continue;

          for (let iIdx = 0; iIdx < rawItems.length; iIdx++) {
            const item = rawItems[iIdx];
            const isNewFile = item.image && (item.image.startsWith("file") || item.image.startsWith("content"));
            if (isNewFile) {
              const file = consumeNextFile();
              if (file) {
                slots.push({
                  dayKey,
                  mealType,
                  sectionKey,
                  itemIndex: iIdx,
                  promise: uploadToCloudinary(file.buffer, "chef-plans/mealbox"),
                });
              }
            }
          }
        }
      }
    }

    // Fan out uploads
    const uploadResults = await Promise.all(slots.map(s => s.promise));
    Promise.allSettled(orphanDeletePromises).catch(() => null);

    const uploadMap = new Map<string, any>();
    slots.forEach((slot, idx) => {
      uploadMap.set(`${slot.dayKey}|${slot.mealType}|${slot.sectionKey}|${slot.itemIndex}`, uploadResults[idx]);
    });

    // ---- Assemble final mealBoxData ----
    const updatedMealBoxData: any = {};

    for (const [dayKey, dayData] of Object.entries(mealBoxDataInput)) {
      updatedMealBoxData[dayKey] = { Breakfast: {}, Lunch: {}, Dinner: {}, Snacks: {} };
      const currentDay: any = dayData;

      for (const mealType of ["Breakfast", "Lunch", "Dinner", "Snacks"]) {
        const sections = currentDay[mealType] || {};
        for (const [sectionKey, sectionWrapper] of Object.entries(sections)) {
          const processedItems: any[] = [];

          const rawItems = (sectionWrapper && Array.isArray((sectionWrapper as any).items))
            ? (sectionWrapper as any).items
            : (Array.isArray(sectionWrapper) ? sectionWrapper : []);

          const maxSelectable = (sectionWrapper && typeof (sectionWrapper as any).maxItems === "number")
            ? (sectionWrapper as any).maxItems
            : 1;

          if (Array.isArray(rawItems)) {
            for (let iIdx = 0; iIdx < rawItems.length; iIdx++) {
              const item = rawItems[iIdx];
              let image = item.image || "";
              let cloudinaryId = item.cloudinaryId || "";

              const isNewFile = image && (image.startsWith("file") || image.startsWith("content"));

              if (isNewFile) {
                const upload: any = uploadMap.get(`${dayKey}|${mealType}|${sectionKey}|${iIdx}`);
                if (upload) {
                  image = upload.secure_url.replace("/upload/", "/upload/f_auto,q_auto:good,w_400,c_limit/");
                  cloudinaryId = upload.public_id;
                }
              }

              processedItems.push({
                id: item.id,
                name: item.name,
                price: item.price ? Number(item.price) : undefined,
                image,
                cloudinaryId,
                active: item.active !== undefined ? item.active : true
              });
            }
          }

          updatedMealBoxData[dayKey][mealType][sectionKey] = {
            items: processedItems,
            maxItems: maxSelectable
          };
        }
      }
    }

    const updatedPlan = await ChefPlan.findByIdAndUpdate(
      id,
      { mealBoxData: updatedMealBoxData },
      { new: true }
    );

    res.json(updatedPlan);
  } catch (err: any) {
    console.error("Save plan meal box items error:", err);
    res.status(500).json({ message: "Failed to save plan items details" });
  }
};