// src/routes/versionRoutes.js
import { Router } from "express";
import {
  getAllVersionPdfs,
  getVersionPdfById,
  updateVersionStatus,
  downloadVersionPdf,
  deleteVersionPdf
} from "../controllers/versionController.js";

const router = Router();

// GET /api/versions - Get all version PDFs with pagination and filtering
router.get("/", getAllVersionPdfs);

// GET /api/versions/:id - Get specific version PDF by ID
router.get("/:id", getVersionPdfById);

// PATCH /api/versions/:id/status - Update version PDF status
router.patch("/:id/status", updateVersionStatus);

// GET /api/versions/:id/download - Download version PDF
router.get("/:id/download", downloadVersionPdf);

// DELETE /api/versions/:id - Soft delete version PDF
router.delete("/:id", deleteVersionPdf);

export default router;