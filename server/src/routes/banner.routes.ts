import express from 'express';
import multer from 'multer';
import {
  getAllBanners,
  createBanner,
  updateBanner,
  deleteBanner,
} from '../controllers/banner.controller';

const router = express.Router();

// Memory storage — we stream buffers directly to Cloudinary.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB hard cap; compression happens server-side
});

// Public
router.get('/', getAllBanners);

// Admin (add your auth/admin middleware here if you have one)
router.post('/', upload.single('image'), createBanner);
router.put('/:id', upload.single('image'), updateBanner);
router.delete('/:id', deleteBanner);

export default router;