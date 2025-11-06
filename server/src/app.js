import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";

import { connectDB } from "../config/db.js";
import TokenRoutes from "../src/routes/TokenRoutes.js";
import AuthRoutes from "../src/routes/AuthRoutes.js";
import { requireAuth } from "../src/middleware/authMiddleware.js";
dotenv.config();

const app = express();
connectDB();
app.use(morgan("combined"));
app.use(bodyParser.json());
app.use(cors());
app.use(express.json());
app.use(cookieParser());

//routes
app.use("/api/auth", AuthRoutes);
app.use("/api/token", TokenRoutes);
app.get("/api/auth/check", requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

//cookies

const PORT = process.env.PORT || 8081;

app.listen(PORT, () => {
  console.log("server started on PORT:", PORT);
});
