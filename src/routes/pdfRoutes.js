import { Router } from "express";
import { pdfHealth, compileFromRaw, compileFromProposalFile } from "../controllers/pdfController.js";

const router = Router();

router.get("/health", pdfHealth);
router.post("/compile", compileFromRaw);     // expects { template: "<raw TeX>" }
router.post("/proposal", compileFromProposalFile); // compiles proposal.tex AS-IS

export default router;
