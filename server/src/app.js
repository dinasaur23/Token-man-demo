import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import path from "path";
import { connectDB } from "../config/db.js";
import TokenRoutes from "../src/routes/TokenRoutes.js";
import AuthRoutes from "../src/routes/AuthRoutes.js";
import DesignSystemRoutes from "../src/routes/designSystemRoutes.js";
import { requireAuth } from "../src/middleware/authMiddleware.js";
import { resolveTokensFromResolverFile } from "../src/tokens/resolver.js";
dotenv.config();

const app = express();
connectDB();
app.use(morgan("combined"));
app.use(bodyParser.json());
app.use(cors());
app.use(express.json());
app.use(cookieParser());

app.use((req, res, next) => {
  console.log("REQUEST:", req.method, req.url);
  next();
});

//routes
app.use("/api/auth", AuthRoutes);
app.use("/api/tokens", TokenRoutes);
app.use("/api/design-systems", DesignSystemRoutes);

app.get("/api/auth/check", requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});
app.get("/api/tokens", async (req, res, next) => {
  try {
    const theme = req.query.theme || "light";

    const resolverPath = path.join(
      process.cwd(),
      "src",
      "tokens",
      "tokens.resolver.json",
    );

    const tokens = await resolveTokensFromResolverFile(resolverPath, { theme });

    res.json(tokens);
  } catch (err) {
    next(err);
  }
});

//cookies
//const PORT = process.env.PORT || 8081;
// app.listen(PORT, () => {
//   console.log("server started on PORT:", PORT);
// });

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 8081;

  app.listen(PORT, () => {
    console.log("server started on PORT:", PORT);
  });
}

export default app;
