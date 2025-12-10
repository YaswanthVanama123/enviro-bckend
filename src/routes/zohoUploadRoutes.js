// src/routes/zohoUploadRoutes.js
import { Router } from "express";
import ZohoMapping from "../models/ZohoMapping.js";
import CustomerHeaderDoc from "../models/CustomerHeaderDoc.js";
import {
  getBiginCompanies,
  searchBiginCompanies,
  createBiginCompany,
  createBiginDeal,
  createBiginNote,
  uploadBiginFile,
  getBiginModules,
  getBiginPipelineStages,
  validatePipelineStage
} from "../services/zohoService.js";

const router = Router();

/**
 * GET /zoho-upload/:agreementId/status
 * Check if this is first-time upload or update
 */
router.get("/:agreementId/status", async (req, res) => {
  try {
    const { agreementId } = req.params;

    console.log(`🔍 Checking upload status for agreement: ${agreementId}`);

    // Check if agreement exists
    const agreement = await CustomerHeaderDoc.findById(agreementId);
    if (!agreement) {
      return res.status(404).json({
        success: false,
        error: "Agreement not found"
      });
    }

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
      validatedStage = validationResult.correctedStage || "Proposal";
      console.log(`🔧 Using validated fallback: "${validatedPipeline}" / "${validatedStage}"`);
    }

    // Check if agreement exists and has PDF
    const agreement = await CustomerHeaderDoc.findById(agreementId);
    if (!agreement) {
      return res.status(404).json({
        success: false,
        error: "Agreement not found"
      });
    }

    if (!agreement.pdf_meta?.pdfBuffer) {
      return res.status(400).json({
        success: false,
        error: "Agreement has no PDF to upload"
      });
    }

    // Check if mapping already exists (prevent duplicate first-time uploads)
    const existingMapping = await ZohoMapping.findByAgreementId(agreementId);
    if (existingMapping) {
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

    // Step 1: Create the deal in Zoho Bigin
    const dealResult = await createBiginDeal({
      dealName: dealName.trim(),
      companyId,
      pipelineName: validatedPipeline,  // ✅ Use validated pipeline
      stage: validatedStage,            // ✅ Use validated stage
      amount: dealAmount,
      description: `EnviroMaster service agreement - ${agreement.payload?.headerTitle || 'Service Proposal'}`
    });

    if (!dealResult.success) {
      console.error(`❌ Deal creation failed:`, dealResult.error);

      // Create partial mapping to track the failure
      const failedMapping = new ZohoMapping({
        agreementId,
        zohoCompany: {
          id: companyId,
          name: companyName,
          createdByUs: false
        },
        // Can't create complete deal info since creation failed
        zohoDeal: {
          id: 'FAILED_CREATION',
          name: dealName.trim(),
          pipelineName: validatedPipeline,  // ✅ Store validated values
          stage: validatedStage             // ✅ Store validated values
        },
        lastUploadStatus: 'failed',
        lastError: `Deal creation failed: ${dealResult.error?.message || 'Unknown error'}`
      });

      failedMapping.failedUploads.push({
        errorType: 'deal_creation_failed',
        errorMessage: dealResult.error?.message || 'Deal creation failed',
        zohoResponse: dealResult.error
      });

      await failedMapping.save();

      return res.status(500).json({
        success: false,
        error: `Failed to create deal: ${dealResult.error?.message || 'Unknown error'}`,
        details: dealResult.error,
        mappingId: failedMapping._id
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

      // Create mapping to track partial success (deal created, note failed)
      const partialMapping = new ZohoMapping({
        agreementId,
        zohoCompany: {
          id: companyId,
          name: companyName,
          createdByUs: false
        },
        zohoDeal: {
          id: deal.id,
          name: deal.name,
          pipelineName: validatedPipeline,  // ✅ Store validated values
          stage: validatedStage             // ✅ Store validated values
        },
        lastUploadStatus: 'partial',
        lastError: `Note creation failed: ${noteResult.error?.message || 'Unknown error'}`
      });

      partialMapping.failedUploads.push({
        errorType: 'note_failed',
        errorMessage: noteResult.error?.message || 'Note creation failed',
        zohoResponse: noteResult.error
      });

      await partialMapping.save();

      return res.status(500).json({
        success: false,
        error: `Deal created but failed to create note: ${noteResult.error?.message}`,
        dealId: deal.id,
        mappingId: partialMapping._id,
        note: "Deal was created successfully. You can try uploading again."
      });
    }

    const note = noteResult.note;
    console.log(`✅ Note created: ${note.id}`);

    // Step 3: Upload the PDF
    const pdfBuffer = Buffer.from(agreement.pdf_meta.pdfBuffer, 'base64');
    const fileName = `${dealName.replace(/[^a-zA-Z0-9-_]/g, '_')}_v1.pdf`;

    console.log(`📎 Retrieved PDF from MongoDB: ${pdfBuffer.length} bytes (converted from base64: ${agreement.pdf_meta.pdfBuffer.length} chars)`);

    const fileResult = await uploadBiginFile(deal.id, pdfBuffer, fileName);

    if (!fileResult.success) {
      console.error(`❌ Failed to upload file, but deal and note exist: ${deal.id}, ${note.id}`);

      // Create mapping to track partial success (deal + note created, file failed)
      const partialMapping = new ZohoMapping({
        agreementId,
        zohoCompany: {
          id: companyId,
          name: companyName,
          createdByUs: false
        },
        zohoDeal: {
          id: deal.id,
          name: deal.name,
          pipelineName: validatedPipeline,  // ✅ Store validated values
          stage: validatedStage             // ✅ Store validated values
        },
        lastUploadStatus: 'partial',
        lastError: `File upload failed: ${fileResult.error?.message || 'Unknown error'}`
      });

      partialMapping.failedUploads.push({
        errorType: 'file_failed',
        errorMessage: fileResult.error?.message || 'File upload failed',
        zohoResponse: fileResult.error
      });

      // Add partial upload record (note created but no file)
      partialMapping.addUpload({
        zohoNoteId: note.id,
        zohoFileId: 'FAILED_UPLOAD',
        noteText: noteText.trim(),
        fileName: fileName,
        uploadedBy: 'system'
      });

      await partialMapping.save();

      return res.status(500).json({
        success: false,
        error: `Deal and note created but failed to upload file: ${fileResult.error?.message}`,
        dealId: deal.id,
        noteId: note.id,
        mappingId: partialMapping._id,
        note: "Deal and note were created successfully. You can try uploading the file again."
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
        pipelineName: validatedPipeline,  // ✅ Store validated values
        stage: validatedStage             // ✅ Store validated values
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
    const { noteText } = req.body;

    console.log(`🔄 Starting update upload for agreement: ${agreementId}`);

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

    if (!agreement.pdf_meta?.pdfBuffer) {
      return res.status(400).json({
        success: false,
        error: "Agreement has no PDF to upload"
      });
    }

    // Get existing mapping
    const mapping = await ZohoMapping.findByAgreementId(agreementId);
    if (!mapping) {
      return res.status(400).json({
        success: false,
        error: "No existing Zoho mapping found. Use first-time upload instead."
      });
    }

    const nextVersion = mapping.getNextVersion();
    const dealId = mapping.zohoDeal.id;
    const dealName = mapping.zohoDeal.name;

    console.log(`📝 Adding version ${nextVersion} to existing deal: ${dealId}`);

    // Step 1: Create the note
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

    const note = noteResult.note;
    console.log(`✅ Note created: ${note.id}`);

    // Step 2: Upload the updated PDF
    const pdfBuffer = Buffer.from(agreement.pdf_meta.pdfBuffer, 'base64');
    const fileName = `${dealName.replace(/[^a-zA-Z0-9-_]/g, '_')}_v${nextVersion}.pdf`;

    console.log(`📎 Retrieved updated PDF from MongoDB: ${pdfBuffer.length} bytes (converted from base64: ${agreement.pdf_meta.pdfBuffer.length} chars)`);

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

    // Step 3: Update mapping in MongoDB
    mapping.addUpload({
      zohoNoteId: note.id,
      zohoFileId: file.id,
      noteText: noteText.trim(),
      fileName: fileName,
      uploadedBy: 'system' // TODO: Add user context
    });

    await mapping.save();

    console.log(`✅ Update upload completed successfully!`);
    console.log(`  ├ Deal: ${dealName} (${dealId})`);
    console.log(`  ├ Note: ${note.id}`);
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
 * GET /zoho-upload/pipeline-options
 * Get available pipeline and stage options from Zoho Bigin
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
          { label: 'Sales Pipeline', value: 'Sales Pipeline' }
        ],
        stages: result.stages || [
          { label: 'Proposal', value: 'Proposal' },
          { label: 'Negotiation', value: 'Negotiation' },
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
        { label: 'Sales Pipeline', value: 'Sales Pipeline' }
      ],
      stages: [
        { label: 'Proposal', value: 'Proposal' },
        { label: 'Negotiation', value: 'Negotiation' },
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

export default router;