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
 * Returns admin dashboard data including recent documents and real statistics
 */
export async function getAdminDashboard(req, res) {
  try {
    console.log('📊 [ADMIN-DASHBOARD] Starting dashboard data fetch...');
    console.log('📊 [DB-STATE] Connection state:', mongoose.connection.readyState);

    // Check database connection state
    if (mongoose.connection.readyState !== 1) {
      console.log('⚠️ [ADMIN-DASHBOARD] Database not connected, connection state:', mongoose.connection.readyState);
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
        },
        _debug: {
          databaseState: 'disconnected',
          connectionReadyState: mongoose.connection.readyState
        }
      });
    }

    console.log('📊 [ADMIN-DASHBOARD] Database connected, fetching statistics...');

    // Get document counts with detailed logging
    console.log('📊 [QUERY] Executing manual uploads count...');
    const manualUploadsCountQuery = ManualUploadDocument.countDocuments({
      $or: [
        { isDeleted: { $exists: false } },
        { isDeleted: false },
        { isDeleted: { $ne: true } }
      ]
    });

    console.log('📊 [QUERY] Executing saved documents count...');
    const savedDocumentsCountQuery = CustomerHeaderDoc.countDocuments({
      $and: [
        {
          $or: [
            { isDeleted: { $exists: false } },
            { isDeleted: false },
            { isDeleted: { $ne: true } }
          ]
        },
        {
          $or: [
            { 'pdf_meta.pdfBuffer': { $exists: true, $ne: null } },
            { 'zoho.bigin.fileId': { $exists: true, $ne: null } },
            { 'zoho.crm.fileId': { $exists: true, $ne: null } }
          ]
        }
      ]
    });

    console.log('📊 [QUERY] Executing total documents count...');
    const totalDocumentsCountQuery = CustomerHeaderDoc.countDocuments({
      $or: [
        { isDeleted: { $exists: false } },
        { isDeleted: false },
        { isDeleted: { $ne: true } }
      ]
    });

    console.log('📊 [QUERY] Executing status-based counts...');
    const draftCountQuery = CustomerHeaderDoc.countDocuments({
      status: 'draft',
      $or: [
        { isDeleted: { $exists: false } },
        { isDeleted: false },
        { isDeleted: { $ne: true } }
      ]
    });

    const savedCountQuery = CustomerHeaderDoc.countDocuments({
      status: 'saved',
      $or: [
        { isDeleted: { $exists: false } },
        { isDeleted: false },
        { isDeleted: { $ne: true } }
      ]
    });

    const pendingCountQuery = CustomerHeaderDoc.countDocuments({
      $and: [
        {
          $or: [
            { status: 'pending_approval' },
            { status: 'approved_salesman' }
          ]
        },
        {
          $or: [
            { isDeleted: { $exists: false } },
            { isDeleted: false },
            { isDeleted: { $ne: true } }
          ]
        }
      ]
    });

    const approvedCountQuery = CustomerHeaderDoc.countDocuments({
      status: 'approved_admin',
      $or: [
        { isDeleted: { $exists: false } },
        { isDeleted: false },
        { isDeleted: { $ne: true } }
      ]
    });

    // Execute all queries in parallel
    const [
      manualUploadsCount,
      savedDocumentsCount,
      totalDocumentsCount,
      draftCount,
      savedCount,
      pendingCount,
      approvedCount
    ] = await Promise.all([
      manualUploadsCountQuery,
      savedDocumentsCountQuery,
      totalDocumentsCountQuery,
      draftCountQuery,
      savedCountQuery,
      pendingCountQuery,
      approvedCountQuery
    ]);

    console.log('📊 [COUNTS] Manual uploads:', manualUploadsCount);
    console.log('📊 [COUNTS] Saved documents:', savedDocumentsCount);
    console.log('📊 [COUNTS] Total documents:', totalDocumentsCount);
    console.log('📊 [COUNTS] Draft:', draftCount);
    console.log('📊 [COUNTS] Saved:', savedCount);
    console.log('📊 [COUNTS] Pending:', pendingCount);
    console.log('📊 [COUNTS] Approved:', approvedCount);

    // Get recent documents (last 10) with better error handling
    console.log('📊 [QUERY] Fetching recent documents...');
    const recentDocuments = await CustomerHeaderDoc.find({
      $or: [
        { isDeleted: { $exists: false } },
        { isDeleted: false },
        { isDeleted: { $ne: true } }
      ]
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
        'zoho.crm.dealId': 1,
        'zoho.crm.fileId': 1,
      })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    console.log('📊 [RECENT] Found recent documents:', recentDocuments.length);

    // Transform recent documents to match admin panel format
    const transformedRecentDocuments = recentDocuments.map(doc => ({
      id: doc._id,
      title: doc.payload?.headerTitle || 'Untitled Document',
      status: doc.status || 'saved',
      createdDate: doc.createdAt,
      uploadedOn: doc.pdf_meta?.storedAt || doc.createdAt,
      hasPdf: !!(
        doc.pdf_meta?.pdfBuffer ||
        (doc.zoho?.bigin?.fileId && !doc.zoho.bigin.fileId.includes('MOCK_')) ||
        (doc.zoho?.crm?.fileId && !doc.zoho.crm.fileId.includes('MOCK_'))
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

    // Build comprehensive dashboard data
    const dashboardData = {
      stats: {
        manualUploads: manualUploadsCount,
        savedDocuments: savedDocumentsCount,
        totalDocuments: totalDocumentsCount
      },
      recentDocuments: transformedRecentDocuments,
      documentStatus: {
        done: approvedCount,
        pending: pendingCount,
        saved: savedCount,
        drafts: draftCount
      },
      _debug: {
        databaseState: 'connected',
        connectionReadyState: mongoose.connection.readyState,
        queryResults: {
          manualUploadsCount,
          savedDocumentsCount,
          totalDocumentsCount,
          draftCount,
          savedCount,
          pendingCount,
          approvedCount
        }
      }
    };

    console.log('✅ [ADMIN-DASHBOARD] Successfully fetched dashboard data:', {
      manualUploads: manualUploadsCount,
      savedDocuments: savedDocumentsCount,
      totalDocuments: totalDocumentsCount,
      recentDocsCount: transformedRecentDocuments.length
    });

    res.json(dashboardData);

  } catch (err) {
    console.error('❌ [ADMIN-DASHBOARD] Error fetching dashboard data:', err);
    console.error('❌ [ADMIN-DASHBOARD] Error stack:', err.stack);

    // Return structured error response with fallback data
    res.status(500).json({
      error: "Failed to fetch dashboard data",
      detail: String(err),
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
      },
      _debug: {
        databaseState: 'error',
        connectionReadyState: mongoose.connection.readyState,
        errorMessage: err.message
      }
    });
  }
}

/**
 * GET /api/admin/recent-documents
 * Headers: Authorization: Bearer <token>
 * Query params: limit (default 20), page (default 1)
 * Returns paginated recent documents for admin panel with better error handling
 */
export async function getAdminRecentDocuments(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit || "20", 10), 1),
      100
    );

    console.log('📄 [ADMIN-RECENT] Fetching recent documents - page:', page, 'limit:', limit);
    console.log('📄 [DB-STATE] Connection state:', mongoose.connection.readyState);

    // Check database connection state
    if (mongoose.connection.readyState !== 1) {
      console.log('⚠️ [ADMIN-RECENT] Database not connected, connection state:', mongoose.connection.readyState);
      return res.json({
        total: 0,
        page,
        limit,
        documents: [],
        _debug: {
          databaseState: 'disconnected',
          connectionReadyState: mongoose.connection.readyState
        }
      });
    }

    // Build filter with better soft delete handling
    const filter = {
      $or: [
        { isDeleted: { $exists: false } },
        { isDeleted: false },
        { isDeleted: { $ne: true } }
      ]
    };

    // Optional status filter for admin panel
    if (req.query.status) {
      filter.status = req.query.status;
      console.log('📄 [ADMIN-RECENT] Filtering by status:', req.query.status);
    }

    console.log('📄 [QUERY] Counting total documents...');
    const total = await CustomerHeaderDoc.countDocuments(filter);
    console.log('📄 [COUNT] Total matching documents:', total);

    console.log('📄 [QUERY] Fetching recent documents...');
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
        'zoho.crm.dealId': 1,
        'zoho.crm.fileId': 1,
      })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    console.log('📄 [RESULT] Found documents for this page:', documents.length);

    // Transform documents for admin panel with better error handling
    const transformedDocuments = documents.map(doc => {
      try {
        return {
          id: doc._id,
          title: doc.payload?.headerTitle || 'Untitled Document',
          status: doc.status || 'saved',
          createdDate: doc.createdAt,
          uploadedOn: doc.pdf_meta?.storedAt || doc.createdAt,
          hasPdf: !!(
            doc.pdf_meta?.pdfBuffer ||
            (doc.zoho?.bigin?.fileId && !doc.zoho.bigin.fileId.includes('MOCK_')) ||
            (doc.zoho?.crm?.fileId && !doc.zoho.crm.fileId.includes('MOCK_'))
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
        };
      } catch (transformError) {
        console.warn('⚠️ [ADMIN-RECENT] Error transforming document:', doc._id, transformError);
        return {
          id: doc._id,
          title: 'Error loading document',
          status: 'error',
          createdDate: doc.createdAt,
          uploadedOn: doc.createdAt,
          hasPdf: false,
          fileSize: 0,
          createdDateFormatted: 'Error',
          uploadedOnFormatted: 'Error'
        };
      }
    });

    console.log('✅ [ADMIN-RECENT] Successfully fetched recent documents:', {
      total,
      page,
      limit,
      documentsCount: transformedDocuments.length
    });

    res.json({
      total,
      page,
      limit,
      documents: transformedDocuments,
      _debug: {
        databaseState: 'connected',
        connectionReadyState: mongoose.connection.readyState,
        filter: JSON.stringify(filter),
        queryResults: {
          total,
          returnedCount: transformedDocuments.length
        }
      }
    });

  } catch (err) {
    console.error('❌ [ADMIN-RECENT] Error fetching recent documents:', err);
    console.error('❌ [ADMIN-RECENT] Error stack:', err.stack);

    res.status(500).json({
      error: "Failed to fetch recent documents",
      detail: String(err),
      total: 0,
      page: parseInt(req.query.page || "1", 10),
      limit: parseInt(req.query.limit || "20", 10),
      documents: [],
      _debug: {
        databaseState: 'error',
        connectionReadyState: mongoose.connection.readyState,
        errorMessage: err.message
      }
    });
  }
}
