import { Router } from "express";
import { pdfHealth, compileFromRaw, compileFromProposalFile } from "../controllers/pdfController.js";

const router = Router();

router.get("/health", pdfHealth);
router.post("/compile", compileFromRaw);
router.post("/proposal", compileFromProposalFile);

export default router;
