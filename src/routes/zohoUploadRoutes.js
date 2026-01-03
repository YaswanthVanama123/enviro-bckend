// src/routes/zohoUploadRoutes.js
import { Router } from "express";
import mongoose from "mongoose";  // ✅ NEW: Added for ObjectId validation
import ZohoMapping from "../models/ZohoMapping.js";
import CustomerHeaderDoc from "../models/CustomerHeaderDoc.js";
import ManualUploadDocument from "../models/ManualUploadDocument.js";
import Log from "../models/Log.js"; // ✅ NEW: For attached files
import VersionPdf from "../models/VersionPdf.js"; // ✅ FIX: Import VersionPdf for PDF data
import { compileCustomerHeader } from "../services/pdfService.js"; // ✅ FIX: Import PDF compiler for on-demand generation
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
 * ⚠️ DEPRECATED: This function is not currently used
 * Log files are kept as plain text files (.txt) and uploaded directly to Zoho
 * They remain downloadable but not viewable in Zoho (expected behavior for text files)
 *
 * This function was created to convert plain text log content to PDF using remote LaTeX service
 * but was reverted after clarification that logs should remain as text files
 */
async function convertTextLogToPdf(textContent, fileName = "log.txt") {
  console.log(`📄 [TEXT-TO-PDF] Converting log text to PDF: ${fileName}`);

  // Create simple LaTeX document with monospace font
  // Note: Using \begin{verbatim} environment handles all special characters automatically
  const latexContent = `\\documentclass[11pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[margin=1in]{geometry}
\\usepackage{fancyhdr}
\\usepackage{verbatim}

\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[L]{\\textbf{${fileName.replace(/_/g, '\\_')}}}
\\fancyfoot[C]{\\thepage}

\\begin{document}
\\section*{Log File: ${fileName.replace(/_/g, '\\_')}}

\\begin{verbatim}
${textContent}
\\end{verbatim}

\\end{document}`;

  try {
    // Use the remote PDF compilation service (same as compileCustomerHeader)
    const PDF_REMOTE_BASE = process.env.PDF_REMOTE_BASE || "http://142.93.213.187:3000";
    const timeoutMs = 30000; // 30 seconds for simple log conversion

    console.log(`🌐 [TEXT-TO-PDF] Calling remote LaTeX service: ${PDF_REMOTE_BASE}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    // ✅ FIX: Use correct endpoint 'pdf/compile' with 'template' parameter
    const response = await fetch(`${PDF_REMOTE_BASE}/pdf/compile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/pdf"
      },
      body: JSON.stringify({ template: latexContent }),  // ✅ Use 'template' not 'latexContent'
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(`❌ [TEXT-TO-PDF] Remote service error (${response.status}): ${errorText}`);
      throw new Error(`Remote LaTeX service failed: ${response.status} ${errorText}`);
    }

    const pdfBuffer = Buffer.from(await response.arrayBuffer());
    console.log(`✅ [TEXT-TO-PDF] Generated PDF: ${pdfBuffer.length} bytes`);

    return pdfBuffer;

  } catch (error) {
    console.error(`❌ [TEXT-TO-PDF] Failed to convert log to PDF: ${error.message}`);
    throw error;
  }
}

/**
 * ✅ Get PDF data for an agreement from VersionPdf collection
 * Current architecture: ALL PDFs (including v1) are stored in VersionPdf documents
 * CustomerHeaderDoc.pdf_meta.pdfBuffer is always null/empty
 */
async function getPdfForAgreement(agreementId, options = {}) {
  const requestedVersionId = options?.versionId ? String(options.versionId).trim() : null;
  const cachedAgreement = options?.agreementDoc || null;
  console.log(`ÐY"? [PDF-LOOKUP] Searching for PDF data in VersionPdf collection for agreement: ${agreementId}${requestedVersionId ? ` (versionId: ${requestedVersionId})` : ''}`);

  // ✅ FIX: Remove .lean() to properly handle large PDF buffers
  // Using .lean() with .select() on binary fields can cause buffer truncation
  let versionDoc = null;

  if (requestedVersionId) {
    if (mongoose.Types.ObjectId.isValid(requestedVersionId)) {
      versionDoc = await VersionPdf.findOne({
        _id: requestedVersionId,
        agreementId: agreementId,
        status: { $ne: 'archived' }
      })
      .select('_id versionNumber pdf_meta fileName createdAt');

      if (versionDoc) {
        console.log(`ÐY"? [PDF-LOOKUP] Found requested VersionPdf v${versionDoc.versionNumber} (ID: ${versionDoc._id})`);
      } else {
        console.warn(`ƒsÿ‹÷? [PDF-LOOKUP] Requested VersionPdf not found for agreement: ${agreementId} (id: ${requestedVersionId})`);
      }
    } else {
      console.warn(`ƒsÿ‹÷? [PDF-LOOKUP] Invalid requested versionId format: ${requestedVersionId}`);
    }
  }

  if (!versionDoc) {
    // ✅ FIX: Remove .lean() for proper buffer handling
    versionDoc = await VersionPdf.findOne({
      agreementId: agreementId,
      status: { $ne: 'archived' }
    })
    .sort({ versionNumber: -1 })
    .select('_id versionNumber pdf_meta fileName createdAt');

    if (!versionDoc) {
      console.error(`ƒ?O [PDF-LOOKUP] No VersionPdf documents found for agreement: ${agreementId}`);
      // ✅ FIX: Remove .lean() for proper buffer handling in fallback
      const customerDoc = cachedAgreement || await CustomerHeaderDoc.findById(agreementId)
        .select('pdf_meta fileName currentVersionNumber');

      if (customerDoc?.pdf_meta?.pdfBuffer) {
        const fallbackBuffer = Buffer.isBuffer(customerDoc.pdf_meta.pdfBuffer)
          ? customerDoc.pdf_meta.pdfBuffer
          : Buffer.from(customerDoc.pdf_meta.pdfBuffer);
        const resolvedFileName = customerDoc.fileName || customerDoc.pdf_meta.fileName || `agreement_${customerDoc.currentVersionNumber || 1}.pdf`;

        console.log(`ƒo. [PDF-LOOKUP] Falling back to CustomerHeaderDoc PDF: ${resolvedFileName} (${fallbackBuffer.length} bytes)`);

        return {
          pdfBuffer: fallbackBuffer,
          source: 'CustomerHeaderDoc',
          version: customerDoc.currentVersionNumber || 1,
          versionId: null,
          fileName: resolvedFileName,
          requestedVersionId,
          sizeBytes: customerDoc.pdf_meta.sizeBytes || fallbackBuffer.length,
          bufferSize: fallbackBuffer.length
        };
      }

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
          requestedVersionId,
          message: 'No VersionPdf documents exist for this agreement'
        }
      };
    }

    console.log(`ÐY"? [PDF-LOOKUP] Found VersionPdf v${versionDoc.versionNumber} (ID: ${versionDoc._id})`);
  }

  if (!versionDoc.pdf_meta?.pdfBuffer) {
    console.error(`ƒ?O [PDF-LOOKUP] VersionPdf v${versionDoc.versionNumber} has no pdfBuffer field`);

    return {
      pdfBuffer: null,
      source: 'VersionPdf',
      version: versionDoc.versionNumber,
      debugInfo: {
        error: 'no_pdf_buffer',
        versionId: versionDoc._id,
        versionNumber: versionDoc.versionNumber,
        hasPdfMeta: !!versionDoc.pdf_meta,
        createdAt: versionDoc.createdAt,
        requestedVersionId,
        message: 'VersionPdf document exists but pdfBuffer field is missing'
      }
    };
  }

  const mongoBuffer = versionDoc.pdf_meta.pdfBuffer;
  const actualSize = mongoBuffer.length || mongoBuffer.buffer?.length || 0;

  // ✅ ENHANCED: Log buffer retrieval for debugging Zoho upload issue
  console.log(`📊 [PDF-BUFFER-INFO] Retrieved buffer from database:`, {
    versionId: versionDoc._id,
    versionNumber: versionDoc.versionNumber,
    bufferType: Buffer.isBuffer(mongoBuffer) ? 'Node Buffer' : (mongoBuffer.buffer ? 'MongoDB Binary' : 'Unknown'),
    actualSize: actualSize,
    storedSizeBytes: versionDoc.pdf_meta.sizeBytes,
    isMongooseDoc: !!(versionDoc.constructor.name === 'model')
  });

  if (actualSize === 0) {
    console.error(`ƒ?O [PDF-LOOKUP] VersionPdf v${versionDoc.versionNumber} has empty pdfBuffer (0 bytes)`);

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
      version: versionDoc.versionNumber,
      debugInfo: {
        error: 'empty_pdf_buffer',
        versionId: versionDoc._id,
        versionNumber: versionDoc.versionNumber,
        versionCount: versionCount,
        versionsWithPdf: versionsWithPdf,
        sizeBytes: versionDoc.pdf_meta.sizeBytes || 0,
        actualSize: actualSize,
        createdAt: versionDoc.createdAt,
        requestedVersionId,
        message: `VersionPdf v${versionDoc.versionNumber} exists but pdfBuffer is empty (0 bytes). This suggests PDF compilation failed.`
      }
    };
  }

    const bufferSize = actualSize;
    const sizeBytes = versionDoc.pdf_meta.sizeBytes || bufferSize;
    const resolvedFileName = versionDoc.fileName || `version_${versionDoc.versionNumber}.pdf`;

  let properBuffer;
  if (Buffer.isBuffer(mongoBuffer)) {
    properBuffer = mongoBuffer;
  } else if (mongoBuffer.buffer) {
    properBuffer = Buffer.from(mongoBuffer.buffer);
  } else {
    properBuffer = Buffer.from(mongoBuffer);
  }

  const sourceLabel = requestedVersionId ? 'VersionPdf (requested)' : 'VersionPdf';
  console.log(`ƒo. [PDF-LOOKUP] Found valid PDF in ${sourceLabel} v${versionDoc.versionNumber}: ${properBuffer.length} bytes (converted to proper Buffer)`);

  return {
    pdfBuffer: properBuffer,
    source: sourceLabel,
    version: versionDoc.versionNumber,
    versionId: versionDoc._id,
    fileName: resolvedFileName,
    requestedVersionId,
    sizeBytes: sizeBytes,
    bufferSize: properBuffer.length
  };
}

function buildNormalizedFileName(rawName, fallbackBase = "file", fallbackExtension = ".pdf") {
  const candidate = ((rawName || "").trim()).replace(/[^a-zA-Z0-9-_.]/g, "_");
  const extensionMatch = candidate.match(/(\.[^./]+)$/);
  const extension = extensionMatch ? extensionMatch[1] : fallbackExtension;
  const baseName = extensionMatch ? candidate.slice(0, candidate.length - extension.length) : candidate;
  const sanitizedFallback = ((fallbackBase || "").trim()).replace(/[^a-zA-Z0-9-_.]/g, "_") || "file";
  const finalBase = baseName || sanitizedFallback;
  return `${finalBase}${extension}`;
}
/**
 * GET /zoho-upload/:agreementId/status
 * Check if this is first-time upload or update
 * ✅ OPTIMIZED: Parallel queries, lean(), select(), removed expensive debugging
 */
router.get("/:agreementId/status", async (req, res) => {
  try {
    const { agreementId } = req.params;

    console.log(`🔍 Checking upload status for agreement: ${agreementId}`);

    // ✅ OPTIMIZED: Validate ObjectId format first
    if (!mongoose.Types.ObjectId.isValid(agreementId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid agreement ID format"
      });
    }

    // ✅ OPTIMIZED: Run both queries in parallel + use lean() + select only needed fields
    const [agreement, mapping] = await Promise.all([
      CustomerHeaderDoc.findById(agreementId)
        .select('_id payload.headerTitle status')
        .lean()
        .exec(),
      ZohoMapping.findOne({ agreementId })
        .select('zohoCompany.id zohoCompany.name zohoDeal.id zohoDeal.name currentVersion lastUploadedAt')
        .lean()
        .exec()
    ]);

    if (!agreement) {
      console.error(`❌ CustomerHeaderDoc not found: ${agreementId}`);
      return res.status(404).json({
        success: false,
        error: "Agreement not found"
      });
    }

    console.log(`✅ Found CustomerHeaderDoc: ${agreement._id}`);

    if (mapping) {
      // ✅ OPTIMIZED: Calculate next version inline (no method call needed)
      const nextVersion = (mapping.currentVersion || 0) + 1;

      console.log(`✅ Existing mapping - UPDATE mode (v${mapping.currentVersion} → v${nextVersion})`);

      return res.json({
        success: true,
        isFirstTime: false,
        mapping: {
          companyName: mapping.zohoCompany.name,
          companyId: mapping.zohoCompany.id,
          dealName: mapping.zohoDeal.name,
          dealId: mapping.zohoDeal.id,
          currentVersion: mapping.currentVersion,
          nextVersion: nextVersion,
          lastUploadedAt: mapping.lastUploadedAt
        },
        agreement: {
          id: agreement._id,
          headerTitle: agreement.payload?.headerTitle || 'Customer Agreement',
          status: agreement.status
        }
      });
    } else {
      console.log(`🆕 No mapping - FIRST-TIME upload`);

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
      dealName,
      skipFileUpload = false  // ✅ NEW: Allow skipping PDF upload for bulk uploads
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

    // ✅ FIX: Recompile PDF on-demand (like download route) instead of using stored PDF
    // For first-time upload, get the latest version (v1) or use main agreement payload
    console.log(`🔄 [ZOHO-FIRST-TIME] Getting document for on-demand PDF compilation...`);

    let versionDoc = await VersionPdf.findOne({
      agreementId: agreementId,
      status: { $ne: 'archived' }
    })
    .sort({ versionNumber: -1 })
    .select('_id versionNumber payloadSnapshot fileName');

    let payloadForCompilation;
    let versionNumber;
    let fileName;

    if (versionDoc && versionDoc.payloadSnapshot) {
      // Use version's payloadSnapshot if available
      payloadForCompilation = versionDoc.payloadSnapshot;
      versionNumber = versionDoc.versionNumber;
      fileName = versionDoc.fileName;
      console.log(`📄 [ZOHO-FIRST-TIME] Using VersionPdf v${versionNumber} payloadSnapshot`);
    } else {
      // Fallback to main agreement payload
      payloadForCompilation = agreement.payload;
      versionNumber = agreement.currentVersionNumber || 1;
      fileName = agreement.fileName;
      console.log(`📄 [ZOHO-FIRST-TIME] Using CustomerHeaderDoc payload (no version found)`);
    }

    if (!payloadForCompilation) {
      console.error(`❌ Agreement ${agreementId} has no payload for PDF compilation`);
      return res.status(400).json({
        success: false,
        error: "Agreement has no payload data for PDF compilation"
      });
    }

    console.log(`🔄 [ZOHO-FIRST-TIME] Recompiling PDF on-demand for version ${versionNumber}...`);

    // Recompile PDF using the same method as download/view routes
    const compiledPdf = await compileCustomerHeader(payloadForCompilation, {
      watermark: false  // Zoho uploads should not have watermark
    });

    if (!compiledPdf || !compiledPdf.buffer) {
      console.error(`❌ Failed to compile PDF for version ${versionNumber}`);
      return res.status(500).json({
        success: false,
        error: "Failed to compile PDF for upload"
      });
    }

    console.log(`✅ [ZOHO-FIRST-TIME] PDF compiled successfully: ${compiledPdf.buffer.length} bytes`);

    // Create pdfData object for compatibility with rest of the code
    const pdfData = {
      pdfBuffer: compiledPdf.buffer,
      source: 'On-Demand Compilation',
      version: versionNumber,
      versionId: versionDoc?._id || null,
      fileName: fileName || `agreement_v${versionNumber}.pdf`,
      sizeBytes: compiledPdf.buffer.length,
      bufferSize: compiledPdf.buffer.length
    };

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

    // Step 3: Upload the PDF (optional - can be skipped for bulk uploads)
    let file = null;
    let finalVersionFileName = null;

    if (!skipFileUpload) {
      // ✅ FIX: pdfData.pdfBuffer is now a proper Node.js Buffer (converted from MongoDB Buffer)
      const pdfBuffer = pdfData.pdfBuffer; // Use the converted Buffer directly
      const sanitizedDealNameBase = dealName ? dealName.replace(/[^a-zA-Z0-9-_.]/g, "_") : "deal";
      const fallbackBase = `${sanitizedDealNameBase || "deal"}_v1`;
      finalVersionFileName = buildNormalizedFileName(pdfData.fileName, fallbackBase);

      console.log(`📎 Retrieved PDF from ${pdfData.source} v${pdfData.version}: ${pdfBuffer.length} bytes (proper Node.js Buffer for upload)`);

      // ✅ DEBUG: Verify buffer format for Zoho upload
      console.log(`🔍 [BUFFER-DEBUG] Buffer info:`, {
        isBuffer: Buffer.isBuffer(pdfBuffer),
        length: pdfBuffer.length,
        type: typeof pdfBuffer,
        constructor: pdfBuffer.constructor.name
      });

      const fileResult = await uploadBiginFile(deal.id, pdfBuffer, finalVersionFileName);

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

      file = fileResult.file;
      console.log(`✅ File uploaded: ${file.id}`);
    } else {
      console.log(`⏭️ Skipping PDF upload as requested (skipFileUpload: true)`);
    }

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

    // ✅ NEW: Only add upload entry if file was actually uploaded
    if (!skipFileUpload && file) {
      mapping.addUpload({
        zohoNoteId: note.id,
        zohoFileId: file.id,
        noteText: noteText.trim(),
        fileName: finalVersionFileName,
        uploadedBy: 'system' // TODO: Add user context
      });
    }

    await mapping.save();

    console.log(`✅ First-time upload completed successfully!`);
    console.log(`  ├ Deal: ${deal.name} (${deal.id})`);
    console.log(`  ├ Note: ${note.id}`);
    if (!skipFileUpload && file) {
      console.log(`  ├ File: ${finalVersionFileName} (${file.id})`);
    } else {
      console.log(`  ├ File: Skipped (will be added separately)`);
    }
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
        file: !skipFileUpload && file ? {
          id: file.id,
          fileName: finalVersionFileName
        } : null, // ✅ Handle case where file upload was skipped
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
    const {
      noteText,
      dealId: providedDealId,
      skipNoteCreation,
      versionId,
      versionFileName,
      skipFileUpload = false
    } = req.body; // ✅ NEW: Accept skipNoteCreation for bulk uploads + allow note-only updates

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

    // Check if agreement exists
    const agreement = await CustomerHeaderDoc.findById(agreementId);
    if (!agreement) {
      return res.status(404).json({
        success: false,
        error: "Agreement not found"
      });
    }

    let pdfData = null;
    let versionDoc = null;

    if (!skipFileUpload) {
      // ✅ FIX: Recompile PDF on-demand (like download route) instead of using stored PDF
      // Stored PDFs may be corrupted/incomplete, but recompilation always works
      console.log(`🔄 [ZOHO-UPLOAD] Getting version document for on-demand PDF compilation...`);

      // Get version document with payloadSnapshot for recompilation
      if (versionId) {
        versionDoc = await VersionPdf.findOne({
          _id: versionId,
          agreementId: agreementId,
          status: { $ne: 'archived' }
        }).select('_id versionNumber payloadSnapshot fileName');
      } else {
        versionDoc = await VersionPdf.findOne({
          agreementId: agreementId,
          status: { $ne: 'archived' }
        })
        .sort({ versionNumber: -1 })
        .select('_id versionNumber payloadSnapshot fileName');
      }

      if (!versionDoc || !versionDoc.payloadSnapshot) {
        console.error(`❌ Version document not found or missing payloadSnapshot for agreement: ${agreementId}`);
        return res.status(400).json({
          success: false,
          error: "Version document not found or missing data for PDF compilation",
          details: "Cannot compile PDF without payloadSnapshot data"
        });
      }

      console.log(`🔄 [ZOHO-UPLOAD] Recompiling PDF on-demand for version ${versionDoc.versionNumber}...`);

      // Recompile PDF using the same method as download/view routes
      const compiledPdf = await compileCustomerHeader(versionDoc.payloadSnapshot, {
        watermark: false  // Zoho uploads should not have watermark
      });

      if (!compiledPdf || !compiledPdf.buffer) {
        console.error(`❌ Failed to compile PDF for version ${versionDoc.versionNumber}`);
        return res.status(500).json({
          success: false,
          error: "Failed to compile PDF for upload"
        });
      }

      console.log(`✅ [ZOHO-UPLOAD] PDF compiled successfully: ${compiledPdf.buffer.length} bytes`);

      // Create pdfData object matching the old format for compatibility
      pdfData = {
        pdfBuffer: compiledPdf.buffer,
        source: 'On-Demand Compilation',
        version: versionDoc.versionNumber,
        versionId: versionDoc._id,
        fileName: versionDoc.fileName || `version_${versionDoc.versionNumber}.pdf`,
        sizeBytes: compiledPdf.buffer.length,
        bufferSize: compiledPdf.buffer.length
      };
    } else {
      console.log(`ℹ️ Skipping PDF lookup per request (skipFileUpload=true)`);
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

    if (skipFileUpload && !mapping) {
      return res.status(400).json({
        success: false,
        error: "Cannot perform note-only update without an existing Zoho mapping."
      });
    }

    const fallbackVersionBase = `Version_${skipFileUpload ? nextVersion : (pdfData?.version || nextVersion)}`;
    let finalVersionFileName = null;

    if (!skipFileUpload) {
      const incomingVersionFileName = versionFileName || pdfData.fileName || fallbackVersionBase;
      finalVersionFileName = buildNormalizedFileName(incomingVersionFileName, fallbackVersionBase);

      if (versionFileName) {
        console.log(`🔍 Using provided version filename override: ${versionFileName}`);
      }
    }

    const sanitizedNoteText = noteText.trim();

    // Step 1: Create note (skip if this is a subsequent file in bulk upload)
    let note = null;
    if (!skipNoteCreation) {
      let noteContent = sanitizedNoteText;
      if (!skipFileUpload && finalVersionFileName) {
        noteContent = `${sanitizedNoteText}${sanitizedNoteText ? "\n\n" : ""}Uploaded File: ${finalVersionFileName}`;
      }

      const noteTitle = finalVersionFileName || `Note update ${new Date().toISOString()}`;
      const noteResult = await createBiginNote(dealId, {
        title: noteTitle,
        content: noteContent
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
    let file = null;
    if (!skipFileUpload) {
      // ✅ FIX: pdfData.pdfBuffer is now a proper Node.js Buffer (converted from MongoDB Buffer)
      const pdfBuffer = pdfData.pdfBuffer; // Use the converted Buffer directly

      // ✅ ENHANCED: Validate PDF buffer before upload
      if (!Buffer.isBuffer(pdfBuffer)) {
        console.error(`❌ [VERSION-UPLOAD] PDF buffer is not a Buffer:`, {
          type: typeof pdfBuffer,
          constructor: pdfBuffer?.constructor?.name
        });
        return res.status(500).json({
          success: false,
          error: "Invalid PDF buffer format"
        });
      }

      // ✅ ENHANCED: Validate PDF content (check for PDF magic number)
      if (pdfBuffer.length > 0 && !pdfBuffer.slice(0, 4).toString('ascii').startsWith('%PDF')) {
        console.error(`❌ [VERSION-UPLOAD] Buffer does not contain valid PDF data`);
        return res.status(500).json({
          success: false,
          error: "PDF buffer contains invalid data"
        });
      }

      console.log(`📎 [VERSION-UPLOAD] Uploading version PDF:`, {
        fileName: finalVersionFileName,
        bufferLength: pdfBuffer.length,
        versionId: pdfData.versionId,
        source: pdfData.source
      });

      const fileResult = await uploadBiginFile(dealId, pdfBuffer, finalVersionFileName);

      if (!fileResult.success) {
        console.error(`❌ Failed to upload file, noteId: ${note?.id || 'none'}`);
        return res.status(500).json({
          success: false,
          error: `Note created but failed to upload file: ${fileResult.error?.message}`,
          noteId: note?.id || null
        });
      }

      file = fileResult.file;
      console.log(`✅ File uploaded: ${file.id}`);
    } else {
      console.log(`ℹ️ Skipping PDF upload because skipFileUpload=true`);
    }

    // Step 3: Update or create mapping in MongoDB
    if (!skipFileUpload) {
      if (mapping) {
        // Update existing mapping
        mapping.addUpload({
          zohoNoteId: note?.id || null, // ✅ FIXED: Allow null when note creation is skipped
          zohoFileId: file.id,
          noteText: noteText.trim(),
          fileName: finalVersionFileName,
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
            fileName: finalVersionFileName,
            uploadedAt: new Date(),
            uploadedBy: 'system'
          }]
        });

        await mapping.save();
        console.log(`✅ [BULK] Created new mapping: ${mapping._id}`);
      }
    } else {
      console.log(`ℹ️ Note-only update detected, skipping mapping upload entry`);
    }

    console.log(`✅ Update upload completed successfully!`);
    console.log(`  ├ Deal: ${dealName} (${dealId})`);
    if (note) {
      console.log(`  ├ Note: ${note.id}`);
    } else {
      console.log(`  ├ Note: Skipped (bulk upload)`);
    }
    if (!skipFileUpload && file) {
      console.log(`  ├ File: ${finalVersionFileName} (${file.id})`);
    } else {
      console.log(`  ├ File: Skipped (note-only update)`);
    }
    console.log(`  └ Version: ${nextVersion}`);

    res.json({
      success: true,
      message: skipFileUpload
        ? `Successfully added note to Zoho deal ${dealName}`
        : `Successfully uploaded version ${nextVersion} to existing Zoho deal`,
      data: {
        deal: {
          id: dealId,
          name: dealName
        },
        note: note ? {
          id: note.id,
          title: note.title
        } : null, // ✅ Handle case where note creation was skipped
        file: file ? {
          id: file.id,
          fileName: finalVersionFileName
        } : null,
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
 * Add attached file or version log to existing Zoho deal
 */
router.post("/attached-file/:fileId/add-to-deal", async (req, res) => {
  try {
    const { fileId } = req.params;
    const { dealId, noteText, dealName, skipNoteCreation, fileType } = req.body;

    const trimmedNoteText = (noteText || "").trim();
    if (!trimmedNoteText) {
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

    if (!mongoose.Types.ObjectId.isValid(fileId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid file ID format"
      });
    }

    const normalizedFileType = (fileType || "attached_pdf").toLowerCase();
    const isLogAttachment = normalizedFileType === "version_log";

    let pdfBuffer;
    let originalFileName = isLogAttachment ? "Version_Log.txt" : "AttachedFile.pdf";

    if (isLogAttachment) {
      console.log(`[ATTACHED-FILE] Looking up Log document with ID: ${fileId}`);
      const logDoc = await Log.findOne({
        _id: fileId,
        isDeleted: { $ne: true }
      });

      if (!logDoc) {
        console.error(`[ATTACHED-FILE] Log document not found: ${fileId}`);
        const recentLogs = await Log.find({})
          .sort({ createdAt: -1 })
          .limit(5)
          .select("_id versionNumber agreementId createdAt");

        console.log(`[ATTACHED-FILE] Recent logs for debugging:`);
        recentLogs.forEach(doc => {
          console.log(`   - ${doc._id} (v${doc.versionNumber}) created ${doc.createdAt}`);
        });

        return res.status(404).json({
          success: false,
          error: "Log file not found",
          detail: `Log document with ID ${fileId} does not exist in database`,
          debugInfo: {
            providedId: fileId,
            isValidObjectId: mongoose.Types.ObjectId.isValid(fileId),
            recentLogIds: recentLogs.map(l => l._id.toString())
          }
        });
      }

      originalFileName = logDoc.fileName || logDoc.documentTitle || originalFileName;
      const textContent = logDoc.generateTextContent();

      // Keep log files as plain text (they'll be downloadable but not viewable in Zoho)
      pdfBuffer = Buffer.from(textContent, "utf8");
      console.log(`📄 [ATTACHED-FILE] Log text buffer created: ${pdfBuffer.length} bytes`);
    } else {
      console.log(`[ATTACHED-FILE] Looking up ManualUploadDocument with ID: ${fileId}`);
      const manualDoc = await ManualUploadDocument.findById(fileId).select("fileName originalFileName pdfBuffer");

      if (!manualDoc) {
        console.error(`[ATTACHED-FILE] ManualUploadDocument not found: ${fileId}`);
        const recentAttachedFiles = await ManualUploadDocument.find({})
          .sort({ createdAt: -1 })
          .limit(5)
          .select("_id fileName originalFileName createdAt");

        console.log(`[ATTACHED-FILE] Recent attached files for debugging:`);
        recentAttachedFiles.forEach(doc => {
          console.log(`   - ${doc._id} (${doc.originalFileName || "No name"}) created ${doc.createdAt}`);
        });

        return res.status(404).json({
          success: false,
          error: "Attached file not found",
          detail: `ManualUploadDocument with ID ${fileId} does not exist in database`,
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

      originalFileName = manualDoc.originalFileName || manualDoc.fileName || originalFileName;

      if (Buffer.isBuffer(manualDoc.pdfBuffer)) {
        pdfBuffer = manualDoc.pdfBuffer;
      } else if (typeof manualDoc.pdfBuffer === "string") {
        pdfBuffer = Buffer.from(manualDoc.pdfBuffer, "base64");
      } else {
        throw new Error("Invalid PDF buffer format");
      }
    }

    const sanitizedFileNameBase = (originalFileName || "file").replace(/[^a-zA-Z0-9-_.]/g, "_");
    const extensionMatch = sanitizedFileNameBase.match(/(\.[^./]+)$/);
    const extensionFromName = extensionMatch ? extensionMatch[1] : "";
    const baseName = extensionMatch
      ? sanitizedFileNameBase.slice(0, sanitizedFileNameBase.length - extensionFromName.length)
      : sanitizedFileNameBase;
    const suffix = isLogAttachment ? "_log" : "_attached";
    // Log files remain as .txt, manual uploads are .pdf
    const finalExtension = isLogAttachment ? ".txt" : ".pdf";
    const zohoFileName = `${baseName || "file"}${suffix}${finalExtension}`;

    console.log(`[ATTACHED-FILE] Processing ${normalizedFileType}: ${originalFileName} -> ${zohoFileName}`);

    let note = null;
    if (!skipNoteCreation) {
      const noteTitle = isLogAttachment ? `Version Log - ${originalFileName}` : `Attached File - ${originalFileName}`;
      const noteResult = await createBiginNote(dealId, {
        title: noteTitle,
        content: trimmedNoteText
      });

      if (!noteResult.success) {
        console.error(`[ATTACHED-FILE] Note creation failed: ${noteResult.error}`);
        return res.status(500).json({
          success: false,
          error: `Failed to create note: ${noteResult.error?.message || "Unknown error"}`
        });
      }

      note = noteResult.note;
      console.log(`[ATTACHED-FILE] Note created: ${note.id}`);
    } else {
      console.log(`[ATTACHED-FILE] Skipping note creation for ${normalizedFileType} (bulk upload)`);
    }

    const fileResult = await uploadBiginFile(dealId, pdfBuffer, zohoFileName, {
      contentType: isLogAttachment ? "text/plain" : "application/pdf"
    });
    if (!fileResult.success) {
      console.error(`[ATTACHED-FILE] File upload failed: ${fileResult.error}`);
      return res.status(500).json({
        success: false,
        error: `Failed to upload file: ${fileResult.error?.message || "Unknown error"}`,
        noteId: note?.id,
        fileType: normalizedFileType
      });
    }

    const file = fileResult.file;
    console.log(`[ATTACHED-FILE] Uploaded file ${file.id} to deal ${dealId}`);

    res.json({
      success: true,
      message: `Successfully uploaded ${isLogAttachment ? "version log" : "attached file"} to Zoho Bigin`,
      data: {
        deal: {
          id: dealId,
          name: dealName || "Unknown Deal"
        },
        note: note
          ? {
              id: note.id,
              title: note.title
            }
          : null,
        file: {
          id: file.id,
          fileName: zohoFileName
        },
        uploadedFile: {
          id: fileId,
          originalName: originalFileName,
          fileType: normalizedFileType
        }
      }
    });
  } catch (error) {
    console.error("Attached file Zoho upload error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to upload attached file to Zoho",
      detail: error.message
    });
  }
});

/**
 * POST /zoho-upload/:agreementId/batch-update
 * ✅ OPTIMIZED: Batch upload multiple version PDFs to existing deal in single API call
 * Reduces N API calls to 1 API call for bulk uploads
 */
router.post("/:agreementId/batch-update", async (req, res) => {
  try {
    const { agreementId } = req.params;
    const { versionIds, noteText, dealId: providedDealId } = req.body;

    console.log(`📦 [BATCH-UPDATE] Starting batch upload for agreement: ${agreementId}`);
    console.log(`📦 [BATCH-UPDATE] Files to upload: ${versionIds?.length || 0}`);

    // Validate required fields
    if (!noteText || !noteText.trim()) {
      return res.status(400).json({
        success: false,
        error: "Note text is required for batch updates"
      });
    }

    if (!Array.isArray(versionIds) || versionIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: "versionIds array is required and must not be empty"
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

    let dealId, dealName, nextVersion, mapping;

    // Get or create mapping
    if (providedDealId) {
      // BULK UPLOAD MODE: Use provided dealId from first file's deal
      dealId = providedDealId;
      mapping = await ZohoMapping.findByAgreementId(agreementId);

      if (mapping) {
        nextVersion = mapping.getNextVersion();
        dealName = mapping.zohoDeal.name;
        console.log(`📦 [BATCH-UPDATE] Adding to existing deal ${dealId}, starting version ${nextVersion}`);
      } else {
        // Create new mapping for this batch
        nextVersion = 1;
        dealName = `Batch Upload Deal ${dealId}`;
        console.log(`📦 [BATCH-UPDATE] Creating new mapping for batch in shared deal ${dealId}`);
      }
    } else {
      // Use existing mapping
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
      console.log(`📦 [BATCH-UPDATE] Adding batch to existing deal: ${dealId}, starting version ${nextVersion}`);
    }

    // Process all version PDFs
    const processedFiles = [];
    const failedFiles = [];

    for (let i = 0; i < versionIds.length; i++) {
      const versionId = versionIds[i];

      try {
        console.log(`📄 [BATCH-UPDATE] Processing ${i + 1}/${versionIds.length}: ${versionId}`);

        // Get version document with payloadSnapshot for recompilation
        const versionDoc = await VersionPdf.findOne({
          _id: versionId,
          agreementId: agreementId,
          status: { $ne: 'archived' }
        }).select('_id versionNumber payloadSnapshot fileName');

        if (!versionDoc || !versionDoc.payloadSnapshot) {
          console.error(`❌ [BATCH-UPDATE] Version ${versionId} not found or missing payloadSnapshot`);
          failedFiles.push({
            versionId,
            error: "Version document not found or missing data for PDF compilation"
          });
          continue;
        }

        console.log(`🔄 [BATCH-UPDATE] Recompiling PDF for version ${versionDoc.versionNumber}...`);

        // Recompile PDF on-demand
        const compiledPdf = await compileCustomerHeader(versionDoc.payloadSnapshot, {
          watermark: false
        });

        if (!compiledPdf || !compiledPdf.buffer) {
          console.error(`❌ [BATCH-UPDATE] Failed to compile PDF for version ${versionDoc.versionNumber}`);
          failedFiles.push({
            versionId,
            fileName: versionDoc.fileName,
            error: "Failed to compile PDF"
          });
          continue;
        }

        const pdfBuffer = compiledPdf.buffer;
        const fileName = versionDoc.fileName || `version_${versionDoc.versionNumber}.pdf`;

        // Validate PDF buffer
        if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
          console.error(`❌ [BATCH-UPDATE] Invalid PDF buffer for version ${versionDoc.versionNumber}`);
          failedFiles.push({
            versionId,
            fileName,
            error: "Invalid PDF buffer"
          });
          continue;
        }

        processedFiles.push({
          versionId: versionDoc._id,
          versionNumber: versionDoc.versionNumber,
          fileName,
          pdfBuffer,
          bufferSize: pdfBuffer.length
        });

        console.log(`✅ [BATCH-UPDATE] Processed ${fileName}: ${pdfBuffer.length} bytes`);
      } catch (err) {
        console.error(`❌ [BATCH-UPDATE] Error processing version ${versionId}:`, err);
        failedFiles.push({
          versionId,
          error: err.message
        });
      }
    }

    if (processedFiles.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No files could be processed successfully",
        failedFiles
      });
    }

    console.log(`📦 [BATCH-UPDATE] Successfully processed ${processedFiles.length}/${versionIds.length} files`);

    // Create SINGLE note with all file names listed
    const fileList = processedFiles.map(f => `• ${f.fileName}`).join('\n');
    const batchNoteContent = `${noteText.trim()}\n\nBatch upload of ${processedFiles.length} files:\n${fileList}`;

    const noteResult = await createBiginNote(dealId, {
      title: `Batch Upload - ${processedFiles.length} files`,
      content: batchNoteContent
    });

    if (!noteResult.success) {
      return res.status(500).json({
        success: false,
        error: `Failed to create note: ${noteResult.error?.message || 'Unknown error'}`,
        details: noteResult.error,
        processedFiles: processedFiles.length,
        failedFiles: failedFiles.length
      });
    }

    const note = noteResult.note;
    console.log(`✅ [BATCH-UPDATE] Created batch note: ${note.id}`);

    // Upload all PDFs to Zoho deal
    const uploadResults = [];
    let currentVersion = nextVersion;

    for (const file of processedFiles) {
      try {
        console.log(`📤 [BATCH-UPDATE] Uploading ${file.fileName} to Zoho...`);

        const fileResult = await uploadBiginFile(dealId, file.pdfBuffer, file.fileName);

        if (!fileResult.success) {
          console.error(`❌ [BATCH-UPDATE] Failed to upload ${file.fileName}:`, fileResult.error);
          failedFiles.push({
            versionId: file.versionId,
            fileName: file.fileName,
            error: fileResult.error?.message || 'Upload failed'
          });
        } else {
          console.log(`✅ [BATCH-UPDATE] Uploaded ${file.fileName}: ${fileResult.file.id}`);

          uploadResults.push({
            versionId: file.versionId,
            versionNumber: file.versionNumber,
            fileName: file.fileName,
            zohoFileId: fileResult.file.id,
            version: currentVersion
          });

          currentVersion++;
        }
      } catch (err) {
        console.error(`❌ [BATCH-UPDATE] Error uploading ${file.fileName}:`, err);
        failedFiles.push({
          versionId: file.versionId,
          fileName: file.fileName,
          error: err.message
        });
      }
    }

    // Update MongoDB mapping with all successful uploads
    if (uploadResults.length > 0 && mapping) {
      // Add all uploads to existing mapping
      for (const result of uploadResults) {
        mapping.addUpload({
          zohoNoteId: note.id,
          zohoFileId: result.zohoFileId,
          noteText: noteText.trim(),
          fileName: result.fileName,
          uploadedBy: 'system'
        });
      }
      await mapping.save();
      console.log(`✅ [BATCH-UPDATE] Updated mapping with ${uploadResults.length} new uploads`);
    } else if (uploadResults.length > 0 && !mapping) {
      console.warn(`⚠️ [BATCH-UPDATE] No mapping found for agreement ${agreementId} - uploads completed but not tracked in mapping`);
    }

    console.log(`✅ [BATCH-UPDATE] Batch upload completed!`);
    console.log(`  ├ Total files: ${versionIds.length}`);
    console.log(`  ├ Successful: ${uploadResults.length}`);
    console.log(`  ├ Failed: ${failedFiles.length}`);
    console.log(`  ├ Deal: ${dealName} (${dealId})`);
    console.log(`  ├ Note: ${note.id}`);
    console.log(`  └ Versions: ${nextVersion} - ${currentVersion - 1}`);

    res.json({
      success: true,
      message: `Successfully uploaded ${uploadResults.length} of ${versionIds.length} files in batch`,
      data: {
        deal: {
          id: dealId,
          name: dealName
        },
        note: {
          id: note.id,
          title: note.title
        },
        uploadedFiles: uploadResults,
        failedFiles: failedFiles.length > 0 ? failedFiles : undefined,
        mapping: mapping ? {
          id: mapping._id,
          startVersion: nextVersion,
          endVersion: currentVersion - 1,
          totalVersions: mapping.uploads.length
        } : undefined,
        summary: {
          total: versionIds.length,
          successful: uploadResults.length,
          failed: failedFiles.length
        }
      }
    });

  } catch (error) {
    console.error("❌ [BATCH-UPDATE] Batch upload failed:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /zoho-upload/batch-attached-files/add-to-deal
 * ✅ OPTIMIZED: Batch upload multiple attached files to existing deal in single API call
 * Reduces N API calls to 1 API call for bulk uploads
 */
router.post("/batch-attached-files/add-to-deal", async (req, res) => {
  try {
    const { fileIds, dealId, noteText, dealName } = req.body;

    console.log(`📦 [BATCH-ATTACHED] Starting batch upload of attached files`);
    console.log(`📦 [BATCH-ATTACHED] Files to upload: ${fileIds?.length || 0}`);

    // Validate required fields
    const trimmedNoteText = (noteText || "").trim();
    if (!trimmedNoteText) {
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

    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: "fileIds array is required and must not be empty"
      });
    }

    // Process all attached files
    const processedFiles = [];
    const failedFiles = [];

    for (let i = 0; i < fileIds.length; i++) {
      const fileInfo = fileIds[i];
      const fileId = typeof fileInfo === 'string' ? fileInfo : fileInfo.fileId;
      const fileType = typeof fileInfo === 'string' ? 'attached_pdf' : (fileInfo.fileType || 'attached_pdf');

      try {
        console.log(`📄 [BATCH-ATTACHED] Processing ${i + 1}/${fileIds.length}: ${fileId} (${fileType})`);

        if (!mongoose.Types.ObjectId.isValid(fileId)) {
          failedFiles.push({
            fileId,
            fileType,
            error: "Invalid file ID format"
          });
          continue;
        }

        const normalizedFileType = fileType.toLowerCase();
        const isLogAttachment = normalizedFileType === "version_log";

        let pdfBuffer;
        let originalFileName = isLogAttachment ? "Version_Log.txt" : "AttachedFile.pdf";

        if (isLogAttachment) {
          const logDoc = await Log.findOne({
            _id: fileId,
            isDeleted: { $ne: true }
          });

          if (!logDoc) {
            console.error(`❌ [BATCH-ATTACHED] Log document not found: ${fileId}`);
            failedFiles.push({
              fileId,
              fileType,
              error: "Log file not found"
            });
            continue;
          }

          originalFileName = logDoc.fileName || logDoc.documentTitle || originalFileName;
          const textContent = logDoc.generateTextContent();
          pdfBuffer = Buffer.from(textContent, "utf8");
        } else {
          const manualDoc = await ManualUploadDocument.findById(fileId).select("fileName originalFileName pdfBuffer");

          if (!manualDoc) {
            console.error(`❌ [BATCH-ATTACHED] ManualUploadDocument not found: ${fileId}`);
            failedFiles.push({
              fileId,
              fileType,
              error: "Attached file not found"
            });
            continue;
          }

          if (!manualDoc.pdfBuffer) {
            failedFiles.push({
              fileId,
              fileType,
              error: "Attached file has no PDF content"
            });
            continue;
          }

          originalFileName = manualDoc.originalFileName || manualDoc.fileName || originalFileName;

          if (Buffer.isBuffer(manualDoc.pdfBuffer)) {
            pdfBuffer = manualDoc.pdfBuffer;
          } else if (typeof manualDoc.pdfBuffer === "string") {
            pdfBuffer = Buffer.from(manualDoc.pdfBuffer, "base64");
          } else {
            throw new Error("Invalid PDF buffer format");
          }
        }

        // Generate Zoho filename
        const sanitizedFileNameBase = (originalFileName || "file").replace(/[^a-zA-Z0-9-_.]/g, "_");
        const extensionMatch = sanitizedFileNameBase.match(/(\.[^./]+)$/);
        const extensionFromName = extensionMatch ? extensionMatch[1] : "";
        const baseName = extensionMatch
          ? sanitizedFileNameBase.slice(0, sanitizedFileNameBase.length - extensionFromName.length)
          : sanitizedFileNameBase;
        const suffix = isLogAttachment ? "_log" : "_attached";
        const finalExtension = isLogAttachment ? ".txt" : ".pdf";
        const zohoFileName = `${baseName || "file"}${suffix}${finalExtension}`;

        processedFiles.push({
          fileId,
          fileType: normalizedFileType,
          originalFileName,
          zohoFileName,
          pdfBuffer,
          isLogAttachment
        });

        console.log(`✅ [BATCH-ATTACHED] Processed ${originalFileName} -> ${zohoFileName}: ${pdfBuffer.length} bytes`);
      } catch (err) {
        console.error(`❌ [BATCH-ATTACHED] Error processing file ${fileId}:`, err);
        failedFiles.push({
          fileId,
          fileType,
          error: err.message
        });
      }
    }

    if (processedFiles.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No files could be processed successfully",
        failedFiles
      });
    }

    console.log(`📦 [BATCH-ATTACHED] Successfully processed ${processedFiles.length}/${fileIds.length} files`);

    // Create SINGLE note with all file names listed
    const fileList = processedFiles.map(f => `• ${f.originalFileName}`).join('\n');
    const batchNoteContent = `${trimmedNoteText}\n\nBatch upload of ${processedFiles.length} attached files:\n${fileList}`;

    const noteResult = await createBiginNote(dealId, {
      title: `Batch Attached Files - ${processedFiles.length} files`,
      content: batchNoteContent
    });

    if (!noteResult.success) {
      return res.status(500).json({
        success: false,
        error: `Failed to create note: ${noteResult.error?.message || 'Unknown error'}`,
        processedFiles: processedFiles.length,
        failedFiles: failedFiles.length
      });
    }

    const note = noteResult.note;
    console.log(`✅ [BATCH-ATTACHED] Created batch note: ${note.id}`);

    // Upload all files to Zoho deal
    const uploadResults = [];

    for (const file of processedFiles) {
      try {
        console.log(`📤 [BATCH-ATTACHED] Uploading ${file.zohoFileName} to Zoho...`);

        const fileResult = await uploadBiginFile(dealId, file.pdfBuffer, file.zohoFileName, {
          contentType: file.isLogAttachment ? "text/plain" : "application/pdf"
        });

        if (!fileResult.success) {
          console.error(`❌ [BATCH-ATTACHED] Failed to upload ${file.zohoFileName}:`, fileResult.error);
          failedFiles.push({
            fileId: file.fileId,
            fileName: file.originalFileName,
            error: fileResult.error?.message || 'Upload failed'
          });
        } else {
          console.log(`✅ [BATCH-ATTACHED] Uploaded ${file.zohoFileName}: ${fileResult.file.id}`);

          uploadResults.push({
            fileId: file.fileId,
            fileType: file.fileType,
            originalFileName: file.originalFileName,
            zohoFileName: file.zohoFileName,
            zohoFileId: fileResult.file.id
          });
        }
      } catch (err) {
        console.error(`❌ [BATCH-ATTACHED] Error uploading ${file.zohoFileName}:`, err);
        failedFiles.push({
          fileId: file.fileId,
          fileName: file.originalFileName,
          error: err.message
        });
      }
    }

    console.log(`✅ [BATCH-ATTACHED] Batch upload completed!`);
    console.log(`  ├ Total files: ${fileIds.length}`);
    console.log(`  ├ Successful: ${uploadResults.length}`);
    console.log(`  ├ Failed: ${failedFiles.length}`);
    console.log(`  ├ Deal: ${dealName || dealId}`);
    console.log(`  └ Note: ${note.id}`);

    res.json({
      success: true,
      message: `Successfully uploaded ${uploadResults.length} of ${fileIds.length} attached files in batch`,
      data: {
        deal: {
          id: dealId,
          name: dealName || "Unknown Deal"
        },
        note: {
          id: note.id,
          title: note.title
        },
        uploadedFiles: uploadResults,
        failedFiles: failedFiles.length > 0 ? failedFiles : undefined,
        summary: {
          total: fileIds.length,
          successful: uploadResults.length,
          failed: failedFiles.length
        }
      }
    });

  } catch (error) {
    console.error("❌ [BATCH-ATTACHED] Batch upload failed:", error);
    res.status(500).json({
      success: false,
      error: "Failed to upload attached files in batch",
      detail: error.message
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

export default router;
