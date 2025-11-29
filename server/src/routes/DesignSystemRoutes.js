import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  listDesignSystems,
  createDesignSystem,
  renameDesignSystem,
  deleteDesignSystem,
} from "../controllers/DesignSystemController.js";

const router = express.Router();

router.get("/", requireAuth, listDesignSystems);
router.post("/", requireAuth, createDesignSystem);
router.patch("/:id", requireAuth, renameDesignSystem);
router.delete("/:id", requireAuth, deleteDesignSystem);

export default router;
