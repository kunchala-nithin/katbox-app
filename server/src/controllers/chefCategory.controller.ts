import { Request, Response } from "express";
import ChefCategory, { ChefMenu, ChefPlan } from "../models/chefCategory";
import Chef from "../models/Chef";
import cloudinary from "../config/cloudinary";

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

    const upload: any = await new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ 
          folder: "chef-categories", 
          quality: "auto:good", 
          fetch_format: "auto" 
        }, (error, result) => {
          if (error) reject(error);
          else resolve(result);
        })
        .end(heroFile.buffer);
    });

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

      const upload: any = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream({ 
            folder: "chef-categories", 
            quality: "auto:good", 
            fetch_format: "auto" 
          }, (error, result) => {
            if (error) reject(error);
            else resolve(result);
          })
          .end(heroFile.buffer);
      });

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
    let fileIndex = 0;

    const getNextFile = () => {
      if (fileIndex >= files.length) return null;
      return files[fileIndex++];
    };

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

    for (const orphanId of orphanedIds) {
      try {
        await cloudinary.uploader.destroy(orphanId);
      } catch (e) {}
    }

    const finalSubCategories: any[] = [];

    for (const sub of parsedSubCategories) {
      const items: any[] = [];

      for (const item of sub.items || []) {
        let imageUrl = item.imageUrl || "";
        let cloudinaryId = item.cloudinaryId || "";

        const isNewFile = item.image && item.image.startsWith("file");

        if (cloudinaryId && isNewFile) {
          try {
            await cloudinary.uploader.destroy(cloudinaryId);
          } catch (e) {}
        }

        if (isNewFile) {
          const file = getNextFile();
          if (file) {
            const upload: any = await new Promise((resolve, reject) => {
              cloudinary.uploader
                .upload_stream({ 
                  folder: "chef-categories/items", 
                  quality: "auto:good", 
                  fetch_format: "auto" 
                }, (error, result) => {
                  if (error) reject(error);
                  else resolve(result);
                })
                .end(file.buffer);
            });

            imageUrl = upload.secure_url.replace(
              "/upload/",
              "/upload/f_auto,q_auto:good,w_500,c_limit/"
            );
            cloudinaryId = upload.public_id;
          }
        }

        items.push({
          name: item.name,
          description: item.description || "",
          imageUrl,
          cloudinaryId,
          price: Number(item.price),
          quantity: item.quantity,
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

    const { name, price, itemsPerPlate, mealType, plateItems, categoryId } = req.body;

    if (!name || !price || !itemsPerPlate || !mealType) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const parsedItems = JSON.parse(plateItems || "[]");

    const heroFile = req.files?.heroImage?.[0];
    const itemFiles = req.files?.itemImages || [];

    if (!heroFile) {
      return res.status(400).json({ message: "Hero image is required" });
    }

    const heroUpload: any = await new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ folder: "chefmenus", quality: "auto:good", fetch_format: "auto" }, (error, result) => {
          if (error) reject(error);
          else resolve(result);
        })
        .end(heroFile.buffer);
    });

    const heroImageUrl = heroUpload.secure_url.replace(
      "/upload/",
      "/upload/f_auto,q_auto:good,w_900,c_limit/"
    );

    const uploadedItems: any[] = [];

    for (let i = 0; i < parsedItems.length; i++) {
      let imageUrl = "";
      let cloudinaryId = "";

      const itemFile = itemFiles[i];

      if (itemFile) {
        const upload: any = await new Promise((resolve, reject) => {
          cloudinary.uploader
            .upload_stream({ folder: "chefmenus/items", quality: "auto:good", fetch_format: "auto" }, (error, result) => {
              if (error) reject(error);
              else resolve(result);
            })
            .end(itemFile.buffer);
        });

        imageUrl = upload.secure_url.replace(
          "/upload/",
          "/upload/f_auto,q_auto:good,w_400,c_limit/"
        );
        cloudinaryId = upload.public_id;
      }

      uploadedItems.push({
        name: parsedItems[i]?.name || "",
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
      heroCloudinaryId: heroUpload.public_id,
      plateItems: uploadedItems,
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

    const { name, price, itemsPerPlate, mealType, plateItems, categoryId } = req.body;

    let heroImageUrl = menu.heroImageUrl;
    let heroCloudinaryId = menu.heroCloudinaryId;

    const heroFile = req.files?.heroImage?.[0];
    if (heroFile) {
      if (heroCloudinaryId) {
        try { await cloudinary.uploader.destroy(heroCloudinaryId); } catch (e) {}
      }
      const heroUpload: any = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream({ folder: "chefmenus", quality: "auto:good", fetch_format: "auto" }, (error, result) => {
            if (error) reject(error);
            else resolve(result);
          })
          .end(heroFile.buffer);
      });
      heroImageUrl = heroUpload.secure_url.replace("/upload/", "/upload/f_auto,q_auto:good,w_900,c_limit/");
      heroCloudinaryId = heroUpload.public_id;
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

    if (menu.heroCloudinaryId) {
      try { await cloudinary.uploader.destroy(menu.heroCloudinaryId); } catch (e) {}
    }

    for (const item of menu.plateItems) {
      if (item.cloudinaryId) {
        try { await cloudinary.uploader.destroy(item.cloudinaryId); } catch (e) {}
      }
    }

    if (menu.daawathCategories && menu.daawathCategories.length > 0) {
      for (const cat of menu.daawathCategories) {
        if (cat.cloudinaryId) {
          try { await cloudinary.uploader.destroy(cat.cloudinaryId); } catch (e) {}
        }
        if (cat.items && cat.items.length > 0) {
          for (const item of cat.items) {
            if (item.cloudinaryId) {
              try { await cloudinary.uploader.destroy(item.cloudinaryId); } catch (e) {}
            }
          }
        }
      }
    }

    if (menu.daawathAddons && menu.daawathAddons.length > 0) {
      for (const addon of menu.daawathAddons) {
        if (addon.cloudinaryId) {
          try { await cloudinary.uploader.destroy(addon.cloudinaryId); } catch (e) {}
        }
      }
    }

    await ChefMenu.findByIdAndDelete(id);
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
    let fileIndex = 0;

    const getNextFile = () => {
      if (fileIndex >= files.length) return null;
      return files[fileIndex++];
    };

    const finalCategories: any[] = [];

    for (const category of parsedCategories) {
      let categoryImageUrl = category.imageUrl || "";
      let categoryCloudinaryId = category.cloudinaryId || "";

      const isNewFile = categoryImageUrl?.startsWith("file");
      if (categoryCloudinaryId && (!categoryImageUrl || isNewFile)) {
        try { await cloudinary.uploader.destroy(categoryCloudinaryId); } catch (e) {}
      }

      if (isNewFile) {
        const file = getNextFile();
        if (file) {
          const upload: any = await new Promise((resolve, reject) => {
            cloudinary.uploader
              .upload_stream({ folder: "chefmenus/categories", quality: "auto:good", fetch_format: "auto" }, (error, result) => {
                if (error) reject(error);
                else resolve(result);
              })
              .end(file.buffer);
          });

          categoryImageUrl = upload.secure_url.replace(
            "/upload/",
            "/upload/f_auto,q_auto:good,w_300,c_limit/"
          );
          categoryCloudinaryId = upload.public_id;
        }
      }

      // Process single items array (no veg/non-veg split)
      const items: any[] = [];
      for (const item of category.items || []) {
        let itemImageUrl = item.imageUrl || "";
        let itemCloudinaryId = item.cloudinaryId || "";
        const itemIsNewFile = itemImageUrl?.startsWith("file");

        if (itemCloudinaryId && (!itemImageUrl || itemIsNewFile)) {
          try { await cloudinary.uploader.destroy(itemCloudinaryId); } catch (e) {}
        }

        if (itemIsNewFile) {
          const file = getNextFile();
          if (file) {
            const upload: any = await new Promise((resolve, reject) => {
              cloudinary.uploader
                .upload_stream({ folder: "chefmenus/items", quality: "auto:good", fetch_format: "auto" }, (error, result) => {
                  if (error) reject(error);
                  else resolve(result);
                })
                .end(file.buffer);
            });

            itemImageUrl = upload.secure_url.replace(
              "/upload/",
              "/upload/f_auto,q_auto:good,w_400,c_limit/"
            );
            itemCloudinaryId = upload.public_id;
          }
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

    const finalAddons: any[] = [];
    for (const addon of parsedAddons) {
      let addonImageUrl = addon.imageUrl || "";
      let addonCloudinaryId = addon.cloudinaryId || "";
      const addonIsNewFile = addonImageUrl?.startsWith("file");

      if (addonCloudinaryId && (!addonImageUrl || addonIsNewFile)) {
        try { await cloudinary.uploader.destroy(addonCloudinaryId); } catch (e) {}
      }

      if (addonIsNewFile) {
        const file = getNextFile();
        if (file) {
          const upload: any = await new Promise((resolve, reject) => {
            cloudinary.uploader
              .upload_stream({ folder: "chefmenus/addons", quality: "auto:good", fetch_format: "auto" }, (error, result) => {
                if (error) reject(error);
                else resolve(result);
              })
              .end(file.buffer);
          });
          addonImageUrl = upload.secure_url.replace("/upload/", "/upload/f_auto,q_auto:good,w_400,c_limit/");
          addonCloudinaryId = upload.public_id;
        }
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

    const upload: any = await new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ 
          folder: "chef-plans", 
          quality: "auto:good", 
          fetch_format: "auto" 
        }, (error, result) => {
          if (error) reject(error);
          else resolve(result);
        })
        .end(heroFile.buffer);
    });

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

      const upload: any = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream({ 
            folder: "chef-plans", 
            quality: "auto:good", 
            fetch_format: "auto" 
          }, (error, result) => {
            if (error) reject(error);
            else resolve(result);
          })
          .end(heroFile.buffer);
      });

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

    if (plan.cloudinaryId) {
      try {
        await cloudinary.uploader.destroy(plan.cloudinaryId);
      } catch (e) {}
    }

    // Clean up associated mealbox item images if any exist
    if (plan.mealBoxData) {
      for (const [dayKey, dayData] of plan.mealBoxData.entries()) {
        const meals = [dayData.Lunch, dayData.Dinner];
        for (const meal of meals) {
          if (meal) {
            for (const [sectionKey, sectionWrapper] of meal.entries()) {
              const itemsList = sectionWrapper?.items || [];
              for (const item of itemsList) {
                if (item.cloudinaryId) {
                  try { await cloudinary.uploader.destroy(item.cloudinaryId); } catch (e) {}
                }
              }
            }
          }
        }
      }
    }

    await ChefPlan.findByIdAndDelete(id);
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
    let fileIndex = 0;

    const getNextFile = () => {
      if (fileIndex >= files.length) return null;
      return files[fileIndex++];
    };

    // Clean up any missing images if they are explicitly modified/orphaned
    const incomingCloudinaryIds = new Set<string>();
    Object.values(mealBoxDataInput).forEach((dayData: any) => {
      if (dayData) {
        ["Lunch", "Dinner"].forEach((mealType) => {
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

    if (plan.mealBoxData) {
      for (const [dayKey, dayData] of plan.mealBoxData.entries()) {
        const meals = [dayData.Lunch, dayData.Dinner];
        for (const meal of meals) {
          if (meal) {
            for (const [sectionKey, sectionWrapper] of meal.entries()) {
              const itemsList = sectionWrapper?.items || [];
              for (const item of itemsList) {
                if (item.cloudinaryId && !incomingCloudinaryIds.has(item.cloudinaryId)) {
                  try { await cloudinary.uploader.destroy(item.cloudinaryId); } catch (e) {}
                }
              }
            }
          }
        }
      }
    }

    // Process fresh files
    const updatedMealBoxData: any = {};

    for (const [dayKey, dayData] of Object.entries(mealBoxDataInput)) {
      updatedMealBoxData[dayKey] = { Lunch: {}, Dinner: {} };
      const currentDay: any = dayData;

      for (const mealType of ["Lunch", "Dinner"]) {
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
            for (const item of rawItems) {
              let image = item.image || "";
              let cloudinaryId = item.cloudinaryId || "";

              const isNewFile = image && (image.startsWith("file") || image.startsWith("content"));

              if (isNewFile) {
                const file = getNextFile();
                if (file) {
                  const upload: any = await new Promise((resolve, reject) => {
                    cloudinary.uploader
                      .upload_stream({ folder: "chef-plans/mealbox", quality: "auto:good", fetch_format: "auto" }, (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                      })
                      .end(file.buffer);
                  });
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