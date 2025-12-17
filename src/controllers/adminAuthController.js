// src/controllers/adminAuthController.js
import bcrypt from "bcryptjs";
import AdminUser from "../models/AdminUser.js";
import { signAdminToken } from "../middleware/adminAuth.js";
import CustomerHeaderDoc from "../models/CustomerHeaderDoc.js";
import ManualUploadDocument from "../models/ManualUploadDocument.js";
import VersionPdf from "../models/VersionPdf.js";
import mongoose from "mongoose";

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

/**
 * GET /api/admin/dashboard
 * Headers: Authorization: Bearer <token>
 * Returns admin dashboard data including recent documents
 */
export async function getAdminDashboard(req, res) {
  try {
    // Check if we're in development mode without database
    if (mongoose.connection.readyState === 0) {
      console.log('⚠️ Database not connected, returning mock dashboard data');
      return res.json({
        stats: {
          manualUploads: 0,
          savedDocuments: 0,
          totalDocuments: 0
        },
        recentDocuments: [],
        documentStatus: {
          done: 0,
          pending: 0,
          saved: 0,
          drafts: 0
        }
      });
    }

    // Get document counts for dashboard stats
    const [
      manualUploadsCount,
      savedDocumentsCount,
      totalDocumentsCount,
      draftCount,
      savedCount,
      pendingCount
    ] = await Promise.all([
      ManualUploadDocument.countDocuments({ isDeleted: { $ne: true } }),
      CustomerHeaderDoc.countDocuments({
        isDeleted: { $ne: true },
        'pdf_meta.pdfBuffer': { $exists: true }
      }),
      CustomerHeaderDoc.countDocuments({ isDeleted: { $ne: true } }),
      CustomerHeaderDoc.countDocuments({ status: 'draft', isDeleted: { $ne: true } }),
      CustomerHeaderDoc.countDocuments({ status: 'saved', isDeleted: { $ne: true } }),
      CustomerHeaderDoc.countDocuments({ status: 'pending', isDeleted: { $ne: true } })
    ]);

    // Get recent documents (last 10)
    const recentDocuments = await CustomerHeaderDoc.find({
      isDeleted: { $ne: true }
    })
      .select({
        _id: 1,
        status: 1,
        createdAt: 1,
        updatedAt: 1,
        'payload.headerTitle': 1,
        'pdf_meta.sizeBytes': 1,
        'pdf_meta.storedAt': 1,
        'pdf_meta.pdfBuffer': 1,
        'zoho.bigin.dealId': 1,
        'zoho.bigin.fileId': 1,
      })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Transform recent documents to match admin panel format
    const transformedRecentDocuments = recentDocuments.map(doc => ({
      id: doc._id,
      title: doc.payload?.headerTitle || 'Untitled Document',
      status: doc.status || 'saved',
      createdDate: doc.createdAt,
      uploadedOn: doc.pdf_meta?.storedAt || doc.createdAt,
      hasPdf: !!(
        (doc.zoho?.bigin?.fileId && !doc.zoho.bigin.fileId.includes('MOCK_')) ||
        doc.pdf_meta?.pdfBuffer
      ),
      fileSize: doc.pdf_meta?.sizeBytes || 0,
      // Format dates for display
      createdDateFormatted: new Date(doc.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }),
      uploadedOnFormatted: new Date(doc.pdf_meta?.storedAt || doc.createdAt).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
      })
    }));

    const dashboardData = {
      stats: {
        manualUploads: manualUploadsCount,
        savedDocuments: savedDocumentsCount,
        totalDocuments: totalDocumentsCount
      },
      recentDocuments: transformedRecentDocuments,
      documentStatus: {
        done: 0, // You can adjust this based on your business logic
        pending: pendingCount,
        saved: savedCount,
        drafts: draftCount
      }
    };

    console.log(`📊 [ADMIN-DASHBOARD] Fetched dashboard data: ${transformedRecentDocuments.length} recent docs`);
    res.json(dashboardData);

  } catch (err) {
    console.error("getAdminDashboard error:", err);
    res.status(500).json({
      error: "Failed to fetch dashboard data",
      detail: String(err)
    });
  }
}

/**
 * GET /api/admin/recent-documents
 * Headers: Authorization: Bearer <token>
 * Query params: limit (default 20), page (default 1)
 * Returns paginated recent documents for admin panel
 */
export async function getAdminRecentDocuments(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit || "20", 10), 1),
      100
    );

    // Check if we're in development mode without database
    if (mongoose.connection.readyState === 0) {
      console.log('⚠️ Database not connected, returning empty recent documents');
      return res.json({
        total: 0,
        page,
        limit,
        documents: []
      });
    }

    const filter = { isDeleted: { $ne: true } };

    // Optional status filter for admin panel
    if (req.query.status) {
      filter.status = req.query.status;
    }

    const total = await CustomerHeaderDoc.countDocuments(filter);

    const documents = await CustomerHeaderDoc.find(filter)
      .select({
        _id: 1,
        status: 1,
        createdAt: 1,
        updatedAt: 1,
        'payload.headerTitle': 1,
        'pdf_meta.sizeBytes': 1,
        'pdf_meta.storedAt': 1,
        'pdf_meta.pdfBuffer': 1,
        'zoho.bigin.dealId': 1,
        'zoho.bigin.fileId': 1,
      })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // Transform documents for admin panel
    const transformedDocuments = documents.map(doc => ({
      id: doc._id,
      title: doc.payload?.headerTitle || 'Untitled Document',
      status: doc.status || 'saved',
      createdDate: doc.createdAt,
      uploadedOn: doc.pdf_meta?.storedAt || doc.createdAt,
      hasPdf: !!(
        (doc.zoho?.bigin?.fileId && !doc.zoho.bigin.fileId.includes('MOCK_')) ||
        doc.pdf_meta?.pdfBuffer
      ),
      fileSize: doc.pdf_meta?.sizeBytes || 0,
      // Format dates for display
      createdDateFormatted: new Date(doc.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }),
      uploadedOnFormatted: new Date(doc.pdf_meta?.storedAt || doc.createdAt).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
      })
    }));

    console.log(`📄 [ADMIN-RECENT] Fetched ${transformedDocuments.length} recent documents for page ${page}`);

    res.json({
      total,
      page,
      limit,
      documents: transformedDocuments
    });

  } catch (err) {
    console.error("getAdminRecentDocuments error:", err);
    res.status(500).json({
      error: "Failed to fetch recent documents",
      detail: String(err)
    });
  }
}
