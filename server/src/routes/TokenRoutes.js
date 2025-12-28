import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  getWorkspace,
  saveWorkspace,
  exportTokens,
  syncFigmaTokens,
} from "../controllers/TokenController.js";

const router = express.Router();

router.get("/workspace", requireAuth, getWorkspace);
router.put("/workspace", requireAuth, saveWorkspace);
router.get("/export/:designSystemId", requireAuth, exportTokens);
router.post("/figma-sync", requireAuth, syncFigmaTokens);

export default router;
