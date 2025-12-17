// src/controllers/manualUploadController.js
import ManualUploadDocument from "../models/ManualUploadDocument.js";
import { uploadToZohoBigin, uploadToZohoCRM } from "../services/zohoService.js";

// POST /api/manual-upload - Upload a PDF manually
export async function uploadManualPdf(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { description, uploadedBy } = req.body;

    // Create document record
    const doc = new ManualUploadDocument({
      fileName: req.file.originalname,
      originalFileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      description: description || "",
      uploadedBy: uploadedBy || "admin",
      pdfBuffer: req.file.buffer,
      status: "uploaded",
    });

    await doc.save();

    // Upload to Zoho in background
    uploadToZohoServices(doc._id.toString());

    res.status(201).json({
      success: true,
      message: "File uploaded successfully",
      document: {
        id: doc._id,
        fileName: doc.fileName,
        fileSize: doc.fileSize,
        uploadedBy: doc.uploadedBy,
        createdAt: doc.createdAt,
      },
    });
  } catch (err) {
    console.error("Error uploading manual PDF:", err);
    res.status(500).json({
      error: "Failed to upload file",
      detail: String(err),
    });
  }
}

// Background function to upload to Zoho
async function uploadToZohoServices(docId) {
  try {
    const doc = await ManualUploadDocument.findById(docId);
    if (!doc) return;

    doc.status = "processing";
    await doc.save();

    // Upload to Zoho Bigin
    try {
      const biginResult = await uploadToZohoBigin(
        doc.pdfBuffer,
        doc.fileName,
        null // No deal ID for manual uploads
      );
      doc.zoho.bigin = {
        dealId: null,
        fileId: biginResult?.fileId || null,
        url: biginResult?.url || null,
      };
    } catch (biginErr) {
      console.error("Zoho Bigin upload failed:", biginErr);
    }

    // Upload to Zoho CRM
    try {
      const crmResult = await uploadToZohoCRM(
        doc.pdfBuffer,
        doc.fileName,
        null // No deal ID for manual uploads
      );
      doc.zoho.crm = {
        dealId: null,
        fileId: crmResult?.fileId || null,
        url: crmResult?.url || null,
      };
    } catch (crmErr) {
      console.error("Zoho CRM upload failed:", crmErr);
    }

    doc.status = "completed";
    await doc.save();

    console.log(`Manual upload ${docId} uploaded to Zoho successfully`);
  } catch (err) {
    console.error("Error in Zoho upload:", err);
    try {
      const doc = await ManualUploadDocument.findById(docId);
      if (doc) {
        doc.status = "failed";
        await doc.save();
      }
    } catch (updateErr) {
      console.error("Failed to update status:", updateErr);
    }
  }
}

// GET /api/manual-upload - Get all manual uploads
export async function getManualUploads(req, res) {
  try {
    const { limit = 50, skip = 0, status } = req.query;

    const query = {};
    if (status) {
      query.status = status;
    }

    const documents = await ManualUploadDocument.find(query)
      .select("-pdfBuffer") // Don't send buffer in list
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await ManualUploadDocument.countDocuments(query);

    res.json({
      success: true,
      items: documents,
      total,
      limit: parseInt(limit),
      skip: parseInt(skip),
    });
  } catch (err) {
    console.error("Error fetching manual uploads:", err);
    res.status(500).json({
      error: "Failed to fetch uploads",
      detail: String(err),
    });
  }
}

// GET /api/manual-upload/:id - Get single upload
export async function getManualUploadById(req, res) {
  try {
    const { id } = req.params;

    const doc = await ManualUploadDocument.findById(id).select("-pdfBuffer");

    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }

    res.json({
      success: true,
      document: doc,
    });
  } catch (err) {
    console.error("Error fetching manual upload:", err);
    res.status(500).json({
      error: "Failed to fetch upload",
      detail: String(err),
    });
  }
}

// GET /api/manual-upload/:id/download - Download PDF
export async function downloadManualUpload(req, res) {
  try {
    const { id } = req.params;

    const doc = await ManualUploadDocument.findById(id);

    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }

    res.setHeader("Content-Type", doc.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${doc.fileName}"`
    );
    res.send(doc.pdfBuffer);
  } catch (err) {
    console.error("Error downloading manual upload:", err);
    res.status(500).json({
      error: "Failed to download file",
      detail: String(err),
    });
  }
}

// PATCH /api/manual-upload/:id/status - Update manual upload status
export async function updateManualUploadStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    console.log(`🔄 [MANUAL-UPLOAD-STATUS] Updating manual upload ${id} status to: ${status}`);

    // Validate status
    const validStatuses = ["uploaded", "processing", "completed", "failed", "pending_approval", "approved_salesman", "approved_admin"];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: "bad_request",
        detail: `Invalid status. Must be one of: ${validStatuses.join(", ")}`
      });
    }

    // Find and update manual upload
    const doc = await ManualUploadDocument.findById(id);
    if (!doc) {
      console.log(`❌ [MANUAL-UPLOAD-STATUS] Manual upload not found: ${id}`);
      return res.status(404).json({
        success: false,
        error: "Manual upload not found"
      });
    }

    // Update status
    const oldStatus = doc.status;
    doc.status = status;
    await doc.save();

    console.log(`✅ [MANUAL-UPLOAD-STATUS] Updated manual upload ${doc.fileName} status from ${oldStatus} to ${status}`);

    res.json({
      success: true,
      message: `Manual upload status updated to ${status}`,
      data: {
        id: doc._id,
        fileName: doc.fileName,
        status: doc.status,
        previousStatus: oldStatus,
        updatedAt: doc.updatedAt
      }
    });

  } catch (error) {
    console.error("❌ [MANUAL-UPLOAD-STATUS] Failed to update manual upload status:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// DELETE /api/manual-upload/:id - Delete upload
export async function deleteManualUpload(req, res) {
  try {
    const { id } = req.params;

    const doc = await ManualUploadDocument.findByIdAndDelete(id);

    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }

    res.json({
      success: true,
      message: "Document deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting manual upload:", err);
    res.status(500).json({
      error: "Failed to delete document",
      detail: String(err),
    });
  }
}
