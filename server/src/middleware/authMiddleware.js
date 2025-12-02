import jwt from "jsonwebtoken";

export const requireAuth = (req, res, next) => {
  const cookieToken = req.cookies?.jwt;

  const authHeader = req.headers.authorization || "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  const token = cookieToken || bearerToken;

  if (!token) return res.status(401).json({ ok: false, message: "No token" });

  jwt.verify(token, "dinasaur secret", (err, decoded) => {
    if (err)
      return res.status(401).json({ ok: false, message: "Invalid token" });
    req.user = decoded;
    next();
  });
};
