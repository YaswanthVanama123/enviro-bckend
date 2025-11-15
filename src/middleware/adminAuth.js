// src/middleware/adminAuth.js
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

// create a JWT for an admin
export function signAdminToken(admin) {
  const payload = {
    id: admin._id.toString(),
    username: admin.username,
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// guard middleware: only admins with valid token can pass
export function requireAdminAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!token) {
    return res
      .status(401)
      .json({ error: "Unauthorized", detail: "Missing Authorization token" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = { id: decoded.id, username: decoded.username };
    next();
  } catch (err) {
    return res
      .status(401)
      .json({ error: "Unauthorized", detail: "Invalid or expired token" });
  }
}
