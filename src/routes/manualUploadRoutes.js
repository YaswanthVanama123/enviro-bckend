// src/routes/manualUploadRoutes.js
import express from "express";
import multer from "multer";
import {
  uploadManualPdf,
  getManualUploads,
  getManualUploadById,
  downloadManualUpload,
  updateManualUploadStatus,
  deleteManualUpload,
} from "../controllers/manualUploadController.js";

const router = express.Router();

// Configure multer for file upload (store in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
});

// POST /api/manual-upload - Upload a PDF
router.post("/", upload.single("file"), uploadManualPdf);

// GET /api/manual-upload - Get all uploads
router.get("/", getManualUploads);

// GET /api/manual-upload/:id - Get single upload
router.get("/:id", getManualUploadById);

// GET /api/manual-upload/:id/download - Download PDF
router.get("/:id/download", downloadManualUpload);

// PATCH /api/manual-upload/:id/status - Update status
router.patch("/:id/status", updateManualUploadStatus);

// DELETE /api/manual-upload/:id - Delete upload
router.delete("/:id", deleteManualUpload);

export default router;
