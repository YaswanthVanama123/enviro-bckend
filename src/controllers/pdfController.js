// src/controllers/pdfController.js
import { getPdfHealth, compileRawTex, compileProposalTemplate } from "../services/pdfService.js";

export async function pdfHealth(_req, res) {
  const info = await getPdfHealth();
  res.json(info);
}

export async function compileFromRaw(req, res) {
  try {
    const tpl = req.body?.template;
    const { buffer, filename } = await compileRawTex(tpl);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(err?.status || 500).json({ error: "LaTeX compilation failed", detail: err?.detail || String(err) });
  }
}

export async function compileFromProposalFile(_req, res) {
  try {
    const { buffer, filename } = await compileProposalTemplate();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: "LaTeX compilation failed", detail: err?.detail || String(err) });
  }
}
