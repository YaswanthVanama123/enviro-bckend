// src/controllers/adminAuthController.js
import bcrypt from "bcryptjs";
import AdminUser from "../models/AdminUser.js";
import { signAdminToken } from "../middleware/adminAuth.js";

/**
 * POST /api/admin/login
 * Body: { username, password }
 */
export async function adminLogin(req, res) {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Bad Request", detail: "username and password are required" });
    }

    const admin = await AdminUser.findOne({ username }).exec();
    if (!admin || !admin.isActive) {
      return res
        .status(401)
        .json({ error: "Unauthorized", detail: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) {
      return res
        .status(401)
        .json({ error: "Unauthorized", detail: "Invalid credentials" });
    }

    const token = signAdminToken(admin);

    admin.lastLoginAt = new Date();
    await admin.save();

    res.json({
      token,
      admin: {
        id: admin._id,
        username: admin.username,
      },
    });
  } catch (err) {
    console.error("adminLogin error:", err);
    res.status(500).json({ error: "Login failed", detail: String(err) });
  }
}

/**
 * POST /api/admin/change-password
 * Headers: Authorization: Bearer <token>
 * Body: { oldPassword, newPassword }
 */
export async function changeAdminPassword(req, res) {
  try {
    const { oldPassword, newPassword } = req.body || {};

    if (!oldPassword || !newPassword) {
      return res
        .status(400)
        .json({ error: "Bad Request", detail: "oldPassword and newPassword are required" });
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ error: "Bad Request", detail: "New password must be at least 6 characters" });
    }

    const adminId = req.admin?.id;
    if (!adminId) {
      return res
        .status(401)
        .json({ error: "Unauthorized", detail: "Missing admin from token" });
    }

    const admin = await AdminUser.findById(adminId).exec();
    if (!admin) {
      return res
        .status(404)
        .json({ error: "Not found", detail: "Admin user not found" });
    }

    const ok = await bcrypt.compare(oldPassword, admin.passwordHash);
    if (!ok) {
      return res
        .status(401)
        .json({ error: "Unauthorized", detail: "Old password is incorrect" });
    }

    admin.passwordHash = await bcrypt.hash(newPassword, 10);
    admin.passwordChangedAt = new Date();
    await admin.save();

    res.json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    console.error("changeAdminPassword error:", err);
    res
      .status(500)
      .json({ error: "Password change failed", detail: String(err) });
  }
}

/**
 * GET /api/admin/me
 * Headers: Authorization: Bearer <token>
 */
export async function getAdminProfile(req, res) {
  try {
    const adminId = req.admin?.id;
    if (!adminId) {
      return res
        .status(401)
        .json({ error: "Unauthorized", detail: "Missing admin from token" });
    }

    const admin = await AdminUser.findById(adminId)
      .select("_id username isActive lastLoginAt createdAt updatedAt")
      .lean();

    if (!admin) {
      return res
        .status(404)
        .json({ error: "Not found", detail: "Admin user not found" });
    }

    res.json({ admin });
  } catch (err) {
    console.error("getAdminProfile error:", err);
    res
      .status(500)
      .json({ error: "Failed to fetch admin profile", detail: String(err) });
  }
}

/**
 * POST /api/admin/create
 * Headers: Authorization: Bearer <token>
 * Body: { username, password, isActive? }
 */
export async function createAdminAccount(req, res) {
  try {
    const { username, password, isActive } = req.body || {};

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Bad Request", detail: "username and password are required" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: "Bad Request", detail: "Password must be at least 6 characters" });
    }

    const existing = await AdminUser.findOne({ username }).lean();
    if (existing) {
      return res
        .status(409)
        .json({ error: "Conflict", detail: "Username already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const admin = await AdminUser.create({
      username,
      passwordHash,
      isActive: typeof isActive === "boolean" ? isActive : true,
    });

    res.status(201).json({
      success: true,
      admin: {
        id: admin._id,
        username: admin.username,
        isActive: admin.isActive,
        createdAt: admin.createdAt,
      },
    });
  } catch (err) {
    console.error("createAdminAccount error:", err);
    res
      .status(500)
      .json({ error: "Create admin failed", detail: String(err) });
  }
}
