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
 * Download a specific version PDF (with optional watermark)
 * ✅ NEW: Supports ?watermark=true query parameter for on-demand watermark generation
 */
export async function downloadVersionPdf(req, res) {
  try {
    const { id } = req.params;
    const { watermark = 'false' } = req.query; // Query param defaults to 'false'
    const applyWatermark = watermark === 'true' || watermark === true;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid version ID format"
      });
    }

    const version = await VersionPdf.findById(id).populate('agreementId');
    if (!version) {
      return res.status(404).json({
        success: false,
        error: "Version not found"
      });
    }

    console.log(`📥 [VERSION-DOWNLOAD] Downloading version ${version.versionNumber}:`, {
      fileName: version.fileName,
      watermark: applyWatermark,
      hasStoredPdf: !!version.pdf_meta?.pdfBuffer
    });

    // ✅ FIXED: Always regenerate on-demand to respect checkbox state
    // This ensures the watermark checkbox works correctly
    // The stored PDF might have a watermark baked in, so we regenerate based on user's choice
    console.log(`🔄 [ON-DEMAND] Regenerating PDF on-demand with watermark=${applyWatermark}`);

    const compiledPdf = await compileCustomerHeader(version.payloadSnapshot, {
      watermark: applyWatermark  // Use the checkbox state from frontend
    });

    if (!compiledPdf || !compiledPdf.buffer) {
      throw new Error("Failed to compile PDF");
    }

    const fileName = applyWatermark
      ? version.fileName.replace('.pdf', '_DRAFT.pdf')
      : version.fileName;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', compiledPdf.buffer.length);

    res.end(compiledPdf.buffer);
    console.log(`📥 [VERSION-DOWNLOAD] Downloaded version ${version.versionNumber}: ${fileName}`);

  } catch (error) {
    console.error("❌ Failed to download version:", error.message);

    // ✅ ENHANCED: Log detailed LaTeX compilation errors for debugging
    if (error.detail) {
      try {
        const errorDetail = typeof error.detail === 'string' ? JSON.parse(error.detail) : error.detail;
        console.error("📄 LaTeX Compilation Error Details:", JSON.stringify(errorDetail, null, 2));
      } catch (parseErr) {
        console.error("📄 LaTeX Compilation Error Details (raw):", error.detail);
      }
    }

    // ✅ ENHANCED: Send ALL error details to frontend for complete debugging
    const errorResponse = {
      success: false,
      message: error.message || "Failed to download PDF",
      error: error.message || "Failed to download PDF",
      codeVersion: 'v3_2025_full_error_details',  // ✅ VERSION MARKER to confirm updated code is running
      timestamp: new Date().toISOString(),

      // ✅ Send ALL error properties for frontend debugging
      errorType: error.errorType || 'UNKNOWN',
      errorName: error.errorName || error.name || 'Error',
      originalError: error.originalError,
      url: error.url,
      httpStatus: error.httpStatus,
      timeout: error.timeout,
      detail: error.detail,
      latexError: error.latexError,
      stack: error.stack  // Include full stack trace for debugging
    };

    res.status(500).json(errorResponse);
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

// ✅ NEW: Version management functions

/**
 * GET /api/versions/:agreementId/check-status
 * Check version status for an agreement (determines if user should create version or replace)
 */
export async function checkVersionStatus(req, res) {
  try {
    const { agreementId } = req.params;

    if (!mongoose.isValidObjectId(agreementId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid agreement ID format"
      });
    }

    // ⚡ OPTIMIZED: Only fetch minimal fields needed from agreement
    // Exclude: pdf_meta.pdfBuffer (MBs), attachedFiles, versions, zoho, full payload
    const agreement = await CustomerHeaderDoc.findById(agreementId)
      .select('_id payload.headerTitle status currentVersionNumber pdf_meta.sizeBytes')
      .lean();
    if (!agreement) {
      return res.status(404).json({
        success: false,
        error: "Agreement not found"
      });
    }

    // ⚡ OPTIMIZED: Exclude heavy fields from version queries
    // - pdf_meta.pdfBuffer: Large binary PDF (can be MBs per version)
    // - payloadSnapshot: Full form data snapshot (10s-100s of KB)
    // - zoho: Integration data not needed for status check
    const versionSelectFields = '_id versionNumber versionLabel createdAt createdBy status pdf_meta.sizeBytes';

    // Get existing versions (non-deleted)
    const versions = await VersionPdf.find({
      agreementId: agreementId,
      isDeleted: { $ne: true }
    })
    .select(versionSelectFields)
    .sort({ versionNumber: -1 })
    .lean();

    // ✅ NEW: Also get deleted versions to inform user about trash
    const deletedVersions = await VersionPdf.find({
      agreementId: agreementId,
      isDeleted: true
    })
    .select('_id versionNumber versionLabel deletedAt')
    .sort({ versionNumber: -1 })
    .lean();

    // ⚡ OPTIMIZED: Get highest version number efficiently
    // Only fetch versionNumber field, limit to 1 result
    const allVersionsForCount = await VersionPdf.find({
      agreementId: agreementId
    })
    .select('versionNumber')
    .sort({ versionNumber: -1 })
    .limit(1)
    .lean();

    const highestVersionNumber = allVersionsForCount.length > 0 ? allVersionsForCount[0].versionNumber : 0;
    const nextVersionNumber = highestVersionNumber + 1;

    const totalVersions = versions.length;
    const latestVersion = versions[0];
    const hasMainPdf = agreement.pdf_meta?.sizeBytes > 0; // Check if main PDF exists by size
    const isFirstTime = totalVersions === 0 && !hasMainPdf;

    let suggestedAction = 'create_version';
    if (isFirstTime) {
      suggestedAction = 'auto_create_v1';
    } else if (totalVersions > 0 && latestVersion &&
               new Date() - new Date(latestVersion.createdAt) < 1000 * 60 * 10) { // 10 minutes
      suggestedAction = 'suggest_replace';
    }

    // ⚡ OPTIMIZED RESPONSE: Return only essential fields to reduce payload size
    const versionStatus = {
      success: true,
      isFirstTime,
      hasMainPdf,
      totalVersions,
      nextVersionNumber,
      latestVersionNumber: latestVersion?.versionNumber || 0,
      suggestedAction,
      canCreateVersion: true,
      canReplace: totalVersions > 0,
      // ⚡ MINIMAL: Only return essential version fields
      versions: versions.map(v => ({
        id: v._id,
        versionNumber: v.versionNumber,
        status: v.status,
        createdAt: v.createdAt
      })),
      agreement: {
        id: agreement._id,
        headerTitle: agreement.payload?.headerTitle || 'Untitled Agreement',
        status: agreement.status
      }
    };

    console.log(`📋 [VERSION-STATUS] Agreement ${agreementId}: ${totalVersions} active versions, ${deletedVersions.length} deleted, next version: v${nextVersionNumber}, action: ${suggestedAction}`);

    res.json(versionStatus);

  } catch (error) {
    console.error("❌ Failed to check version status:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * POST /api/versions/:agreementId/create-version
 * Create a new version or replace recent version
 */
export async function createVersion(req, res) {
  try {
    const { agreementId } = req.params;
    const { changeNotes, createdBy, replaceRecent, isFirstTime, watermark = false } = req.body || {};

    if (!mongoose.isValidObjectId(agreementId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid agreement ID format"
      });
    }

    console.log(`📝 [VERSION-CREATE] Creating version for agreement ${agreementId}`, {
      watermark,
      replaceRecent,
      isFirstTime
    });

    // ⚡ OPTIMIZED: Exclude pdfBuffer - we're generating a new PDF anyway
    // Only fetch fields needed: payload (for compilation), status, versions, currentVersionNumber, totalVersions
    const agreement = await CustomerHeaderDoc.findById(agreementId)
      .select('-pdf_meta.pdfBuffer -attachedFiles -zoho')
      .lean();
    if (!agreement) {
      return res.status(404).json({
        success: false,
        error: "Agreement not found"
      });
    }

    // ⚡ OPTIMIZED: Only fetch minimal fields for version checking
    // We only need: versionNumber, _id, createdAt, status for determining what to do
    const existingVersions = await VersionPdf.find({
      agreementId: agreementId,
      isDeleted: { $ne: true }
    })
    .select('_id versionNumber createdAt status')
    .sort({ versionNumber: -1 })
    .lean();

    // ⚡ OPTIMIZED: Get highest version number efficiently - only fetch versionNumber
    const allVersions = await VersionPdf.find({
      agreementId: agreementId
    })
    .select('versionNumber')
    .sort({ versionNumber: -1 })
    .limit(1)
    .lean();

    const highestVersionNumber = allVersions.length > 0 ? allVersions[0].versionNumber : 0;

    const totalVersions = existingVersions.length;
    const latestVersion = existingVersions[0];

    // Determine version number
    let versionNumber = 1;

    // ✅ FIX: If user explicitly requested replace, honor it (no time window check)
    if (replaceRecent && latestVersion) {
      // Replace the latest version (user explicitly clicked "Replace")
      versionNumber = latestVersion.versionNumber;
      console.log(`🔄 [VERSION-CREATE] User requested replace - will replace v${versionNumber}`);
    } else {
      // ✅ FIX: Create new version based on highest version number (including deleted)
      // This ensures v2 is created if v1 is deleted, preventing version number conflicts
      versionNumber = highestVersionNumber + 1;
      console.log(`✅ [VERSION-CREATE] Creating new version v${versionNumber}`);
    }

    // ✅ NEW: Compile PDF with watermark option
    // Watermark is applied if explicitly requested OR if status is draft/pending_approval
    const shouldApplyWatermark = watermark === true ||
                                  agreement.status === 'draft' ||
                                  agreement.status === 'pending_approval';

    console.log(`💧 [WATERMARK-CHECK] Watermark decision:`, {
      requestedWatermark: watermark,
      agreementStatus: agreement.status,
      shouldApplyWatermark
    });

    const compiledPdf = await compileCustomerHeader(agreement.payload, {
      watermark: shouldApplyWatermark
    });

    if (!compiledPdf || !compiledPdf.buffer) {
      throw new Error("Failed to compile PDF for version");
    }

    // Create version document
    const versionData = {
      agreementId: agreementId,
      versionNumber: versionNumber,
      versionLabel: `v${versionNumber}`,
      fileName: `${agreement.payload?.headerTitle || 'Agreement'}_v${versionNumber}.pdf`,
      // ✅ FIXED: Inherit status from agreement (for Red/Green Line approval workflow)
      // Agreement status was already set based on pricing calculations
      status: agreement.status || 'saved',
      createdBy: createdBy || null,
      changeNotes: changeNotes || `Version ${versionNumber} - ${isFirstTime ? 'Initial version' : 'Updated agreement'}`,
      payloadSnapshot: agreement.payload,
      pdf_meta: {
        sizeBytes: compiledPdf.buffer.length,
        storedAt: new Date(),
        pdfBuffer: compiledPdf.buffer,
        contentType: 'application/pdf'
      },
      zoho: {
        bigin: {},
        crm: {}
      }
    };

    console.log(`📋 [VERSION-CREATE] Creating version with status: ${versionData.status} (inherited from agreement)`);

    let version;
    let wasReplacement = false;

    if (replaceRecent && latestVersion && versionNumber === latestVersion.versionNumber) {
      // ⚡ ULTRA-OPTIMIZED: Use findByIdAndUpdate to replace without loading heavy fields
      // This avoids loading the full document (with pdfBuffer and payloadSnapshot)
      version = await VersionPdf.findByIdAndUpdate(
        latestVersion._id,
        {
          ...versionData,
          updatedAt: new Date()
        },
        { new: true, runValidators: true }
      );

      if (version) {
        wasReplacement = true;
        console.log(`🔄 [VERSION-CREATE] Replaced version ${versionNumber} (atomic update)`);
      } else {
        // Fallback: create new if replacement target not found
        version = new VersionPdf(versionData);
        version = await version.save();
        console.log(`✅ [VERSION-CREATE] Created new version ${versionNumber} (replacement target not found)`);
      }
    } else {
      // Create new version
      version = new VersionPdf(versionData);
      version = await version.save();
      console.log(`✅ [VERSION-CREATE] Created new version ${versionNumber}`);
    }

    // ⚡ OPTIMIZED: Update agreement using findByIdAndUpdate to avoid loading heavy fields
    // This updates the document in one atomic operation without loading pdfBuffer
    const updateData = {
      currentVersionNumber: versionNumber,
      totalVersions: wasReplacement ? totalVersions : totalVersions + 1
    };

    // Add to versions array if not replacing
    if (!wasReplacement) {
      updateData.$push = {
        versions: {
          versionId: version._id,
          versionNumber: versionNumber,
          versionLabel: `v${versionNumber}`,
          createdAt: version.createdAt,
          createdBy: createdBy || null,
          changeNotes: changeNotes || '',
          status: 'active'
        }
      };

      // ⚡ OPTIMIZED: Auto-update previous draft status efficiently
      if (latestVersion && latestVersion.status === 'draft') {
        await VersionPdf.findByIdAndUpdate(latestVersion._id, { status: 'saved' });
        console.log(`✅ [VERSION-CREATE] Auto-updated previous draft (v${latestVersion.versionNumber}) to saved after creating v${versionNumber}`);
      }
    }

    await CustomerHeaderDoc.findByIdAndUpdate(agreementId, updateData);

    // ⚡ OPTIMIZED RESPONSE: Return only essential fields
    res.json({
      success: true,
      message: wasReplacement ?
        `Version ${versionNumber} replaced successfully` :
        `Version ${versionNumber} created successfully`,
      version: {
        id: version._id,
        versionNumber: version.versionNumber,
        status: version.status
      }
    });

  } catch (error) {
    console.error("❌ Failed to create version:", error.message);

    // ✅ ENHANCED: Log detailed LaTeX compilation errors for debugging
    if (error.detail) {
      try {
        const errorDetail = typeof error.detail === 'string' ? JSON.parse(error.detail) : error.detail;
        console.error("📄 LaTeX Compilation Error Details:", JSON.stringify(errorDetail, null, 2));
      } catch (parseErr) {
        console.error("📄 LaTeX Compilation Error Details (raw):", error.detail);
      }
    }

    res.status(500).json({
      success: false,
      error: error.message,
      detail: error.detail || undefined
    });
  }
}

/**
 * POST /api/versions/:agreementId/replace-main
 * Replace main PDF with current form data
 */
export async function replaceMainPdf(req, res) {
  try {
    const { agreementId } = req.params;
    const { updatedBy } = req.body || {};

    if (!mongoose.isValidObjectId(agreementId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid agreement ID format"
      });
    }

    console.log(`🔄 [REPLACE-MAIN] Replacing main PDF for agreement ${agreementId}`);

    // Get agreement
    const agreement = await CustomerHeaderDoc.findById(agreementId);
    if (!agreement) {
      return res.status(404).json({
        success: false,
        error: "Agreement not found"
      });
    }

    // Compile PDF from current agreement payload
    const compiledPdf = await compileCustomerHeader(agreement.payload);
    if (!compiledPdf || !compiledPdf.buffer) {
      throw new Error("Failed to compile PDF for main replacement");
    }

    // Update main agreement PDF
    agreement.pdf_meta = {
      sizeBytes: compiledPdf.buffer.length,
      storedAt: new Date(),
      pdfBuffer: compiledPdf.buffer,
      contentType: 'application/pdf'
    };

    agreement.updatedBy = updatedBy || null;
    await agreement.save();

    console.log(`✅ [REPLACE-MAIN] Replaced main PDF for agreement ${agreementId}`);

    res.json({
      success: true,
      message: "Main PDF replaced successfully",
      agreement: {
        id: agreement._id,
        headerTitle: agreement.payload?.headerTitle || 'Untitled Agreement',
        sizeBytes: agreement.pdf_meta.sizeBytes,
        updatedAt: agreement.updatedAt
      }
    });

  } catch (error) {
    console.error("❌ Failed to replace main PDF:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * GET /api/versions/:agreementId/list
 * Get all versions for an agreement
 */
export async function getVersionsList(req, res) {
  try {
    const { agreementId } = req.params;
    const includeArchived = req.query.includeArchived === 'true';

    if (!mongoose.isValidObjectId(agreementId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid agreement ID format"
      });
    }

    // Get agreement
    const agreement = await CustomerHeaderDoc.findById(agreementId);
    if (!agreement) {
      return res.status(404).json({
        success: false,
        error: "Agreement not found"
      });
    }

    // Get versions
    const filter = {
      agreementId: agreementId,
      isDeleted: { $ne: true }
    };

    if (!includeArchived) {
      filter.status = { $ne: 'archived' };
    }

    const versions = await VersionPdf.find(filter)
      .sort({ versionNumber: -1 });

    const items = versions.map(v => ({
      id: v._id,
      type: 'version',
      versionNumber: v.versionNumber,
      versionLabel: v.versionLabel,
      fileName: v.fileName,
      sizeBytes: v.pdf_meta?.sizeBytes || 0,
      createdAt: v.createdAt,
      createdBy: v.createdBy,
      status: v.status,
      changeNotes: v.changeNotes,
      canEdit: v.status === 'draft',
      canUploadToZoho: ['draft', 'saved'].includes(v.status),
      zohoUploadStatus: {
        uploaded: !!(v.zoho?.bigin?.fileId || v.zoho?.crm?.fileId),
        dealId: v.zoho?.bigin?.dealId || v.zoho?.crm?.dealId || null,
        uploadedAt: v.zoho?.bigin?.uploadedAt || v.zoho?.crm?.uploadedAt || null
      }
    }));

    console.log(`📋 [VERSION-LIST] Found ${items.length} versions for agreement ${agreementId}`);

    res.json({
      success: true,
      agreementId,
      items,
      summary: {
        totalVersions: items.length,
        hasMainPdf: !!(agreement.pdf_meta?.pdfBuffer),
        agreementTitle: agreement.payload?.headerTitle || 'Untitled Agreement',
        agreementStatus: agreement.status
      }
    });

  } catch (error) {
    console.error("❌ Failed to get versions list:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * GET /api/versions/version/:versionId/view
 * View a specific version PDF (for inline display in browser)
 * ✅ NEW: Supports ?watermark=true query parameter for on-demand watermark generation
 */
export async function viewVersionPdf(req, res) {
  try {
    const { versionId } = req.params;
    const { watermark = 'false' } = req.query; // Query param defaults to 'false'
    const applyWatermark = watermark === 'true' || watermark === true;

    if (!mongoose.isValidObjectId(versionId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid version ID format"
      });
    }

    const version = await VersionPdf.findById(versionId);
    if (!version) {
      return res.status(404).json({
        success: false,
        error: "Version not found"
      });
    }

    console.log(`👁️ [VERSION-VIEW] Viewing version ${version.versionNumber}:`, {
      fileName: version.fileName,
      watermark: applyWatermark,
      hasStoredPdf: !!version.pdf_meta?.pdfBuffer
    });

    // ✅ FIXED: Always regenerate on-demand to respect checkbox state
    // This ensures the watermark checkbox works correctly
    // The stored PDF might have a watermark baked in, so we regenerate based on user's choice
    console.log(`🔄 [ON-DEMAND] Regenerating PDF on-demand with watermark=${applyWatermark}`);

    const compiledPdf = await compileCustomerHeader(version.payloadSnapshot, {
      watermark: applyWatermark  // Use the checkbox state from frontend
    });

    if (!compiledPdf || !compiledPdf.buffer) {
      throw new Error("Failed to compile PDF");
    }

    const fileName = applyWatermark
      ? version.fileName.replace('.pdf', '_DRAFT.pdf')
      : version.fileName;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.setHeader('Content-Length', compiledPdf.buffer.length);

    res.end(compiledPdf.buffer);
    console.log(`👁️ [VERSION-VIEW] Viewed version ${version.versionNumber}: ${fileName}`);

  } catch (error) {
    console.error("❌ Failed to view version:", error.message);

    // ✅ ENHANCED: Send ALL error details to frontend for complete debugging
    const errorResponse = {
      success: false,
      message: error.message || "Failed to view PDF",
      error: error.message || "Failed to view PDF",
      codeVersion: 'v3_2025_full_error_details',  // ✅ VERSION MARKER to confirm updated code is running
      timestamp: new Date().toISOString(),

      // ✅ Send ALL error properties for frontend debugging
      errorType: error.errorType || 'UNKNOWN',
      errorName: error.errorName || error.name || 'Error',
      originalError: error.originalError,
      url: error.url,
      httpStatus: error.httpStatus,
      timeout: error.timeout,
      detail: error.detail,
      latexError: error.latexError,
      stack: error.stack  // Include full stack trace for debugging
    };

    res.status(500).json(errorResponse);
  }
}

/**
 * GET /api/versions/version/:versionId/edit-format
 * Get version data in edit format for FormFilling component
 */
export async function getVersionForEdit(req, res) {
  try {
    const { versionId } = req.params;

    if (!mongoose.isValidObjectId(versionId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid version ID format"
      });
    }

    const version = await VersionPdf.findById(versionId);
    if (!version) {
      return res.status(404).json({
        success: false,
        error: "Version not found"
      });
    }

    console.log(`📝 [VERSION-EDIT] Retrieved version ${version.versionNumber} for editing`);

    res.json({
      success: true,
      payload: version.payloadSnapshot,
      metadata: {
        versionId: version._id,
        agreementId: version.agreementId,
        versionNumber: version.versionNumber,
        versionLabel: version.versionLabel,
        status: version.status,
        createdAt: version.createdAt,
        createdBy: version.createdBy
      }
    });

  } catch (error) {
    console.error("❌ Failed to get version for edit:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
