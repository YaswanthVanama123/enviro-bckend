// src/routes/pdfRoutes.js
import { Router } from "express";
import multer from "multer";
import {
  pdfHealth,
  compileFromRaw,
  compileFromProposalFile,
  compileCustomerHeaderPdf,
  compileAndStoreCustomerHeader,
  proxyCompileFile,
  proxyCompileBundle,
  getAllCustomerHeaders,
  getCustomerHeaderById,
  updateCustomerHeaderById,
} from "../controllers/pdfController.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

/* ---- Health ---- */
router.get("/health", pdfHealth);

/* ---- Existing compile APIs ---- */
router.post("/compile", compileFromRaw);
router.post("/proposal", compileFromProposalFile);

/* ---- Customer Header flows ---- */

// 1) “Just compile, no DB” (optional)
router.post("/customer-header/preview", compileCustomerHeaderPdf);

// 2) Create + store in Mongo + return PDF
router.post("/customer-header", compileAndStoreCustomerHeader);

// 3) NEW: Get all stored docs
router.get("/customer-headers", getAllCustomerHeaders);

// 4) NEW: Get single stored doc by id
router.get("/customer-headers/:id", getCustomerHeaderById);

// 5) NEW: Update JSON + recompile + update DB
router.put("/customer-headers/:id", updateCustomerHeaderById);

/* ---- Pass-through file APIs (optional) ---- */

router.post(
  "/compile-file",
  upload.single("file"),
  proxyCompileFile
);

router.post(
  "/compile-bundle",
  upload.fields([
    { name: "main", maxCount: 1 },
    { name: "assets", maxCount: 63 },
  ]),
  proxyCompileBundle
);

export default router;
