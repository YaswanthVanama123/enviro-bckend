// src/routes/versionRoutes.js
import { Router } from "express";
import {
  getAllVersionPdfs,
  getVersionPdfById,
  updateVersionStatus,
  downloadVersionPdf,
  deleteVersionPdf,
  // ✅ NEW: Version management functions
  checkVersionStatus,
  createVersion,
  replaceMainPdf,
  getVersionsList,
  getVersionForEdit,
  viewVersionPdf
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

// ✅ NEW: Version management routes (agreement-based)
// GET /api/versions/:agreementId/check-status - Check version status for an agreement
router.get("/:agreementId/check-status", checkVersionStatus);

// POST /api/versions/:agreementId/create-version - Create a new version
router.post("/:agreementId/create-version", createVersion);

// POST /api/versions/:agreementId/replace-main - Replace main PDF
router.post("/:agreementId/replace-main", replaceMainPdf);

// GET /api/versions/:agreementId/list - Get all versions for an agreement
router.get("/:agreementId/list", getVersionsList);

// ✅ NEW: Individual version operations
// GET /api/versions/version/:versionId/view - View version PDF in browser
router.get("/version/:versionId/view", viewVersionPdf);

// GET /api/versions/version/:versionId/download - Download version PDF by version ID
router.get("/version/:versionId/download", (req, res, next) => {
  req.params.id = req.params.versionId;
  downloadVersionPdf(req, res, next);
});

// DELETE /api/versions/version/:versionId - Delete version PDF by version ID
router.delete("/version/:versionId", (req, res, next) => {
  req.params.id = req.params.versionId;
  deleteVersionPdf(req, res, next);
});

// GET /api/versions/version/:versionId/edit-format - Get version for editing
router.get("/version/:versionId/edit-format", getVersionForEdit);

export default router;