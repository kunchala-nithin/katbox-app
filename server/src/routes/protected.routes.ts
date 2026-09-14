import express from "express";
import { protect } from "../middleware/auth.middleware";

const router = express.Router();

router.get("/me", protect, (req, res) => {
  res.json({
    message: "You are authenticated",
    user: (req as any).user,
  });
});

export default router;
