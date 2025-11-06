import jwt from "jsonwebtoken";

export const requireAuth = (req, res, next) => {
  const token = req.cookies?.jwt;
  if (!token) return res.status(401).json({ ok: false, message: "No token" });

  jwt.verify(token, "dinasaur secret", (err, decoded) => {
    if (err)
      return res.status(401).json({ ok: false, message: "Invalid token" });
    req.user = decoded;
    next();
  });
};
