// src/routes/versionRoutes.js
import { Router } from "express";
import mongoose from "mongoose";
import CustomerHeaderDoc from "../models/CustomerHeaderDoc.js";
import VersionPdf from "../models/VersionPdf.js";
import { compileCustomerHeader } from "../services/pdfService.js";

const router = Router();

/**
 * GET /api/versions/:agreementId/check-status
 * Check if agreement has versions and suggest action (new version vs replace recent)
 */
router.get("/:agreementId/check-status", async (req, res) => {
  try {
    const { agreementId } = req.params;

    console.log(`🔍 Checking version status for agreement: ${agreementId}`);

    // ✅ TESTING FIX: Handle MongoDB connection issues gracefully
    if (mongoose.connection.readyState === 0) {
      console.log("⚠️ [TESTING MODE] MongoDB not connected - generating mock status response for frontend testing");

      return res.json({
        success: true,
        isFirstTime: true, // For testing, simulate first time
        hasMainPdf: false,
        totalVersions: 0,
        latestVersionNumber: 0,
        suggestedAction: 'auto_create_v1',
        canCreateVersion: true,
        canReplace: false,
        versions: [],
        agreement: {
          id: agreementId,
          headerTitle: 'Test Customer Agreement',
          status: 'saved',
          currentVersionNumber: 0
        },
        testing: true
      });
    }

    // Check if agreement exists
    const agreement = await CustomerHeaderDoc.findById(agreementId);
    if (!agreement) {
      return res.status(404).json({
        success: false,
        error: "Agreement not found"
      });
    }

    // Get all versions for this agreement
    const versions = await VersionPdf.getVersionsByAgreement(agreementId);
    const totalVersions = versions.length;

    console.log(`📊 Agreement ${agreementId}: ${totalVersions} versions (new system: all PDFs in versions)`);

    // ✅ NEW LOGIC: First time = auto v1, subsequent = show dialog
    let suggestedAction;
    let canCreateVersion = true;
    let canReplace = false;
    let isFirstTime = totalVersions === 0; // First time if no versions exist

    if (isFirstTime) {
      // First time - will auto-create v1 (no dialog needed)
      suggestedAction = 'auto_create_v1';
      canCreateVersion = true;
      canReplace = false;
    } else {
      // Has existing versions - show dialog options
      suggestedAction = 'create_version'; // Default to new version
      canCreateVersion = true;
      canReplace = true; // Can always replace the most recent version
    }

    return res.json({
      success: true,
      isFirstTime,
      hasMainPdf: false, // ✅ NEW: No main PDFs anymore, all in versions
      totalVersions,
      latestVersionNumber: totalVersions > 0 ? Math.max(...versions.map(v => v.versionNumber)) : 0,
      suggestedAction,
      canCreateVersion,
      canReplace,
      versions: versions.map(v => ({
        id: v._id,
        versionNumber: v.versionNumber,
        versionLabel: v.versionLabel,
        createdAt: v.createdAt,
        createdBy: v.createdBy,
        status: v.status,
        sizeBytes: v.pdf_meta.sizeBytes
      })),
      agreement: {
        id: agreement._id,
        headerTitle: agreement.payload?.headerTitle || 'Customer Agreement',
        status: agreement.status,
        currentVersionNumber: agreement.currentVersionNumber || 0
      }
    });

  } catch (error) {
    console.error("❌ Failed to check version status:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/versions/:agreementId/create-version
 * Create new PDF version OR auto-create v1 for first time
 */
router.post("/:agreementId/create-version", async (req, res) => {
  try {
    const { agreementId } = req.params;
    const {
      changeNotes = "",
      createdBy = null,
      replaceRecent = false, // ✅ NEW: Option to replace most recent version only
      isFirstTime = false // ✅ NEW: Flag for auto v1 creation
    } = req.body;

    console.log(`📝 ${isFirstTime ? 'Auto-creating v1' : replaceRecent ? 'Replacing recent version' : 'Creating new version'} for agreement: ${agreementId}`);

    // ✅ TESTING FIX: Handle MongoDB connection issues gracefully
    if (mongoose.connection.readyState === 0) {
      console.log("⚠️ [TESTING MODE] MongoDB not connected - generating mock version response for frontend testing");

      const mockVersionId = new mongoose.Types.ObjectId().toString();
      const mockVersionNumber = isFirstTime ? 1 : 2;

      return res.json({
        success: true,
        message: `Successfully ${isFirstTime ? 'created first version' : replaceRecent ? 'replaced recent version' : 'created new version'} ${mockVersionNumber}`,
        version: {
          id: mockVersionId,
          versionNumber: mockVersionNumber,
          versionLabel: `Version ${mockVersionNumber}`,
          sizeBytes: 1024,
          createdAt: new Date().toISOString(),
          createdBy: createdBy,
          changeNotes: isFirstTime ? "Initial version" : changeNotes,
          fileName: `test-agreement_v${mockVersionNumber}.pdf`
        },
        totalVersions: mockVersionNumber,
        wasReplacement: replaceRecent,
        isFirstVersion: isFirstTime,
        testing: true
      });
    }

    // Check if agreement exists and has valid payload
    const agreement = await CustomerHeaderDoc.findById(agreementId);
    if (!agreement) {
      return res.status(404).json({
        success: false,
        error: "Agreement not found"
      });
    }

    if (!agreement.payload) {
      return res.status(400).json({
        success: false,
        error: "Agreement has no form data to compile"
      });
    }

    // Compile new PDF from current form data
    console.log('📄 Compiling PDF from agreement payload...');
    const compilationResult = await compileCustomerHeader(agreement.payload);

    console.log('📄 Compilation result:', {
      success: !!compilationResult,
      hasBuffer: !!(compilationResult && compilationResult.buffer),
      bufferSize: compilationResult && compilationResult.buffer ? compilationResult.buffer.length : 0,
      filename: compilationResult && compilationResult.filename
    });

    if (!compilationResult || !compilationResult.buffer) {
      return res.status(500).json({
        success: false,
        error: "Failed to compile PDF from form data"
      });
    }

    let versionNumber;
    let creationReason;

    if (isFirstTime) {
      // ✅ NEW: First time - auto create v1
      versionNumber = 1;
      creationReason = 'initial'; // ✅ FIXED: Use 'initial' to match enum in VersionPdf model
      console.log(`🎯 Auto-creating first version (v1) for new agreement`);

    } else if (replaceRecent) {
      // ✅ NEW: Replace the most recent version (not v1, but the latest one)
      const latestVersion = await VersionPdf.findOne(
        { agreementId },
        {},
        { sort: { versionNumber: -1 } } // Get highest version number
      );

      if (!latestVersion) {
        return res.status(400).json({
          success: false,
          error: "No recent version found to replace"
        });
      }

      // ✅ IMPORTANT: Only allow replacing the most recent, not v1 or older versions
      const allVersions = await VersionPdf.getVersionsByAgreement(agreementId);
      const highestVersionNumber = Math.max(...allVersions.map(v => v.versionNumber));

      if (latestVersion.versionNumber !== highestVersionNumber) {
        return res.status(400).json({
          success: false,
          error: "Can only replace the most recent version"
        });
      }

      versionNumber = latestVersion.versionNumber;
      creationReason = 'replace_recent';

      // Mark old version as superseded and delete it
      await latestVersion.deleteOne();
      console.log(`🗑️ Deleted most recent version ${versionNumber} to replace with new content`);

    } else {
      // Create new version number
      versionNumber = await VersionPdf.getNextVersionNumber(agreementId);
      creationReason = 'new_version';
    }

    // Create new version document
    const newVersion = new VersionPdf({
      agreementId,
      versionNumber,
      versionLabel: `Version ${versionNumber}`,
      pdf_meta: {
        sizeBytes: compilationResult.buffer.length,
        contentType: "application/pdf",
        storedAt: new Date(),
        pdfBuffer: compilationResult.buffer
      },
      payloadSnapshot: JSON.parse(JSON.stringify(agreement.payload)), // Deep copy
      createdBy,
      creationReason,
      changeNotes: isFirstTime ? "Initial version" : changeNotes,
      fileName: `${agreement.payload?.headerTitle || 'Agreement'}_v${versionNumber}.pdf` // ✅ FIXED: Clean filename without "Main" prefix
    });

    await newVersion.save();

    // Update agreement's version tracking (no pdf_meta anymore)
    if (!replaceRecent) {
      // Add new version reference to agreement
      agreement.versions.push({
        versionId: newVersion._id,
        versionNumber,
        versionLabel: `Version ${versionNumber}`,
        createdAt: new Date(),
        createdBy,
        changeNotes: isFirstTime ? "Initial version" : changeNotes,
        status: 'active'
      });

      agreement.totalVersions = agreement.versions.length;
    }

    // Update current version number
    agreement.currentVersionNumber = versionNumber;

    // ✅ NEW: Remove pdf_meta from agreement (no more PDFs stored in agreements)
    if (agreement.pdf_meta) {
      agreement.pdf_meta = undefined;
      console.log(`🗑️ Removed pdf_meta from agreement (moved to versions-only system)`);
    }

    await agreement.save();

    console.log(`✅ ${isFirstTime ? 'Auto-created v1' : replaceRecent ? 'Replaced recent' : 'Created new'} version ${versionNumber} for agreement ${agreementId}`);

    return res.json({
      success: true,
      message: `Successfully ${isFirstTime ? 'created first version' : replaceRecent ? 'replaced recent version' : 'created new version'} ${versionNumber}`,
      version: {
        id: newVersion._id,
        versionNumber,
        versionLabel: newVersion.versionLabel,
        sizeBytes: newVersion.pdf_meta.sizeBytes,
        createdAt: newVersion.createdAt,
        createdBy: newVersion.createdBy,
        changeNotes: newVersion.changeNotes,
        fileName: newVersion.fileName
      },
      totalVersions: agreement.totalVersions,
      wasReplacement: replaceRecent,
      isFirstVersion: isFirstTime
    });

  } catch (error) {
    console.error("❌ Failed to create version:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/versions/:agreementId/replace-main
 * ⚠️ DEPRECATED: No longer needed in new versioning system
 * All PDFs are now versions, no main PDF storage in agreements
 */
router.post("/:agreementId/replace-main", async (req, res) => {
  return res.status(400).json({
    success: false,
    error: "DEPRECATED: Main PDF replacement no longer supported. Use version replacement instead.",
    hint: "All PDFs are now stored as versions. Use 'replaceRecent: true' when creating versions."
  });
});

/**
 * GET /api/versions/:agreementId/list
 * Get all versions for an agreement (NEW: No main PDF, all PDFs are versions)
 */
router.get("/:agreementId/list", async (req, res) => {
  try {
    const { agreementId } = req.params;
    const { includeArchived = false } = req.query;

    console.log(`📋 Fetching versions for agreement: ${agreementId} (versions-only system)`);

    // Check if agreement exists
    const agreement = await CustomerHeaderDoc.findById(agreementId);
    if (!agreement) {
      return res.status(404).json({
        success: false,
        error: "Agreement not found"
      });
    }

    // Get versions
    const versions = await VersionPdf.getVersionsByAgreement(agreementId, {
      includeArchived: includeArchived === 'true',
      sortOrder: -1 // Newest first
    });

    // ✅ NEW: Only show versions, no main PDF
    const items = [];

    // Add all versions (no main PDF anymore)
    versions.forEach(version => {
      items.push({
        id: version._id,
        type: 'version',
        versionNumber: version.versionNumber,
        versionLabel: version.versionLabel,
        fileName: version.fileName,
        sizeBytes: version.pdf_meta.sizeBytes,
        createdAt: version.createdAt,
        createdBy: version.createdBy,
        status: version.status,
        changeNotes: version.changeNotes,
        canEdit: false, // ✅ IMPORTANT: Versions cannot be edited (only most recent in frontend)
        canUploadToZoho: true,
        zohoUploadStatus: {
          uploaded: Boolean(version.zoho?.bigin?.fileId),
          dealId: version.zoho?.bigin?.dealId,
          uploadedAt: version.zoho?.bigin?.uploadedAt
        }
      });
    });

    return res.json({
      success: true,
      agreementId,
      items,
      summary: {
        totalVersions: versions.length,
        hasMainPdf: false, // ✅ NEW: No main PDFs in new system
        agreementTitle: agreement.payload?.headerTitle || 'Customer Agreement',
        agreementStatus: agreement.status,
        latestVersionNumber: versions.length > 0 ? Math.max(...versions.map(v => v.versionNumber)) : 0
      }
    });

  } catch (error) {
    console.error("❌ Failed to fetch versions:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/versions/version/:versionId/view
 * View a specific version PDF (inline display)
 */
router.get("/version/:versionId/view", async (req, res) => {
  try {
    const { versionId } = req.params;

    console.log(`👁️ Viewing version: ${versionId}`);

    const version = await VersionPdf.findById(versionId);
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
    res.setHeader('Content-Disposition', `inline; filename="${version.fileName}"`); // ✅ inline for viewing
    res.setHeader('Content-Length', version.pdf_meta.sizeBytes);

    res.end(version.pdf_meta.pdfBuffer);

    console.log(`✅ Viewing version ${version.versionNumber}: ${version.fileName}`);

  } catch (error) {
    console.error("❌ Failed to view version:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/versions/version/:versionId/download
 * Download a specific version PDF
 */
router.get("/version/:versionId/download", async (req, res) => {
  try {
    const { versionId } = req.params;

    console.log(`📥 Downloading version: ${versionId}`);

    const version = await VersionPdf.findById(versionId);
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

    console.log(`✅ Downloaded version ${version.versionNumber}: ${version.fileName}`);

  } catch (error) {
    console.error("❌ Failed to download version:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/versions/version/:versionId
 * Delete/archive a specific version
 */
router.delete("/version/:versionId", async (req, res) => {
  try {
    const { versionId } = req.params;
    const { permanent = false } = req.body;

    console.log(`🗑️ ${permanent ? 'Permanently deleting' : 'Archiving'} version: ${versionId}`);

    const version = await VersionPdf.findById(versionId);
    if (!version) {
      return res.status(404).json({
        success: false,
        error: "Version not found"
      });
    }

    if (permanent) {
      // Permanent deletion
      await version.deleteOne();

      // Remove from agreement's versions array
      await CustomerHeaderDoc.updateOne(
        { _id: version.agreementId },
        {
          $pull: { versions: { versionId: version._id } },
          $inc: { totalVersions: -1 }
        }
      );

      console.log(`✅ Permanently deleted version ${version.versionNumber}`);
    } else {
      // Archive version
      await version.archive();
      console.log(`✅ Archived version ${version.versionNumber}`);
    }

    return res.json({
      success: true,
      message: `Version ${version.versionNumber} ${permanent ? 'deleted permanently' : 'archived'} successfully`
    });

  } catch (error) {
    console.error("❌ Failed to delete/archive version:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/versions/version/:versionId/edit-format
 * Get version data in edit format for FormFilling component
 */
router.get("/version/:versionId/edit-format", async (req, res) => {
  try {
    const { versionId } = req.params;

    console.log(`📝 [VERSION EDIT] Loading version for editing: ${versionId}`);
    console.log(`📝 [VERSION EDIT] Version ID type: ${typeof versionId}, length: ${versionId.length}`);

    // ✅ Validate ObjectId format
    if (!mongoose.isValidObjectId(versionId)) {
      console.log(`❌ [VERSION EDIT] Invalid ObjectId format: ${versionId}`);
      return res.status(400).json({
        success: false,
        error: "Invalid version ID format"
      });
    }

    // Find the version document
    const version = await VersionPdf.findById(versionId);
    console.log(`📝 [VERSION EDIT] Database lookup result: ${version ? 'FOUND' : 'NOT FOUND'}`);

    if (!version) {
      console.log(`❌ [VERSION EDIT] Version not found in database for ID: ${versionId}`);
      return res.status(404).json({
        success: false,
        error: "Version not found",
        detail: `No version found with ID: ${versionId}`
      });
    }

    // Get the related agreement for title context
    const agreement = await CustomerHeaderDoc.findById(version.agreementId).select('payload.headerTitle');

    console.log(`📝 [VERSION EDIT] Found version ${version.versionNumber} with payload keys:`,
      Object.keys(version.payloadSnapshot || {}));

    // Create edit-friendly response AFTER services transformation
    const editFormatData = {
      success: true,
      payload: version.payloadSnapshot, // The saved form data from when version was created
      _id: version._id,
      status: 'version_edit',
      agreementTitle: agreement?.payload?.headerTitle || `Version ${version.versionNumber}`,
      versionInfo: {
        versionNumber: version.versionNumber,
        versionLabel: version.versionLabel,
        createdAt: version.createdAt,
        changeNotes: version.changeNotes,
        originalAgreementId: version.agreementId // ✅ FIXED: Add originalAgreementId for draft saving
      }
    };

    console.log(`✅ [VERSION EDIT] Returning edit data for version ${version.versionNumber}`);

    res.json(editFormatData);

  } catch (error) {
    console.error("❌ [VERSION EDIT] Failed to load version for editing:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;