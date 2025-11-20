import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { getWorkspace, saveWorkspace } from "../controllers/TokenController.js";

const router = express.Router();

router.get("/workspace", requireAuth, getWorkspace);
router.put("/workspace", requireAuth, saveWorkspace);
//router.post('/workspace/export', exportWorkspace);
export default router;
