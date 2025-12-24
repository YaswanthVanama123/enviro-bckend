// src/controllers/logController.js
// ✅ SIMPLIFIED: Log controller for version change logs (MongoDB-based)
import Log from '../models/Log.js';
import CustomerHeaderDoc from '../models/CustomerHeaderDoc.js';
import VersionPdf from '../models/VersionPdf.js';
import mongoose from 'mongoose';

/**
 * POST /api/pdf/logs/create
 * Creates a log document in Logs collection
 */
export const createVersionLog = async (req, res) => {
  try {
    const {
      agreementId,
      versionId,
      versionNumber,
      salespersonId,
      salespersonName,
      saveAction,
      documentTitle,
      changes,
      overwriteExisting,
      overwriteReason
    } = req.body;

    console.log('📝 [LOG-CONTROLLER] Creating log:', {
      agreementId,
      versionId,
      versionNumber,
      changesCount: changes?.length || 0,
      saveAction,
      overwriteExisting
    });

    // ✅ FIXED: If versionNumber is missing but versionId is provided, look it up
    let resolvedVersionNumber = versionNumber;

    if (!resolvedVersionNumber && versionId) {
      console.log(`🔍 [LOG-CONTROLLER] Version number not provided, looking up from versionId: ${versionId}`);

      try {
        const versionPdf = await VersionPdf.findById(versionId).select('versionNumber').lean();
        if (versionPdf && versionPdf.versionNumber) {
          resolvedVersionNumber = versionPdf.versionNumber;
          console.log(`✅ [LOG-CONTROLLER] Found version number: ${resolvedVersionNumber}`);
        } else {
          console.log(`⚠️ [LOG-CONTROLLER] Version PDF not found, defaulting to version 1`);
          resolvedVersionNumber = 1;
        }
      } catch (err) {
        console.error(`❌ [LOG-CONTROLLER] Error looking up version number:`, err);
        resolvedVersionNumber = 1; // Default fallback
      }
    }

    // Validate required fields
    if (!agreementId || !versionId || !resolvedVersionNumber || !salespersonId || !salespersonName || !saveAction || !documentTitle) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
        required: ['agreementId', 'versionId', 'versionNumber', 'salespersonId', 'salespersonName', 'saveAction', 'documentTitle']
      });
    }

    // ✅ NEW: Fetch agreement title from CustomerHeaderDoc (before overwrite check)
    let agreementTitle = '';
    try {
      const agreement = await CustomerHeaderDoc.findById(agreementId).select('payload.headerTitle').lean();
      if (agreement && agreement.payload && agreement.payload.headerTitle) {
        agreementTitle = agreement.payload.headerTitle;
        console.log(`✅ [LOG-CONTROLLER] Found agreement title: ${agreementTitle}`);
      } else {
        console.log(`⚠️ [LOG-CONTROLLER] No agreement title found, using document title`);
        agreementTitle = documentTitle; // Fallback to document title
      }
    } catch (err) {
      console.error(`❌ [LOG-CONTROLLER] Error fetching agreement title:`, err);
      agreementTitle = documentTitle; // Fallback to document title
    }

    // Check if log already exists for this version
    if (overwriteExisting) {
      console.log(`🔄 [LOG-CONTROLLER] Overwrite mode enabled - reason: ${overwriteReason}`);

      const existingLog = await Log.findOne({ versionId: new mongoose.Types.ObjectId(versionId), isDeleted: { $ne: true } });

      if (existingLog) {
        console.log(`📝 [LOG-CONTROLLER] Found existing log, updating: ${existingLog._id}`);

        // Update existing log
        existingLog.changes = changes || [];
        existingLog.agreementTitle = agreementTitle; // ✅ NEW: Update agreement title
        existingLog.salespersonId = salespersonId;
        existingLog.salespersonName = salespersonName;
        existingLog.saveAction = saveAction;
        existingLog.documentTitle = documentTitle;

        await existingLog.save();

        return res.status(200).json({
          success: true,
          message: 'Version log updated successfully',
          log: {
            logId: existingLog._id.toString(),
            fileName: existingLog.fileName,
            agreementId: existingLog.agreementId.toString(),
            versionId: existingLog.versionId.toString(),
            versionNumber: existingLog.versionNumber,
            totalChanges: existingLog.totalChanges,
            totalPriceImpact: existingLog.totalPriceImpact,
            hasSignificantChanges: existingLog.hasSignificantChanges,
            saveAction: existingLog.saveAction,
            createdAt: existingLog.createdAt,
            updatedAt: existingLog.updatedAt
          }
        });
      }
    }

    // Create new log document
    const logDoc = new Log({
      agreementId: new mongoose.Types.ObjectId(agreementId),
      agreementTitle, // ✅ NEW: Include agreement/customer name
      versionId: new mongoose.Types.ObjectId(versionId),
      versionNumber: resolvedVersionNumber, // ✅ FIXED: Use resolved version number
      salespersonId,
      salespersonName,
      saveAction,
      documentTitle,
      changes: changes || []
    });

    // Save to MongoDB
    await logDoc.save();

    console.log('✅ [LOG-CONTROLLER] Log created successfully:', logDoc._id);

    // Return response
    res.status(201).json({
      success: true,
      message: 'Version log created successfully',
      log: {
        logId: logDoc._id.toString(),
        fileName: logDoc.fileName,
        agreementId: logDoc.agreementId.toString(),
        versionId: logDoc.versionId.toString(),
        versionNumber: logDoc.versionNumber,
        totalChanges: logDoc.totalChanges,
        totalPriceImpact: logDoc.totalPriceImpact,
        hasSignificantChanges: logDoc.hasSignificantChanges,
        saveAction: logDoc.saveAction,
        createdAt: logDoc.createdAt
      }
    });

  } catch (error) {
    console.error('❌ [LOG-CONTROLLER] Error creating log:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create version log',
      error: error.message
    });
  }
};

/**
 * GET /api/pdf/logs/agreement/:agreementId
 * Gets all logs for an agreement
 */
export const getVersionLogs = async (req, res) => {
  try {
    const { agreementId } = req.params;

    console.log('📋 [LOG-CONTROLLER] Getting logs for agreement:', agreementId);

    // Validate agreement ID
    if (!mongoose.Types.ObjectId.isValid(agreementId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid agreement ID'
      });
    }

    // Get agreement details
    const agreement = await CustomerHeaderDoc.findById(agreementId).select('payload.headerTitle').lean();

    if (!agreement) {
      return res.status(404).json({
        success: false,
        message: 'Agreement not found'
      });
    }

    // Get all logs for this agreement
    const logs = await Log.find({
      agreementId: new mongoose.Types.ObjectId(agreementId),
      isDeleted: { $ne: true }
    })
      .sort({ versionNumber: -1, createdAt: -1 })
      .lean();

    console.log(`✅ [LOG-CONTROLLER] Found ${logs.length} logs for agreement ${agreementId}`);

    // Map logs to response format
    const logDocuments = logs.map(log => ({
      _id: log._id.toString(),
      fileName: log.fileName,
      fileSize: log.fileSize,
      contentType: log.contentType,
      agreementId: log.agreementId.toString(),
      versionId: log.versionId.toString(),
      versionNumber: log.versionNumber,
      salespersonId: log.salespersonId,
      salespersonName: log.salespersonName,
      saveAction: log.saveAction,
      totalChanges: log.totalChanges,
      totalPriceImpact: log.totalPriceImpact,
      hasSignificantChanges: log.hasSignificantChanges,
      createdAt: log.createdAt,
      updatedAt: log.updatedAt
    }));

    res.status(200).json({
      success: true,
      agreement: {
        id: agreementId,
        title: agreement.payload?.headerTitle || 'Untitled Document'
      },
      logs: logDocuments
    });

  } catch (error) {
    console.error('❌ [LOG-CONTROLLER] Error getting logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get version logs',
      error: error.message
    });
  }
};

/**
 * GET /api/pdf/logs/all
 * Gets all logs with pagination (for admin/testing)
 */
export const getAllVersionLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const agreementId = req.query.agreementId;

    console.log('📋 [LOG-CONTROLLER] Getting all logs:', { page, limit, agreementId });

    const filter = { isDeleted: { $ne: true } };

    if (agreementId && mongoose.Types.ObjectId.isValid(agreementId)) {
      filter.agreementId = new mongoose.Types.ObjectId(agreementId);
    }

    const totalLogs = await Log.countDocuments(filter);
    const logs = await Log.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    console.log(`✅ [LOG-CONTROLLER] Found ${logs.length} logs (page ${page}/${Math.ceil(totalLogs / limit)})`);

    // Map logs to response format
    const logDocuments = logs.map(log => ({
      _id: log._id.toString(),
      fileName: log.fileName,
      fileSize: log.fileSize,
      agreementId: log.agreementId.toString(),
      agreementTitle: log.agreementTitle || log.documentTitle,
      versionId: log.versionId.toString(),
      versionNumber: log.versionNumber,
      salespersonId: log.salespersonId,
      salespersonName: log.salespersonName,
      saveAction: log.saveAction,
      totalChanges: log.totalChanges,
      totalPriceImpact: log.totalPriceImpact,
      hasSignificantChanges: log.hasSignificantChanges,
      createdAt: log.createdAt,
      updatedAt: log.updatedAt
    }));

    res.status(200).json({
      success: true,
      pagination: {
        totalLogs,
        currentPage: page,
        totalPages: Math.ceil(totalLogs / limit),
        limit
      },
      logs: logDocuments
    });

  } catch (error) {
    console.error('❌ [LOG-CONTROLLER] Error getting all logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get all version logs',
      error: error.message
    });
  }
};

/**
 * GET /api/pdf/logs/:logId/download
 * Downloads a log file as TXT
 */
export const downloadVersionLog = async (req, res) => {
  try {
    const { logId } = req.params;

    console.log('📥 [LOG-CONTROLLER] Downloading log:', logId);

    // Validate log ID
    if (!mongoose.Types.ObjectId.isValid(logId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid log ID'
      });
    }

    // Get log document
    const logDoc = await Log.findOne({
      _id: new mongoose.Types.ObjectId(logId),
      isDeleted: { $ne: true }
    });

    if (!logDoc) {
      return res.status(404).json({
        success: false,
        message: 'Log file not found'
      });
    }

    // Generate TXT content
    const textContent = logDoc.generateTextContent();

    console.log(`✅ [LOG-CONTROLLER] Generated TXT content (${Buffer.byteLength(textContent, 'utf8')} bytes)`);

    // Set response headers for file download
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${logDoc.fileName}"`);
    res.setHeader('Content-Length', Buffer.byteLength(textContent, 'utf8'));

    // Send TXT content
    res.status(200).send(textContent);

  } catch (error) {
    console.error('❌ [LOG-CONTROLLER] Error downloading log:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download log file',
      error: error.message
    });
  }
};
