import express from "express";
import { postSignup } from "../controllers/AuthController.js";
import { postLogin } from "../controllers/AuthController.js";
import { getLogout } from "../controllers/AuthController.js";

const router = express.Router();

router.post("/signup", postSignup);
router.post("/login", postLogin);
router.get("/logout", getLogout);

export default router;
