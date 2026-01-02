// src/routes/pdfRoutes.js
import { Router } from "express";
import multer from "multer";
import {
  pdfHealth,
  testZohoAccessEndpoint,
  runZohoDiagnosticsEndpoint,
  testV10CompatibilityEndpoint,
  testV9SimplePipelineEndpoint,
  testV7LayoutPipelineEndpoint,
  compileFromRaw,
  compileFromProposalFile,
  compileCustomerHeaderPdf,
  compileAndStoreCustomerHeader,
  getCustomerHeaders,
  getCustomerHeaderById,
  getCustomerHeaderForEdit,
  updateCustomerHeader,
  updateCustomerHeaderStatus,
  compileAndStoreAdminHeader,
  getAdminHeaders,
  getAdminHeaderById,
  updateAdminHeader,
  proxyCompileFile,
  proxyCompileBundle,
  getCustomerHeadersHighLevel,
  getCustomerHeaderViewerById,
  downloadCustomerHeaderPdf,
  getSavedFilesList,
  getSavedFilesGrouped,
  getSavedFileDetails,
  addFileToAgreement,
  downloadAttachedFile,
  // ✅ NEW: Delete and restore functions
  restoreAgreement,
  restoreFile,
  deleteAgreement,
  deleteFile,
  permanentlyDeleteAgreement,
  permanentlyDeleteFile,
  // ✅ NEW: Price override logging functions
  logPriceOverride,
  getPriceOverrideLogs,
  getPriceOverrideStats,
  reviewPriceOverride,
  getPendingPriceOverrides,
  // ✅ NEW: Version-based change logging functions
  logVersionChanges,
  getVersionChangeLogs,
  getVersionChangeLog,
  reviewVersionChanges,
  getPendingVersionChanges,
  // ✅ NEW: Approval documents grouped API
  getApprovalDocumentsGrouped,
  // ✅ NEW: Debug endpoint
  debugGetAllFiles,
  // ✅ NEW: Trash workflow verification endpoint
  verifyTrashWorkflow,
  // ✅ NEW: Optimized count API for Home page bar graph
  getDocumentStatusCounts
} from "../controllers/pdfController.js";

// ✅ NEW: Version log controller (MongoDB-based log files)
import {
  createVersionLog,
  getVersionLogs,
  getAllVersionLogs,
  downloadVersionLog
} from "../controllers/logController.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

/* ---- health ---- */
router.get("/health", pdfHealth);
router.get("/test-zoho-access", testZohoAccessEndpoint);
router.get("/zoho-diagnostics", runZohoDiagnosticsEndpoint);
router.get("/test-v10-compatibility", testV10CompatibilityEndpoint);
router.get("/test-v9-simple-pipeline", testV9SimplePipelineEndpoint);
router.get("/test-v7-layout-pipeline", testV7LayoutPipelineEndpoint);

/* ---- ✅ NEW: debug endpoint ---- */
router.get("/debug/all-files", debugGetAllFiles);
router.get("/debug/verify-trash-workflow", verifyTrashWorkflow);  // ✅ NEW: Comprehensive trash verification

/* ---- basic compile ---- */
router.post("/compile", compileFromRaw);
router.post("/proposal", compileFromProposalFile);

/* ---- customer header (DB) ---- */
router.post("/customer-header-preview", compileCustomerHeaderPdf);
router.post("/customer-header", compileAndStoreCustomerHeader);
router.get("/customer-headers", getCustomerHeaders);
router.get("/customer-headers/:id", getCustomerHeaderById);
router.get("/customer-headers/:id/edit-format", getCustomerHeaderForEdit); // ← NEW: Edit-optimized format
router.put("/customer-headers/:id", updateCustomerHeader);
router.patch("/customer-headers/:id/status", updateCustomerHeaderStatus);

/* ---- admin header (DB) ---- */
router.post("/admin-header", compileAndStoreAdminHeader);
router.get("/admin-headers", getAdminHeaders);
router.get("/admin-headers/:id", getAdminHeaderById);
router.put("/admin-headers/:id", updateAdminHeader);

/* ---- viewer APIs ---- */
router.get("/viewer/getall/highlevel", getCustomerHeadersHighLevel);
router.get("/viewer/getbyid/:id", getCustomerHeaderViewerById);
router.get("/viewer/download/:id", downloadCustomerHeaderPdf)

/* ---- NEW: saved-files API (lazy loading) ---- */
router.get("/saved-files", getSavedFilesList); // Lightweight list with pagination
router.get("/saved-files/grouped", getSavedFilesGrouped); // Grouped by agreement (folder-like)
router.get("/saved-files/:id/details", getSavedFileDetails); // Full payload on-demand
router.post("/saved-files/:agreementId/add-files", addFileToAgreement); // ✅ NEW: Add files to agreement
router.get("/attached-files/:fileId/download", downloadAttachedFile); // ✅ NEW: Download attached files

/* ---- NEW: optimized count API for Home page bar graph ---- */
router.get("/document-status-counts", getDocumentStatusCounts); // ✅ NEW: Get document counts by status (optimized)

/* ---- NEW: approval documents API ---- */
router.get("/approval-documents/grouped", getApprovalDocumentsGrouped); // ✅ NEW: Get all approval documents grouped by agreement

/* ---- NEW: delete and restore API ---- */
router.patch("/agreements/:agreementId/restore", restoreAgreement); // Restore agreement from trash
router.patch("/files/:fileId/restore", restoreFile); // Restore file from trash
router.patch("/agreements/:agreementId/delete", deleteAgreement); // Soft delete agreement (move to trash)
router.patch("/files/:fileId/delete", deleteFile); // Soft delete file (move to trash)
router.delete("/agreements/:agreementId/permanent-delete", permanentlyDeleteAgreement); // Permanent delete agreement with cascade
router.delete("/files/:fileId/permanent-delete", permanentlyDeleteFile); // Permanent delete file with cleanup

/* ---- NEW: price override logging API ---- */
router.post("/price-overrides/log", logPriceOverride); // Log a price override
router.get("/price-overrides/logs/:agreementId", getPriceOverrideLogs); // Get logs for an agreement
router.get("/price-overrides/stats/:agreementId", getPriceOverrideStats); // Get override statistics for an agreement
router.patch("/price-overrides/:logId/review", reviewPriceOverride); // Review/approve a price override
router.get("/price-overrides/pending", getPendingPriceOverrides); // Get all pending overrides (admin view)

/* ---- NEW: version-based change logging API ---- */
router.post("/version-changes/log", logVersionChanges); // Log all changes for a version (batch)
router.get("/version-changes/logs/:agreementId", getVersionChangeLogs); // Get all version change logs for an agreement
router.get("/version-changes/log/:versionId", getVersionChangeLog); // Get specific version change log
router.patch("/version-changes/:logId/review", reviewVersionChanges); // Review/approve a version's changes
router.get("/version-changes/pending", getPendingVersionChanges); // Get all pending version changes (admin view)

/* ---- NEW: version log files API (MongoDB-based TXT log files) ---- */
router.post("/logs/create", createVersionLog); // Create a version log file and store in MongoDB
router.get("/logs/agreement/:agreementId", getVersionLogs); // Get all log files for an agreement
router.get("/logs/all", getAllVersionLogs); // Get all log files with pagination (admin)
router.get("/logs/:logId/download", downloadVersionLog); // Download a log file as TXT

/* ---- pass-through (files uploaded to your backend) ---- */
router.post("/compile-file", upload.single("file"), proxyCompileFile);
router.post(
  "/compile-bundle",
  upload.fields([
    { name: "main", maxCount: 1 },
    { name: "assets", maxCount: 63 },
  ]),
  proxyCompileBundle
);

export default router;
