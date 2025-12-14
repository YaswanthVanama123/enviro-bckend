// src/routes/zohoUploadRoutes.js
import { Router } from "express";
import mongoose from "mongoose";  // ✅ NEW: Added for ObjectId validation
import ZohoMapping from "../models/ZohoMapping.js";
import CustomerHeaderDoc from "../models/CustomerHeaderDoc.js";
import ManualUploadDocument from "../models/ManualUploadDocument.js"; // ✅ NEW: For attached files
import VersionPdf from "../models/VersionPdf.js"; // ✅ FIX: Import VersionPdf for PDF data
import {
  getBiginCompanies,
  searchBiginCompanies,
  createBiginCompany,
  getBiginDealsByCompany,
  createBiginDeal,
  createBiginNote,
  uploadBiginFile,
  getBiginModules,
  getBiginPipelineStages,
  validatePipelineStage,
  getOrCreateContactForDeal
} from "../services/zohoService.js";

const router = Router();

/**
 * ✅ Get PDF data for an agreement from VersionPdf collection
 * Current architecture: ALL PDFs (including v1) are stored in VersionPdf documents
 * CustomerHeaderDoc.pdf_meta.pdfBuffer is always null/empty
 */
async function getPdfForAgreement(agreementId) {
  console.log(`🔍 [PDF-LOOKUP] Searching for PDF data in VersionPdf collection for agreement: ${agreementId}`);

  // Get latest active VersionPdf for this agreement
  const latestVersion = await VersionPdf.findOne({
    agreementId: agreementId,
    status: { $ne: 'archived' }
  })
  .sort({ versionNumber: -1 })
  .select('_id versionNumber pdf_meta.pdfBuffer pdf_meta.sizeBytes createdAt')
  .lean();

  if (!latestVersion) {
    console.error(`❌ [PDF-LOOKUP] No VersionPdf documents found for agreement: ${agreementId}`);

    const versionCount = await VersionPdf.countDocuments({
      agreementId: agreementId,
      status: { $ne: 'archived' }
    });

    return {
      pdfBuffer: null,
      source: null,
      version: null,
      debugInfo: {
        error: 'no_versions_found',
        versionCount: versionCount,
        agreementId: agreementId,
        message: 'No VersionPdf documents exist for this agreement'
      }
    };
  }

  console.log(`🔍 [PDF-LOOKUP] Found VersionPdf v${latestVersion.versionNumber} (ID: ${latestVersion._id})`);

  // Check if pdfBuffer exists and has content
  if (!latestVersion.pdf_meta?.pdfBuffer) {
    console.error(`❌ [PDF-LOOKUP] VersionPdf v${latestVersion.versionNumber} has no pdfBuffer field`);

    return {
      pdfBuffer: null,
      source: 'VersionPdf',
      version: latestVersion.versionNumber,
      debugInfo: {
        error: 'no_pdf_buffer',
        versionId: latestVersion._id,
        versionNumber: latestVersion.versionNumber,
        hasPdfMeta: !!latestVersion.pdf_meta,
        createdAt: latestVersion.createdAt,
        message: 'VersionPdf document exists but pdfBuffer field is missing'
      }
    };
  }

  // Check if pdfBuffer is empty (0 bytes) - handle MongoDB Buffer format
  const mongoBuffer = latestVersion.pdf_meta.pdfBuffer;
  const actualSize = mongoBuffer.length || mongoBuffer.buffer?.length || 0;

  if (actualSize === 0) {
    console.error(`❌ [PDF-LOOKUP] VersionPdf v${latestVersion.versionNumber} has empty pdfBuffer (0 bytes)`);

    // Get debugging info about other versions
    const versionCount = await VersionPdf.countDocuments({
      agreementId: agreementId,
      status: { $ne: 'archived' }
    });

    const versionsWithPdf = await VersionPdf.countDocuments({
      agreementId: agreementId,
      status: { $ne: 'archived' },
      'pdf_meta.pdfBuffer': { $exists: true, $ne: null },
      'pdf_meta.sizeBytes': { $gt: 0 }
    });

    return {
      pdfBuffer: null,
      source: 'VersionPdf',
      version: latestVersion.versionNumber,
      debugInfo: {
        error: 'empty_pdf_buffer',
        versionId: latestVersion._id,
        versionNumber: latestVersion.versionNumber,
        versionCount: versionCount,
        versionsWithPdf: versionsWithPdf,
        sizeBytes: latestVersion.pdf_meta.sizeBytes || 0,
        actualSize: actualSize,
        createdAt: latestVersion.createdAt,
        message: `VersionPdf v${latestVersion.versionNumber} exists but pdfBuffer is empty (0 bytes). This suggests PDF compilation failed.`
      }
    };
  }

  // Success! Found valid PDF buffer
  const bufferSize = actualSize; // Use the size we already calculated
  const sizeBytes = latestVersion.pdf_meta.sizeBytes || bufferSize;

  // ✅ FIX: Convert MongoDB Binary/Buffer to proper Node.js Buffer for file upload
  let properBuffer;
  if (Buffer.isBuffer(mongoBuffer)) {
    properBuffer = mongoBuffer;
  } else if (mongoBuffer.buffer) {
    // Handle MongoDB Binary object
    properBuffer = Buffer.from(mongoBuffer.buffer);
  } else {
    // Handle other formats (like ArrayBuffer)
    properBuffer = Buffer.from(mongoBuffer);
  }

  console.log(`✅ [PDF-LOOKUP] Found valid PDF in VersionPdf v${latestVersion.versionNumber}: ${properBuffer.length} bytes (converted to proper Buffer)`);

  return {
    pdfBuffer: properBuffer, // Proper Node.js Buffer for file upload
    source: 'VersionPdf',
    version: latestVersion.versionNumber,
    versionId: latestVersion._id,
    sizeBytes: sizeBytes,
    bufferSize: properBuffer.length
  };
}

/**
 * GET /zoho-upload/:agreementId/status
 * Check if this is first-time upload or update
 */
router.get("/:agreementId/status", async (req, res) => {
  try {
    const { agreementId } = req.params;

    console.log(`🔍 Checking upload status for agreement: ${agreementId}`);

    // ✅ NEW: Validate ObjectId format first
    if (!mongoose.Types.ObjectId.isValid(agreementId)) {
      console.error(`❌ Invalid ObjectId format in status check: ${agreementId}`);
      return res.status(400).json({
        success: false,
        error: "Invalid agreement ID format",
        details: `Provided ID '${agreementId}' is not a valid MongoDB ObjectId`
      });
    }

    // ✅ IMPROVED: Enhanced logging for agreement lookup
    console.log(`🔍 Looking up CustomerHeaderDoc with ID: ${agreementId}`);
    const agreement = await CustomerHeaderDoc.findById(agreementId);

    if (!agreement) {
      console.error(`❌ CustomerHeaderDoc not found with ID: ${agreementId}`);

      // ✅ NEW: Provide helpful debugging info
      const recentAgreements = await CustomerHeaderDoc.find({})
        .sort({ createdAt: -1 })
        .limit(3)
        .select('_id payload.headerTitle createdAt');

      console.log(`📋 Recent agreements in database (for debugging):`);
      recentAgreements.forEach(doc => {
        console.log(`   - ${doc._id} (${doc.payload?.headerTitle || 'No title'}) created ${doc.createdAt}`);
      });

      return res.status(404).json({
        success: false,
        error: "Agreement not found",
        details: `CustomerHeaderDoc with ID ${agreementId} does not exist in database`,
        debugInfo: {
          providedId: agreementId,
          isValidObjectId: mongoose.Types.ObjectId.isValid(agreementId),
          recentAgreementIds: recentAgreements.map(a => a._id.toString())
        }
      });
    }

    console.log(`✅ Found CustomerHeaderDoc: ${agreement._id} (${agreement.payload?.headerTitle || 'No title'})`);

    // Check if Zoho mapping exists
    const mapping = await ZohoMapping.findByAgreementId(agreementId);

    if (mapping) {
      console.log(`✅ Found existing mapping - this is an UPDATE`);
      console.log(`  ├ Company: ${mapping.zohoCompany.name} (${mapping.zohoCompany.id})`);
      console.log(`  ├ Deal: ${mapping.zohoDeal.name} (${mapping.zohoDeal.id})`);
      console.log(`  └ Version: ${mapping.currentVersion} → ${mapping.getNextVersion()}`);

      return res.json({
        success: true,
        isFirstTime: false,
        mapping: {
          companyName: mapping.zohoCompany.name,
          companyId: mapping.zohoCompany.id,
          dealName: mapping.zohoDeal.name,
          dealId: mapping.zohoDeal.id,
          currentVersion: mapping.currentVersion,
          nextVersion: mapping.getNextVersion(),
          lastUploadedAt: mapping.lastUploadedAt
        },
        agreement: {
          id: agreement._id,
          headerTitle: agreement.payload?.headerTitle || 'Customer Agreement',
          status: agreement.status
        }
      });
    } else {
      console.log(`🆕 No mapping found - this is a FIRST-TIME upload`);

      return res.json({
        success: true,
        isFirstTime: true,
        agreement: {
          id: agreement._id,
          headerTitle: agreement.payload?.headerTitle || 'Customer Agreement',
          status: agreement.status
        }
      });
    }

  } catch (error) {
    console.error("❌ Failed to check upload status:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /zoho-upload/companies
 * Get list of companies from Zoho Bigin for selection
 */
router.get("/companies", async (req, res) => {
  try {
    const { page = 1, search } = req.query;

    console.log(`📋 Fetching companies for selection (page: ${page}, search: "${search || 'none'}")`);

    let result;

    if (search && search.trim()) {
      // Search companies by name
      result = await searchBiginCompanies(search.trim());
    } else {
      // Get paginated company list
      result = await getBiginCompanies(parseInt(page), 50);
    }

    if (result.success) {
      res.json({
        success: true,
        companies: result.companies,
        pagination: result.pagination || null,
        isSearch: !!search
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    console.error("❌ Failed to fetch companies:", error.message);

    // ✅ Provide helpful error messages for OAuth issues
    if (error.message === "ZOHO_AUTH_REQUIRED") {
      return res.status(401).json({
        success: false,
        error: "Zoho integration not configured. Please contact administrator to set up Zoho Bigin access."
      });
    }

    if (error.message?.includes('credentials') || error.message?.includes('token')) {
      return res.status(401).json({
        success: false,
        error: "Zoho authentication failed. Please contact administrator to reconfigure Zoho access."
      });
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /zoho-upload/companies
 * Create a new company in Zoho Bigin
 */
router.post("/companies", async (req, res) => {
  try {
    const { name, phone, email, website, address } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: "Company name is required"
      });
    }

    console.log(`🏢 Creating new company: ${name}`);

    const result = await createBiginCompany({
      name: name.trim(),
      phone: phone || '',
      email: email || '',
      website: website || '',
      address: address || ''
    });

    if (result.success) {
      console.log(`✅ Company created successfully: ${result.company.id}`);
      res.json({
        success: true,
        company: result.company
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    console.error("❌ Failed to create company:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /zoho-upload/:agreementId/first-time
 * Handle first-time upload to Zoho Bigin
 */
router.post("/:agreementId/first-time", async (req, res) => {
  try {
    const { agreementId } = req.params;
    const {
      companyId,
      companyName,
      pipelineName = "Sales Pipeline",
      stage = "Proposal",
      noteText,
      dealName
    } = req.body;

    console.log(`🚀 Starting first-time upload for agreement: ${agreementId}`);

    // ✅ NEW: Validate ObjectId format first
    if (!mongoose.Types.ObjectId.isValid(agreementId)) {
      console.error(`❌ Invalid ObjectId format: ${agreementId}`);
      return res.status(400).json({
        success: false,
        error: "Invalid agreement ID format"
      });
    }

    // Validate required fields
    if (!companyId || !noteText || !dealName) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: companyId, dealName, and noteText"
      });
    }

    // ✅ NEW: Validate pipeline and stage values before proceeding
    // This ensures we use correct Zoho Bigin field values and prevents API errors
    console.log(`🔍 Validating pipeline and stage values...`);
    const validationResult = await validatePipelineStage(pipelineName, stage);

    let validatedPipeline = pipelineName;
    let validatedStage = stage;

    if (validationResult.success && validationResult.valid) {
      validatedPipeline = validationResult.correctedPipeline;
      validatedStage = validationResult.correctedStage;
      console.log(`✅ Pipeline/stage validation successful: "${validatedPipeline}" / "${validatedStage}"`);
    } else {
      console.warn(`⚠️ Pipeline/stage validation failed, using fallback values:`, validationResult.error);
      // Use validated values if available, otherwise use safe defaults
      validatedPipeline = validationResult.correctedPipeline || "Sales Pipeline";
      validatedStage = validationResult.correctedStage || "Proposal/Price Quote";  // ✅ V6 FIX: Use valid picklist value
      console.log(`🔧 Using validated fallback: "${validatedPipeline}" / "${validatedStage}"`);
    }

    // ✅ IMPROVED: Enhanced logging and error handling for agreement lookup
    console.log(`🔍 Looking up CustomerHeaderDoc with ID: ${agreementId}`);
    const agreement = await CustomerHeaderDoc.findById(agreementId);

    if (!agreement) {
      console.error(`❌ CustomerHeaderDoc not found with ID: ${agreementId}`);

      // ✅ NEW: Provide helpful debugging info
      const recentAgreements = await CustomerHeaderDoc.find({})
        .sort({ createdAt: -1 })
        .limit(3)
        .select('_id payload.headerTitle createdAt');

      console.log(`📋 Recent agreements in database (for debugging):`);
      recentAgreements.forEach(doc => {
        console.log(`   - ${doc._id} (${doc.payload?.headerTitle || 'No title'}) created ${doc.createdAt}`);
      });

      return res.status(404).json({
        success: false,
        error: "Agreement not found",
        details: `CustomerHeaderDoc with ID ${agreementId} does not exist in database`,
        debugInfo: {
          providedId: agreementId,
          isValidObjectId: mongoose.Types.ObjectId.isValid(agreementId),
          recentAgreementIds: recentAgreements.map(a => a._id.toString())
        }
      });
    }

    console.log(`✅ Found CustomerHeaderDoc: ${agreement._id} (${agreement.payload?.headerTitle || 'No title'})`);

    // ✅ FIX: Get PDF from either VersionPdf or CustomerHeaderDoc with enhanced fallback logic
    const pdfData = await getPdfForAgreement(agreementId);

    if (!pdfData.pdfBuffer) {
      console.error(`❌ Agreement ${agreementId} has no valid PDF in VersionPdf collection`);

      return res.status(400).json({
        success: false,
        error: "Agreement has no PDF to upload",
        details: pdfData.debugInfo?.message || "No valid PDF found in VersionPdf documents",
        debugInfo: pdfData.debugInfo || {}
      });
    }

    console.log(`✅ Agreement has PDF from ${pdfData.source} v${pdfData.version}: ${pdfData.bufferSize} bytes`);

    // Check if mapping already exists (prevent duplicate first-time uploads)
    const existingMapping = await ZohoMapping.findByAgreementId(agreementId);

    // ✅ V2 FIX: Clean up any failed mappings to allow fresh retry
    if (existingMapping && existingMapping.lastUploadStatus === 'failed') {
      console.log(`🔄 [V2-CLEAN-RETRY] Found failed mapping - deleting to allow fresh retry`);
      await ZohoMapping.findByIdAndDelete(existingMapping._id);
      console.log(`✅ [V2-CLEAN-RETRY] Cleaned up failed mapping ${existingMapping._id}`);
    } else if (existingMapping) {
      return res.status(400).json({
        success: false,
        error: "This agreement has already been uploaded to Zoho. Use the update endpoint instead."
      });
    }

    // Calculate deal amount from agreement
    const calculateDealAmount = (agreement) => {
      let total = 0;
      const payload = agreement.payload;

      // Add products total
      if (payload?.products) {
        ['smallProducts', 'dispensers', 'bigProducts'].forEach(category => {
          if (payload.products[category]) {
            payload.products[category].forEach(product => {
              if (product.weeklyTotal) total += parseFloat(product.weeklyTotal);
            });
          }
        });
      }

      // Add services total (simplified - you may want to calculate monthly/contract totals)
      if (payload?.services) {
        Object.values(payload.services).forEach(service => {
          if (service && service.weeklyTotal) {
            total += parseFloat(service.weeklyTotal);
          }
        });
      }

      return Math.round(total * 100) / 100; // Round to 2 decimals
    };

    const dealAmount = calculateDealAmount(agreement);

    console.log(`💼 Creating deal with amount: $${dealAmount}`);
    console.log(`🔧 Using validated pipeline: "${validatedPipeline}", stage: "${validatedStage}"`);

    // Step 0.5: Get/Create contact for deal linking (V8 requirement)
    let contactId = null;
    try {
      console.log(`👤 [CONTACT-LOOKUP] Resolving contact for company: ${companyId}`);
      const contactResult = await getOrCreateContactForDeal(companyId, companyName || 'Company');

      if (contactResult.success && contactResult.contact) {
        contactId = contactResult.contact.id;
        console.log(`✅ [CONTACT-LOOKUP] Found/created contact: ${contactResult.contact.name} (${contactId})`);
        if (contactResult.wasCreated) {
          console.log(`🆕 [CONTACT-LOOKUP] Contact was created automatically`);
        }
      } else {
        console.warn(`⚠️ [CONTACT-LOOKUP] Could not get/create contact: ${contactResult.error}`);
        // Continue without contact - deal creation will proceed with just company
      }
    } catch (contactError) {
      console.error(`❌ [CONTACT-LOOKUP] Exception: ${contactError.message}`);
      // Continue without contact
    }

    // Step 1: Create the deal in Zoho Bigin
    const dealResult = await createBiginDeal({
      dealName: dealName.trim(),
      companyId,
      contactId,                               // ✅ V2 FIX: Pass contactId for Contact_Name lookup
      subPipelineName: validatedPipeline,      // ✅ V2 FIX: Use subPipelineName for Sub_Pipeline field
      stage: validatedStage,                   // ✅ Use validated stage
      amount: dealAmount,
      closingDate: new Date().toISOString().split('T')[0],
      description: `EnviroMaster service agreement - ${agreement.payload?.headerTitle || 'Service Proposal'}`
    });

    if (!dealResult.success) {
      console.error(`❌ Deal creation failed:`, dealResult.error);

      // ✅ V2 FIX: DON'T create any mapping on failure - keep state clean for retry
      console.log(`🔄 [V2-CLEAN-RETRY] No mapping created - allowing clean retry`);

      return res.status(500).json({
        success: false,
        error: `Failed to create deal: ${dealResult.error?.message || 'Unknown error'}`,
        details: dealResult.error,
        retryable: true, // ✅ Signal that this can be retried cleanly
        suggestion: "Please try again - no partial data was saved"
      });
    }

    const deal = dealResult.deal;
    console.log(`✅ Deal created: ${deal.id}`);

    // Step 2: Create the note
    const noteResult = await createBiginNote(deal.id, {
      title: `Agreement v1 - ${new Date().toLocaleDateString()}`,
      content: noteText.trim()
    });

    if (!noteResult.success) {
      console.error(`❌ Failed to create note, but deal exists: ${deal.id}`);

      // ✅ V2 FIX: Clean up the created deal and don't save partial mapping
      console.log(`🔄 [V2-CLEAN-RETRY] Deal created but note failed - keeping state clean`);
      console.log(`⚠️ [V2-CLEAN-RETRY] Deal ${deal.id} exists in Zoho but note creation failed`);

      return res.status(500).json({
        success: false,
        error: `Deal created but failed to create note: ${noteResult.error?.message}`,
        dealId: deal.id,
        retryable: true, // ✅ Signal that this can be retried
        suggestion: "Deal was created in Zoho. You can try uploading again - the system will handle the existing deal.",
        zohoStatus: "deal_created_note_failed"
      });
    }

    const note = noteResult.note;
    console.log(`✅ Note created: ${note.id}`);

    // Step 3: Upload the PDF
    // ✅ FIX: pdfData.pdfBuffer is now a proper Node.js Buffer (converted from MongoDB Buffer)
    const pdfBuffer = pdfData.pdfBuffer; // Use the converted Buffer directly
    const fileName = `${dealName.replace(/[^a-zA-Z0-9-_]/g, '_')}_v1.pdf`;

    console.log(`📎 Retrieved PDF from ${pdfData.source} v${pdfData.version}: ${pdfBuffer.length} bytes (proper Node.js Buffer for upload)`);

    // ✅ DEBUG: Verify buffer format for Zoho upload
    console.log(`🔍 [BUFFER-DEBUG] Buffer info:`, {
      isBuffer: Buffer.isBuffer(pdfBuffer),
      length: pdfBuffer.length,
      type: typeof pdfBuffer,
      constructor: pdfBuffer.constructor.name
    });

    const fileResult = await uploadBiginFile(deal.id, pdfBuffer, fileName);

    if (!fileResult.success) {
      console.error(`❌ Failed to upload file, but deal and note exist: ${deal.id}, ${note.id}`);

      // ✅ V2 FIX: Don't create partial mapping - keep state clean for retry
      console.log(`🔄 [V2-CLEAN-RETRY] Deal and note created but file failed - keeping state clean`);
      console.log(`⚠️ [V2-CLEAN-RETRY] Deal ${deal.id} and note ${note.id} exist in Zoho but file upload failed`);

      return res.status(500).json({
        success: false,
        error: `Deal and note created but failed to upload file: ${fileResult.error?.message}`,
        dealId: deal.id,
        noteId: note.id,
        retryable: true, // ✅ Signal that this can be retried
        suggestion: "Deal and note were created in Zoho. You can try uploading again - the system will handle the existing records.",
        zohoStatus: "deal_note_created_file_failed"
      });
    }

    const file = fileResult.file;
    console.log(`✅ File uploaded: ${file.id}`);

    // Step 4: Create mapping in MongoDB
    const mapping = new ZohoMapping({
      agreementId,
      zohoCompany: {
        id: companyId,
        name: companyName,
        createdByUs: false // Assume existing company unless we track this
      },
      zohoDeal: {
        id: deal.id,
        name: deal.name,
        pipelineName: 'Default',  // ✅ V6 FIX: Zoho handles pipeline internally
        stage: validatedStage     // ✅ Store validated stage
      },
      moduleName: 'Pipelines',
      lastUploadStatus: 'success',
      lastError: null
    });

    mapping.addUpload({
      zohoNoteId: note.id,
      zohoFileId: file.id,
      noteText: noteText.trim(),
      fileName: fileName,
      uploadedBy: 'system' // TODO: Add user context
    });

    await mapping.save();

    console.log(`✅ First-time upload completed successfully!`);
    console.log(`  ├ Deal: ${deal.name} (${deal.id})`);
    console.log(`  ├ Note: ${note.id}`);
    console.log(`  ├ File: ${fileName} (${file.id})`);
    console.log(`  └ Mapping: ${mapping._id}`);

    res.json({
      success: true,
      message: "Successfully uploaded to Zoho Bigin",
      data: {
        deal: {
          id: deal.id,
          name: deal.name,
          stage: deal.stage,
          amount: dealAmount
        },
        note: {
          id: note.id,
          title: note.title
        },
        file: {
          id: file.id,
          fileName: fileName
        },
        mapping: {
          id: mapping._id,
          version: 1
        }
      }
    });

  } catch (error) {
    console.error("❌ First-time upload failed:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /zoho-upload/:agreementId/update
 * Handle update upload (add new version to existing deal)
 */
router.post("/:agreementId/update", async (req, res) => {
  try {
    const { agreementId } = req.params;
    const { noteText, dealId: providedDealId, skipNoteCreation } = req.body; // ✅ NEW: Accept skipNoteCreation for bulk uploads

    console.log(`🔄 Starting update upload for agreement: ${agreementId}`,
                providedDealId ? `(target dealId: ${providedDealId})` : '(using existing mapping)',
                skipNoteCreation ? '(skipping note creation)' : '(will create note)');

    // Validate required fields
    if (!noteText || !noteText.trim()) {
      return res.status(400).json({
        success: false,
        error: "Note text is required for updates"
      });
    }

    // Check if agreement exists and has PDF
    const agreement = await CustomerHeaderDoc.findById(agreementId);
    if (!agreement) {
      return res.status(404).json({
        success: false,
        error: "Agreement not found"
      });
    }

    // ✅ FIX: Check for PDF in either VersionPdf or CustomerHeaderDoc with enhanced fallback logic
    const pdfData = await getPdfForAgreement(agreementId);

    if (!pdfData.pdfBuffer) {
      console.error(`❌ Agreement ${agreementId} has no valid PDF in VersionPdf collection`);

      return res.status(400).json({
        success: false,
        error: "Agreement has no PDF to upload",
        details: pdfData.debugInfo?.message || "No valid PDF found in VersionPdf documents",
        debugInfo: pdfData.debugInfo || {}
      });
    }

    let dealId, dealName, nextVersion, mapping;

    // ✅ NEW: Use provided dealId or lookup existing mapping
    if (providedDealId) {
      // BULK UPLOAD MODE: Use provided dealId from first file's deal
      dealId = providedDealId;

      // Try to find existing mapping for version tracking
      mapping = await ZohoMapping.findByAgreementId(agreementId);
      if (mapping) {
        nextVersion = mapping.getNextVersion();
        dealName = mapping.zohoDeal.name;
        console.log(`📤 [BULK] Adding to existing deal ${dealId}, version ${nextVersion}`);
      } else {
        // Create new mapping for this file using the shared deal
        nextVersion = 1;
        dealName = `Bulk Upload Deal ${dealId}`;
        console.log(`📤 [BULK] Creating new mapping for file in shared deal ${dealId}`);
      }
    } else {
      // SINGLE UPLOAD MODE: Original logic - lookup existing mapping
      mapping = await ZohoMapping.findByAgreementId(agreementId);
      if (!mapping) {
        return res.status(400).json({
          success: false,
          error: "No existing Zoho mapping found. Use first-time upload instead."
        });
      }

      nextVersion = mapping.getNextVersion();
      dealId = mapping.zohoDeal.id;
      dealName = mapping.zohoDeal.name;
      console.log(`📝 [SINGLE] Adding version ${nextVersion} to existing deal: ${dealId}`);
    }

    // Step 1: Create note (skip if this is a subsequent file in bulk upload)
    let note = null;
    if (!skipNoteCreation) {
      const noteResult = await createBiginNote(dealId, {
        title: `Agreement v${nextVersion} - ${new Date().toLocaleDateString()}`,
        content: noteText.trim()
      });

      if (!noteResult.success) {
        return res.status(500).json({
          success: false,
          error: `Failed to create note: ${noteResult.error?.message || 'Unknown error'}`,
          details: noteResult.error
        });
      }

      note = noteResult.note;
      console.log(`✅ Note created: ${note.id}`);
    } else {
      console.log(`⏭️ Skipping note creation for bulk upload file`);
    }

    // Step 2: Upload the updated PDF
    // ✅ FIX: pdfData.pdfBuffer is now a proper Node.js Buffer (converted from MongoDB Buffer)
    const pdfBuffer = pdfData.pdfBuffer; // Use the converted Buffer directly
    const fileName = `${dealName.replace(/[^a-zA-Z0-9-_]/g, '_')}_v${nextVersion}.pdf`;

    console.log(`📎 Retrieved updated PDF from ${pdfData.source} v${pdfData.version}: ${pdfBuffer.length} bytes (proper Node.js Buffer for upload)`);

    // ✅ DEBUG: Verify buffer format for Zoho upload
    console.log(`🔍 [BUFFER-DEBUG] Update buffer info:`, {
      isBuffer: Buffer.isBuffer(pdfBuffer),
      length: pdfBuffer.length,
      type: typeof pdfBuffer,
      constructor: pdfBuffer.constructor.name
    });

    const fileResult = await uploadBiginFile(dealId, pdfBuffer, fileName);

    if (!fileResult.success) {
      console.error(`❌ Failed to upload file, but note exists: ${note.id}`);
      return res.status(500).json({
        success: false,
        error: `Note created but failed to upload file: ${fileResult.error?.message}`,
        noteId: note.id
      });
    }

    const file = fileResult.file;
    console.log(`✅ File uploaded: ${file.id}`);

    // Step 3: Update or create mapping in MongoDB
    if (mapping) {
      // Update existing mapping
      mapping.addUpload({
        zohoNoteId: note?.id || null, // ✅ FIXED: Allow null when note creation is skipped
        zohoFileId: file.id,
        noteText: noteText.trim(),
        fileName: fileName,
        uploadedBy: 'system' // TODO: Add user context
      });
      await mapping.save();
    } else {
      // ✅ NEW: Create new mapping for bulk upload files
      console.log(`📤 [BULK] Creating new ZohoMapping for agreement ${agreementId} in shared deal ${dealId}`);

      // Get deal details from Zoho to create proper mapping
      const dealDetails = await getBiginDealById(dealId);

      mapping = new ZohoMapping({
        agreementId: agreement._id,
        companyId: dealDetails.Account_Name?.id || 'unknown',
        companyName: dealDetails.Account_Name?.name || 'Unknown Company',
        zohoDeal: {
          id: dealId,
          name: dealDetails.Deal_Name || dealName
        },
        pipelineName: dealDetails.Pipeline || 'Sales Pipeline',
        stage: dealDetails.Stage || 'Proposal',
        uploads: [{
          version: 1,
          zohoNoteId: note?.id || null, // ✅ FIXED: Allow null when note creation is skipped
          zohoFileId: file.id,
          noteText: noteText.trim(),
          fileName: fileName,
          uploadedAt: new Date(),
          uploadedBy: 'system'
        }]
      });

      await mapping.save();
      console.log(`✅ [BULK] Created new mapping: ${mapping._id}`);
    }

    console.log(`✅ Update upload completed successfully!`);
    console.log(`  ├ Deal: ${dealName} (${dealId})`);
    if (note) {
      console.log(`  ├ Note: ${note.id}`);
    } else {
      console.log(`  ├ Note: Skipped (bulk upload)`);
    }
    console.log(`  ├ File: ${fileName} (${file.id})`);
    console.log(`  └ Version: ${nextVersion}`);

    res.json({
      success: true,
      message: `Successfully uploaded version ${nextVersion} to existing Zoho deal`,
      data: {
        deal: {
          id: dealId,
          name: dealName
        },
        note: note ? {
          id: note.id,
          title: note.title
        } : null, // ✅ Handle case where note creation was skipped
        file: {
          id: file.id,
          fileName: fileName
        },
        mapping: {
          id: mapping._id,
          version: nextVersion,
          totalVersions: mapping.uploads.length
        }
      }
    });

  } catch (error) {
    console.error("❌ Update upload failed:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /zoho-upload/:agreementId/history
 * Get upload history for an agreement
 */
router.get("/:agreementId/history", async (req, res) => {
  try {
    const { agreementId } = req.params;

    console.log(`📋 Fetching upload history for agreement: ${agreementId}`);

    const mapping = await ZohoMapping.findByAgreementId(agreementId);
    if (!mapping) {
      return res.json({
        success: true,
        hasHistory: false,
        message: "No Zoho upload history found for this agreement"
      });
    }

    res.json({
      success: true,
      hasHistory: true,
      company: {
        id: mapping.zohoCompany.id,
        name: mapping.zohoCompany.name
      },
      deal: {
        id: mapping.zohoDeal.id,
        name: mapping.zohoDeal.name,
        pipelineName: mapping.zohoDeal.pipelineName,
        stage: mapping.zohoDeal.stage
      },
      uploads: mapping.uploads.map(upload => ({
        version: upload.version,
        fileName: upload.fileName,
        noteText: upload.noteText,
        uploadedAt: upload.uploadedAt,
        uploadedBy: upload.uploadedBy
      })),
      totalVersions: mapping.uploads.length,
      currentVersion: mapping.currentVersion,
      lastUploadedAt: mapping.lastUploadedAt
    });

  } catch (error) {
    console.error("❌ Failed to fetch upload history:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /zoho-upload/modules
 * Get available Zoho Bigin modules (for debugging/admin)
 */
router.get("/modules", async (req, res) => {
  try {
    console.log(`📋 Fetching Zoho Bigin modules...`);

    const result = await getBiginModules();

    if (result.success) {
      res.json({
        success: true,
        modules: result.modules
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    console.error("❌ Failed to fetch modules:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /zoho-upload/companies/:companyId/pipeline-options
 * Get pipeline and stage options for a specific company
 */
router.get("/companies/:companyId/pipeline-options", async (req, res) => {
  try {
    const { companyId } = req.params;
    console.log(`📋 Fetching pipeline options for company: ${companyId}`);

    // Validate companyId
    if (!companyId || !companyId.trim()) {
      return res.status(400).json({
        success: false,
        error: "Company ID is required"
      });
    }

    const result = await getBiginPipelineStages();

    if (result.success) {
      res.json({
        success: true,
        companyId: companyId,
        pipelines: result.pipelines,
        stages: result.stages,
        message: `Pipeline options retrieved for company ${companyId}`
      });
    } else {
      res.status(500).json({
        success: false,
        companyId: companyId,
        error: result.error,
        // Provide fallback values even if API fails
        pipelines: result.pipelines || [
          { label: 'Sales Pipeline Standard', value: 'Sales Pipeline Standard' }
        ],
        stages: result.stages || [
          { label: 'Qualification', value: 'Qualification' },
          { label: 'Needs Analysis', value: 'Needs Analysis' },
          { label: 'Proposal/Price Quote', value: 'Proposal/Price Quote' },
          { label: 'Negotiation/Review', value: 'Negotiation/Review' },
          { label: 'Closed Won', value: 'Closed Won' },
          { label: 'Closed Lost', value: 'Closed Lost' }
        ]
      });
    }

  } catch (error) {
    console.error("❌ Failed to fetch company pipeline options:", error.message);
    res.status(500).json({
      success: false,
      companyId: req.params.companyId,
      error: error.message,
      // Provide fallback values
      pipelines: [
        { label: 'Sales Pipeline Standard', value: 'Sales Pipeline Standard' }
      ],
      stages: [
        { label: 'Qualification', value: 'Qualification' },
        { label: 'Needs Analysis', value: 'Needs Analysis' },
        { label: 'Proposal/Price Quote', value: 'Proposal/Price Quote' },
        { label: 'Negotiation/Review', value: 'Negotiation/Review' },
        { label: 'Closed Won', value: 'Closed Won' },
        { label: 'Closed Lost', value: 'Closed Lost' }
      ]
    });
  }
});

/**
 * GET /zoho-upload/pipeline-options
 * Get available pipeline and stage options from Zoho Bigin (general)
 */
router.get("/pipeline-options", async (req, res) => {
  try {
    console.log(`📋 Fetching Zoho Bigin pipeline and stage options...`);

    const result = await getBiginPipelineStages();

    if (result.success) {
      res.json({
        success: true,
        pipelines: result.pipelines,
        stages: result.stages
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        // Provide fallback values even if API fails
        pipelines: result.pipelines || [
          { label: 'Sales Pipeline Standard', value: 'Sales Pipeline Standard' }
        ],
        stages: result.stages || [
          { label: 'Qualification', value: 'Qualification' },
          { label: 'Needs Analysis', value: 'Needs Analysis' },
          { label: 'Proposal/Price Quote', value: 'Proposal/Price Quote' },
          { label: 'Negotiation/Review', value: 'Negotiation/Review' },
          { label: 'Closed Won', value: 'Closed Won' },
          { label: 'Closed Lost', value: 'Closed Lost' }
        ]
      });
    }

  } catch (error) {
    console.error("❌ Failed to fetch pipeline options:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      // Provide fallback values
      pipelines: [
        { label: 'Sales Pipeline Standard', value: 'Sales Pipeline Standard' }
      ],
      stages: [
        { label: 'Qualification', value: 'Qualification' },
        { label: 'Needs Analysis', value: 'Needs Analysis' },
        { label: 'Proposal/Price Quote', value: 'Proposal/Price Quote' },
        { label: 'Negotiation/Review', value: 'Negotiation/Review' },
        { label: 'Closed Won', value: 'Closed Won' },
        { label: 'Closed Lost', value: 'Closed Lost' }
      ]
    });
  }
});

/**
 * POST /zoho-upload/validate-deal-fields
 * Validate pipeline and stage values before deal creation
 */
router.post("/validate-deal-fields", async (req, res) => {
  try {
    const { pipelineName, stage } = req.body;

    if (!pipelineName || !stage) {
      return res.status(400).json({
        success: false,
        error: "Pipeline name and stage are required"
      });
    }

    console.log(`🔍 Validating deal fields: pipeline="${pipelineName}", stage="${stage}"`);

    const result = await validatePipelineStage(pipelineName, stage);

    if (result.success && result.valid) {
      res.json({
        success: true,
        valid: true,
        correctedPipeline: result.correctedPipeline,
        correctedStage: result.correctedStage,
        note: result.note || "Pipeline and stage are valid"
      });
    } else {
      res.status(400).json({
        success: false,
        valid: false,
        error: result.error,
        validPipelines: result.validPipelines || [],
        validStages: result.validStages || []
      });
    }

  } catch (error) {
    console.error("❌ Failed to validate deal fields:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /zoho-upload/cleanup-failed
 * Clean up any failed/partial mappings to ensure fresh state
 */
router.post("/cleanup-failed", async (req, res) => {
  try {
    console.log(`🧹 [V2-CLEANUP] Starting cleanup of failed mappings...`);

    // Find all failed or partial mappings
    const failedMappings = await ZohoMapping.find({
      $or: [
        { lastUploadStatus: 'failed' },
        { lastUploadStatus: 'partial' },
        { 'zohoDeal.id': 'FAILED_CREATION' },
        { 'zohoDeal.id': { $regex: /^MOCK_/ } }
      ]
    });

    console.log(`🧹 [V2-CLEANUP] Found ${failedMappings.length} failed mappings to clean up`);

    // Delete all failed mappings
    const deleteResult = await ZohoMapping.deleteMany({
      $or: [
        { lastUploadStatus: 'failed' },
        { lastUploadStatus: 'partial' },
        { 'zohoDeal.id': 'FAILED_CREATION' },
        { 'zohoDeal.id': { $regex: /^MOCK_/ } }
      ]
    });

    console.log(`✅ [V2-CLEANUP] Deleted ${deleteResult.deletedCount} failed mappings`);

    res.json({
      success: true,
      message: `Cleaned up ${deleteResult.deletedCount} failed mappings`,
      deletedCount: deleteResult.deletedCount,
      cleanedMappings: failedMappings.map(m => ({
        id: m._id,
        agreementId: m.agreementId,
        status: m.lastUploadStatus,
        error: m.lastError
      }))
    });

  } catch (error) {
    console.error("❌ Failed to cleanup failed mappings:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /zoho-upload/companies/:companyId/deals
 * Fetch deals associated with a specific company
 */
router.get("/companies/:companyId/deals", async (req, res) => {
  try {
    const { companyId } = req.params;
    const { page = 1, per_page = 20 } = req.query;

    console.log(`💼 Fetching deals for company: ${companyId} (page ${page}, ${per_page} per page)`);

    // Validate companyId
    if (!companyId || !companyId.trim()) {
      return res.status(400).json({
        success: false,
        error: "Company ID is required"
      });
    }

    // Validate pagination parameters
    const pageNum = Math.max(1, parseInt(page) || 1);
    const perPage = Math.min(200, Math.max(1, parseInt(per_page) || 20));

    const result = await getBiginDealsByCompany(companyId.trim(), pageNum, perPage);

    if (result.success) {
      console.log(`✅ Successfully fetched ${result.deals.length} deals for company ${companyId}`);

      res.json({
        success: true,
        companyId: companyId,
        deals: result.deals,
        pagination: result.pagination,
        message: `Found ${result.deals.length} deals for this company`
      });
    } else {
      console.error(`❌ Failed to fetch deals for company ${companyId}:`, result.error);

      // ✅ Provide helpful error messages for OAuth issues
      if (result.error === "ZOHO_AUTH_REQUIRED") {
        return res.status(401).json({
          success: false,
          error: "Zoho integration not configured. Please contact administrator to set up Zoho Bigin access."
        });
      }

      if (result.error?.includes('credentials') || result.error?.includes('token')) {
        return res.status(401).json({
          success: false,
          error: "Zoho authentication failed. Please contact administrator to reconfigure Zoho access."
        });
      }

      res.status(500).json({
        success: false,
        error: result.error,
        companyId: companyId
      });
    }

  } catch (error) {
    console.error("❌ Failed to fetch company deals:", error.message);

    // ✅ Handle specific OAuth errors
    if (error.message === "ZOHO_AUTH_REQUIRED") {
      return res.status(401).json({
        success: false,
        error: "Zoho integration not configured. Please contact administrator to set up Zoho Bigin access."
      });
    }

    if (error.message?.includes('credentials') || error.message?.includes('token')) {
      return res.status(401).json({
        success: false,
        error: "Zoho authentication failed. Please contact administrator to reconfigure Zoho access."
      });
    }

    res.status(500).json({
      success: false,
      error: error.message,
      companyId: req.params.companyId
    });
  }
});

/**
 * POST /zoho-upload/attached-file/:fileId/add-to-deal
 * Add attached file to existing Zoho deal
 */
router.post("/attached-file/:fileId/add-to-deal", async (req, res) => {
  try {
    const { fileId } = req.params;
    const { dealId, noteText, dealName, skipNoteCreation } = req.body; // ✅ NEW: Accept skipNoteCreation for bulk uploads

    console.log(`📎 [ATTACHED-FILE] Adding attached file ${fileId} to deal ${dealId}`,
                skipNoteCreation ? '(skipping note creation)' : '(will create note)');

    // Validate required fields
    if (!noteText || !noteText.trim()) {
      return res.status(400).json({
        success: false,
        error: "Note text is required"
      });
    }

    if (!dealId) {
      return res.status(400).json({
        success: false,
        error: "Deal ID is required"
      });
    }

    // ✅ DEBUG: Enhanced logging for attached file lookup
    console.log(`🔍 [ATTACHED-FILE-DEBUG] Looking up ManualUploadDocument with ID: ${fileId}`);

    // Validate ObjectId format first
    if (!mongoose.Types.ObjectId.isValid(fileId)) {
      console.error(`❌ [ATTACHED-FILE-DEBUG] Invalid ObjectId format: ${fileId}`);
      return res.status(400).json({
        success: false,
        error: "Invalid file ID format"
      });
    }

    // Find the attached file in ManualUploadDocument collection
    const manualDoc = await ManualUploadDocument.findById(fileId).select('fileName originalFileName mimeType pdfBuffer');

    if (!manualDoc) {
      console.error(`❌ [ATTACHED-FILE-DEBUG] ManualUploadDocument not found with ID: ${fileId}`);

      // ✅ DEBUG: Provide helpful debugging info
      const recentAttachedFiles = await ManualUploadDocument.find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .select('_id fileName originalFileName createdAt');

      console.log(`📋 [ATTACHED-FILE-DEBUG] Recent attached files in database (for debugging):`);
      recentAttachedFiles.forEach(doc => {
        console.log(`   - ${doc._id} (${doc.originalFileName || 'No name'}) created ${doc.createdAt}`);
      });

      return res.status(404).json({
        success: false,
        error: "Attached file not found",
        details: `ManualUploadDocument with ID ${fileId} does not exist in database`,
        debugInfo: {
          providedId: fileId,
          isValidObjectId: mongoose.Types.ObjectId.isValid(fileId),
          recentAttachedFileIds: recentAttachedFiles.map(f => f._id.toString())
        }
      });
    }

    if (!manualDoc.pdfBuffer) {
      return res.status(400).json({
        success: false,
        error: "Attached file has no PDF content"
      });
    }

    // Prepare file info
    const fileName = manualDoc.originalFileName || manualDoc.fileName || 'AttachedFile.pdf';
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9\-_.]/g, '_');
    const zohoFileName = `${cleanFileName.replace('.pdf', '')}_attached.pdf`;

    console.log(`📎 [ATTACHED-FILE] Processing: ${fileName} → ${zohoFileName}`);

    // Step 1: Create note (skip if this is a subsequent file in bulk upload)
    let note = null;
    if (!skipNoteCreation) {
      const noteResult = await createBiginNote(dealId, {
        title: `Attached File - ${fileName}`,
        content: noteText.trim()
      });

      if (!noteResult.success) {
        console.error(`❌ Failed to create note for attached file: ${noteResult.error?.message}`);
        return res.status(500).json({
          success: false,
          error: `Failed to create note: ${noteResult.error?.message}`
        });
      }

      note = noteResult.note;
      console.log(`✅ Note created for attached file: ${note.id}`);
    } else {
      console.log(`⏭️ Skipping note creation for bulk upload attached file`);
    }

    // Step 2: Upload file to deal
    let pdfBuffer;
    if (Buffer.isBuffer(manualDoc.pdfBuffer)) {
      pdfBuffer = manualDoc.pdfBuffer;
    } else if (typeof manualDoc.pdfBuffer === 'string') {
      pdfBuffer = Buffer.from(manualDoc.pdfBuffer, 'base64');
    } else {
      throw new Error('Invalid PDF buffer format');
    }

    console.log(`📎 Retrieved attached file PDF: ${pdfBuffer.length} bytes`);

    const fileResult = await uploadBiginFile(dealId, pdfBuffer, zohoFileName);

    if (!fileResult.success) {
      console.error(`❌ Failed to upload attached file: ${fileResult.error?.message}`);
      return res.status(500).json({
        success: false,
        error: `Note created but failed to upload file: ${fileResult.error?.message}`,
        noteId: note.id
      });
    }

    const file = fileResult.file;
    console.log(`✅ Attached file uploaded: ${file.id}`);

    console.log(`✅ Attached file upload completed successfully!`);
    console.log(`  ├ Deal: ${dealName} (${dealId})`);
    if (note) {
      console.log(`  ├ Note: ${note.id}`);
    } else {
      console.log(`  ├ Note: Skipped (bulk upload)`);
    }
    console.log(`  └ File: ${zohoFileName} (${file.id})`);

    res.json({
      success: true,
      message: `Successfully uploaded attached file to existing Zoho deal`,
      data: {
        deal: {
          id: dealId,
          name: dealName || 'Unknown Deal'
        },
        note: note ? {
          id: note.id,
          title: note.title
        } : null, // ✅ Handle case where note creation was skipped
        file: {
          id: file.id,
          fileName: zohoFileName
        },
        attachedFile: {
          id: fileId,
          originalName: fileName
        }
      }
    });
  } catch (err) {
    console.error("Attached file Zoho upload error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to upload attached file to Zoho",
      detail: err.message
    }); 
  }
});

export default router;