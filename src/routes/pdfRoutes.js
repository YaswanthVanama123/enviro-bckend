// src/routes/pdfRoutes.js
import { Router } from "express";
import multer from "multer";
import {
  pdfHealth,
  compileFromRaw,
  compileFromProposalFile,
  compileCustomerHeaderPdf,
  compileAndStoreCustomerHeader,
  getCustomerHeaders,
  getCustomerHeaderById,
  updateCustomerHeader,
  compileAndStoreAdminHeader,
  getAdminHeaders,
  getAdminHeaderById,
  updateAdminHeader,
  proxyCompileFile,
  proxyCompileBundle,
  getCustomerHeadersHighLevel,
  getCustomerHeaderViewerById,
  downloadCustomerHeaderPdf
} from "../controllers/pdfController.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

/* ---- health ---- */
router.get("/health", pdfHealth);

/* ---- basic compile ---- */
router.post("/compile", compileFromRaw);
router.post("/proposal", compileFromProposalFile);

/* ---- customer header (DB) ---- */
router.post("/customer-header", compileAndStoreCustomerHeader);
router.get("/customer-headers", getCustomerHeaders);
router.get("/customer-headers/:id", getCustomerHeaderById);
router.put("/customer-headers/:id", updateCustomerHeader);

/* ---- admin header (DB) ---- */
router.post("/admin-header", compileAndStoreAdminHeader);
router.get("/admin-headers", getAdminHeaders);
router.get("/admin-headers/:id", getAdminHeaderById);
router.put("/admin-headers/:id", updateAdminHeader);

/* ---- viewer APIs ---- */
router.get("/viewer/getall/highlevel", getCustomerHeadersHighLevel);
router.get("/viewer/getbyid/:id", getCustomerHeaderViewerById);
router.get("/viewer/download/:id", downloadCustomerHeaderPdf)

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
