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
  downloadAttachedFile
} from "../controllers/pdfController.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

/* ---- health ---- */
router.get("/health", pdfHealth);
router.get("/test-zoho-access", testZohoAccessEndpoint);
router.get("/zoho-diagnostics", runZohoDiagnosticsEndpoint);
router.get("/test-v10-compatibility", testV10CompatibilityEndpoint);
router.get("/test-v9-simple-pipeline", testV9SimplePipelineEndpoint);
router.get("/test-v7-layout-pipeline", testV7LayoutPipelineEndpoint);

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
