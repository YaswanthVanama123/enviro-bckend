import { getPdfHealth, compileRawTex, compileProposalTemplate } from "../services/pdfService.js";

export async function pdfHealth(req, res) {
  try {
    const info = await getPdfHealth();
    res.json(info);
  } catch (err) {
    console.error("pdfHealth error:", err);
    res.status(500).json({ error: "Health check failed" });
  }
}

// POST /api/pdf/compile  { "template": "<raw TeX here>" }
export async function compileFromRaw(req, res) {
  try {
    const tpl = req.body?.template;
    const { buffer, filename } = await compileRawTex(tpl);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    const status = err?.status || 500;
    res.status(status).json({
      error: "LaTeX compilation failed",
      detail: err?.detail || String(err?.message || err),
    });
  }
}

// POST /api/pdf/proposal  (reads templates/proposal.tex and compiles it as-is)
export async function compileFromProposalFile(_req, res) {
  try {
    const { buffer, filename } = await compileProposalTemplate();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({
      error: "LaTeX compilation failed",
      detail: err?.detail || String(err?.message || err),
    });
  }
}
