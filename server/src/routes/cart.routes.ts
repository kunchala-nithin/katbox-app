import express from 'express';
import { protect } from '../middleware/auth.middleware';
import { addToCart, deleteCart, getUserCart, updateCart } from '../controllers/cart.controller';

const router = express.Router();

router.post('/add', protect, addToCart);
router.post('/', protect, addToCart); // ✅ Fixes potential 404 when calling POST /api/cart directly
router.get('/', protect, getUserCart);
router.put('/update/:cartId', protect, updateCart);
router.delete('/:cartId', protect, deleteCart);

export default router;