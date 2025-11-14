import { Router } from "express";
import { pdfHealth, compileFromRaw, compileFromProposalFile } from "../controllers/pdfController.js";

const router = Router();

router.get("/health", pdfHealth);

// compile EXACT raw TeX sent in body
router.post("/compile", compileFromRaw);

// compile templates/proposal.tex AS-IS (no templating)
router.post("/proposal", compileFromProposalFile);

export default router;
