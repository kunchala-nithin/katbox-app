import { Request, Response } from 'express';
import Banner from '../models/banner';
import cloudinary from '../config/cloudinary';

// ─────────────────────────────────────────────────────────────────────────────
// Strict image compression + replacement helper for Cloudinary.
// - Applies aggressive quality/format transformations so uploads stay small.
// - If `oldPublicId` is supplied, the old asset is destroyed AFTER the new
//   one is successfully uploaded (safe replace — no window of missing image).
// ─────────────────────────────────────────────────────────────────────────────
const uploadBannerImageToCloudinary = async (
  fileBuffer: Buffer,
  oldPublicId?: string
): Promise<{ url: string; publicId: string }> => {
  // 1) Upload the new asset with strict compression.
  const uploadResult: any = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'katbox/banners',
        resource_type: 'image',
        // Strict compression:
        quality: 'auto:eco',           // lowest reasonable quality tier
        fetch_format: 'auto',          // serve webp/avif when supported
        width: 1200,                   // cap width — banners never need >1200px
        height: 800,                   // cap height
        crop: 'limit',                 // never upscale, only downscale
        flags: 'progressive',          // progressive JPEGs for faster paint
        // Strip metadata to shave extra KB
        image_metadata: false,
        // Named transformations keep the delivered URL consistent
        transformation: [
          { width: 1200, height: 800, crop: 'limit' },
          { quality: 'auto:eco', fetch_format: 'auto' },
        ],
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    stream.end(fileBuffer);
  });

  const newUrl = uploadResult.secure_url as string;
  const newPublicId = uploadResult.public_id as string;

  // 2) Safe replace: destroy the OLD asset only after the new one is live.
  if (oldPublicId && oldPublicId !== newPublicId) {
    try {
      await cloudinary.uploader.destroy(oldPublicId, {
        resource_type: 'image',
        invalidate: true,
      });
    } catch (destroyErr) {
      // Non-fatal — log and continue. Orphan cleanup can be done later.
      console.log('Cloudinary old banner destroy error:', destroyErr);
    }
  }

  return { url: newUrl, publicId: newPublicId };
};

// ─── GET /api/banners ─── (public — Home screen fetches this)
export const getAllBanners = async (req: Request, res: Response) => {
  try {
    const { includeInactive } = req.query;
    const filter: any = {};
    if (includeInactive !== 'true') {
      filter.isActive = true;
    }
    const banners = await Banner.find(filter).sort({ displayOrder: 1, createdAt: -1 });
    return res.status(200).json({ success: true, banners });
  } catch (error: any) {
    console.log('getAllBanners error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch banners', error: error.message });
  }
};

// ─── POST /api/banners ─── (admin — multipart/form-data with `image` field)
export const createBanner = async (req: Request, res: Response) => {
  try {
    const file = (req as any).file;
    if (!file) {
      return res.status(400).json({ success: false, message: 'Banner image is required' });
    }

    const {
      titlePrimary = '',
      titleSecondary = '',
      tagline = '',
      badge = '',
      price = '',
      unit = '',
      isComingSoon = 'false',
      isFullBanner = 'false',
      displayOrder = '0',
      ctaAction = '',
      isActive = 'true',
    } = req.body;

    const { url, publicId } = await uploadBannerImageToCloudinary(file.buffer);

    const banner = await Banner.create({
      titlePrimary,
      titleSecondary,
      tagline,
      badge,
      price,
      unit,
      imageUrl: url,
      cloudinaryPublicId: publicId,
      isComingSoon: isComingSoon === 'true' || isComingSoon === true,
      isFullBanner: isFullBanner === 'true' || isFullBanner === true,
      isActive: isActive === 'true' || isActive === true,
      displayOrder: Number(displayOrder) || 0,
      ctaAction,
    });

    return res.status(201).json({ success: true, banner });
  } catch (error: any) {
    console.log('createBanner error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create banner', error: error.message });
  }
};

// ─── PUT /api/banners/:id ─── (admin — optional new image replaces old)
export const updateBanner = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await Banner.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Banner not found' });
    }

    const updates: any = {};
    const fields = [
      'titlePrimary',
      'titleSecondary',
      'tagline',
      'badge',
      'price',
      'unit',
      'ctaAction',
      'displayOrder',
    ];
    fields.forEach((f) => {
      if (req.body[f] !== undefined) {
        updates[f] = f === 'displayOrder' ? Number(req.body[f]) : req.body[f];
      }
    });

    if (req.body.isComingSoon !== undefined) {
      updates.isComingSoon = req.body.isComingSoon === 'true' || req.body.isComingSoon === true;
    }
    if (req.body.isFullBanner !== undefined) {
      updates.isFullBanner = req.body.isFullBanner === 'true' || req.body.isFullBanner === true;
    }
    if (req.body.isActive !== undefined) {
      updates.isActive = req.body.isActive === 'true' || req.body.isActive === true;
    }

    // If a new image was provided, upload it and destroy the old one.
    const file = (req as any).file;
    if (file) {
      const { url, publicId } = await uploadBannerImageToCloudinary(
        file.buffer,
        existing.cloudinaryPublicId
      );
      updates.imageUrl = url;
      updates.cloudinaryPublicId = publicId;
    }

    const banner = await Banner.findByIdAndUpdate(id, updates, { new: true });
    return res.status(200).json({ success: true, banner });
  } catch (error: any) {
    console.log('updateBanner error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update banner', error: error.message });
  }
};

// ─── DELETE /api/banners/:id ─── (admin — also removes Cloudinary asset)
export const deleteBanner = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const banner = await Banner.findById(id);
    if (!banner) {
      return res.status(404).json({ success: false, message: 'Banner not found' });
    }

    try {
      await cloudinary.uploader.destroy(banner.cloudinaryPublicId, {
        resource_type: 'image',
        invalidate: true,
      });
    } catch (cloudErr) {
      console.log('Cloudinary destroy error (non-fatal):', cloudErr);
    }

    await Banner.findByIdAndDelete(id);
    return res.status(200).json({ success: true, message: 'Banner deleted' });
  } catch (error: any) {
    console.log('deleteBanner error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete banner', error: error.message });
  }
};