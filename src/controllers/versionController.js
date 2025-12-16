// src/controllers/versionController.js
import mongoose from "mongoose";
import VersionPdf from "../models/VersionPdf.js";
import CustomerHeaderDoc from "../models/CustomerHeaderDoc.js";
import { compileCustomerHeader } from "../services/pdfService.js";

/**
 * GET /api/versions
 * Get all version PDFs with pagination and filtering
 */
export async function getAllVersionPdfs(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
    const skip = (page - 1) * limit;

    // Build filter object
    const filter = {};

    // Optional filters
    if (req.query.status) {
      filter.status = req.query.status;
    }

    if (req.query.agreementId) {
      filter.agreementId = req.query.agreementId;
    }

    if (req.query.versionNumber) {
      filter.versionNumber = parseInt(req.query.versionNumber, 10);
    }

    // Exclude deleted versions by default
    if (req.query.includeDeleted !== 'true') {
      filter.isDeleted = { $ne: true };
    }

    console.log(`📋 [VERSIONS] Fetching versions with filter:`, filter);

    // Get total count
    const total = await VersionPdf.countDocuments(filter);

    // Get versions with pagination
    const versions = await VersionPdf.find(filter)
      .populate({
        path: 'agreementId',
        select: 'payload.headerTitle status createdAt'
      })
      .select({
        _id: 1,
        agreementId: 1,
        versionNumber: 1,
        versionLabel: 1,
        status: 1,
        createdAt: 1,
        updatedAt: 1,
        createdBy: 1,
        changeNotes: 1,
        fileName: 1,
        'pdf_meta.sizeBytes': 1,
        'pdf_meta.storedAt': 1,
        'zoho.bigin.dealId': 1,
        'zoho.bigin.fileId': 1,
        'zoho.crm.dealId': 1,
        'zoho.crm.fileId': 1,
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    console.log(`📋 [VERSIONS] Found ${versions.length} versions (total: ${total})`);

    // Transform response
    const transformedVersions = versions.map(version => ({
      id: version._id,
      agreementId: version.agreementId._id,
      agreementTitle: version.agreementId.payload?.headerTitle || 'Untitled Agreement',
      versionNumber: version.versionNumber,
      versionLabel: version.versionLabel,
      fileName: version.fileName,
      status: version.status,
      createdAt: version.createdAt,
      updatedAt: version.updatedAt,
      createdBy: version.createdBy,
      changeNotes: version.changeNotes,
      fileSize: version.pdf_meta?.sizeBytes || 0,
      pdfStoredAt: version.pdf_meta?.storedAt || null,
      hasPdf: !!version.pdf_meta?.sizeBytes,
      zohoInfo: {
        biginDealId: version.zoho?.bigin?.dealId || null,
        biginFileId: version.zoho?.bigin?.fileId || null,
        crmDealId: version.zoho?.crm?.dealId || null,
        crmFileId: version.zoho?.crm?.fileId || null,
      }
    }));

    res.json({
      success: true,
      data: transformedVersions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error("❌ Failed to fetch versions:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * GET /api/versions/:id
 * Get a specific version PDF by ID
 */
export async function getVersionPdfById(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid version ID format"
      });
    }

    const version = await VersionPdf.findById(id)
      .populate({
        path: 'agreementId',
        select: 'payload.headerTitle status createdAt'
      });

    if (!version) {
      return res.status(404).json({
        success: false,
        error: "Version not found"
      });
    }

    console.log(`📄 [VERSION] Retrieved version ${version.versionNumber} for agreement ${version.agreementId._id}`);

    res.json({
      success: true,
      data: {
        id: version._id,
        agreementId: version.agreementId._id,
        agreementTitle: version.agreementId.payload?.headerTitle || 'Untitled Agreement',
        versionNumber: version.versionNumber,
        versionLabel: version.versionLabel,
        fileName: version.fileName,
        status: version.status,
        createdAt: version.createdAt,
        updatedAt: version.updatedAt,
        createdBy: version.createdBy,
        changeNotes: version.changeNotes,
        payloadSnapshot: version.payloadSnapshot,
        fileSize: version.pdf_meta?.sizeBytes || 0,
        pdfStoredAt: version.pdf_meta?.storedAt || null,
        hasPdf: !!version.pdf_meta?.pdfBuffer,
        zohoInfo: {
          biginDealId: version.zoho?.bigin?.dealId || null,
          biginFileId: version.zoho?.bigin?.fileId || null,
          crmDealId: version.zoho?.crm?.dealId || null,
          crmFileId: version.zoho?.crm?.fileId || null,
        }
      }
    });

  } catch (error) {
    console.error("❌ Failed to fetch version:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * PATCH /api/versions/:id/status
 * Update version PDF status
 */
export async function updateVersionStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    console.log(`🔄 [VERSION-STATUS] Updating version ${id} status to: ${status}`);

    // Validate status
    const validStatuses = ["draft", "saved", "pending_approval", "approved_salesman", "approved_admin"];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: "bad_request",
        detail: `Invalid status. Must be one of: ${validStatuses.join(", ")}`
      });
    }

    // Validate ObjectId format
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid version ID format"
      });
    }

    // Find and update version
    const version = await VersionPdf.findById(id);
    if (!version) {
      console.log(`❌ [VERSION-STATUS] Version not found: ${id}`);
      return res.status(404).json({
        success: false,
        error: "Version not found"
      });
    }

    // Update status
    const oldStatus = version.status;
    version.status = status;
    await version.save();

    console.log(`✅ [VERSION-STATUS] Updated version ${version.versionNumber} status from ${oldStatus} to ${status}`);

    res.json({
      success: true,
      message: `Version ${version.versionNumber} status updated to ${status}`,
      data: {
        id: version._id,
        versionNumber: version.versionNumber,
        status: version.status,
        previousStatus: oldStatus,
        updatedAt: version.updatedAt
      }
    });

  } catch (error) {
    console.error("❌ [VERSION-STATUS] Failed to update version status:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * GET /api/versions/:id/download
 * Download a specific version PDF
 */
export async function downloadVersionPdf(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid version ID format"
      });
    }

    const version = await VersionPdf.findById(id);
    if (!version) {
      return res.status(404).json({
        success: false,
        error: "Version not found"
      });
    }

    if (!version.pdf_meta?.pdfBuffer) {
      return res.status(404).json({
        success: false,
        error: "PDF content not found for this version"
      });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${version.fileName}"`);
    res.setHeader('Content-Length', version.pdf_meta.sizeBytes);

    res.end(version.pdf_meta.pdfBuffer);

    console.log(`📥 [VERSION-DOWNLOAD] Downloaded version ${version.versionNumber}: ${version.fileName}`);

  } catch (error) {
    console.error("❌ Failed to download version:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * DELETE /api/versions/:id
 * Soft delete a version PDF
 */
export async function deleteVersionPdf(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid version ID format"
      });
    }

    const version = await VersionPdf.findById(id);
    if (!version) {
      return res.status(404).json({
        success: false,
        error: "Version not found"
      });
    }

    // Soft delete
    version.isDeleted = true;
    version.deletedAt = new Date();
    await version.save();

    console.log(`🗑️ [VERSION-DELETE] Soft deleted version ${version.versionNumber}`);

    res.json({
      success: true,
      message: `Version ${version.versionNumber} deleted successfully`,
      data: {
        id: version._id,
        versionNumber: version.versionNumber,
        deletedAt: version.deletedAt
      }
    });

  } catch (error) {
    console.error("❌ Failed to delete version:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}