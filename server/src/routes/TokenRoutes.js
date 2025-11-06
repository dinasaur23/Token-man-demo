import express from "express";
import { getAllTokens } from "../controllers/TokenController.js";
import { createToken } from "../controllers/TokenController.js";
import { deleteToken } from "../controllers/TokenController.js";
import { updateToken } from "../controllers/TokenController.js";

const router = express.Router();

router.get("/", getAllTokens);

router.post("/", createToken);

router.put("/:id", updateToken);

router.delete("/:id", deleteToken);

export default router;
