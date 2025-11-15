// src/services/pdfService.js
import fs from "fs/promises";
import path from "path";
import Mustache from "mustache";
import {
  PDF_REMOTE_BASE,
  PDF_REMOTE_TIMEOUT_MS,
  PDF_TEMPLATE_PATH,
  PDF_HEADER_TEMPLATE_PATH,
} from "../config/pdfConfig.js";

/* ---------------- HTTP helpers ---------------- */
async function remotePostPdf(
  pathname,
  body = {},
  { timeoutMs = PDF_REMOTE_TIMEOUT_MS } = {}
) {
  const url = `${PDF_REMOTE_BASE.replace(/\/+$/, "")}/${pathname.replace(/^\/+/, "")}`;
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/pdf" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      const err = new Error(`Remote compile failed (${resp.status})`);
      err.detail = txt;
      throw err;
    }
    const ab = await resp.arrayBuffer();
    return Buffer.from(ab);
  } finally {
    clearTimeout(to);
  }
}

async function remotePostMultipart(
  pathname,
  files,
  extraFields = {},
  { timeoutMs = PDF_REMOTE_TIMEOUT_MS } = {}
) {
  const url = `${PDF_REMOTE_BASE.replace(/\/+$/, "")}/${pathname.replace(/^\/+/, "")}`;
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const fd = new FormData();
    // simple fields (e.g., assetsManifest)
    for (const [k, v] of Object.entries(extraFields || {})) {
      fd.append(k, typeof v === "string" ? v : JSON.stringify(v));
    }
    // files
    for (const f of files) {
      const filename = String(f.name).replace(/\\/g, "/");
      fd.append(
        f.field,
        new Blob([f.data], { type: f.type || "application/octet-stream" }),
        filename
      );
    }
    const resp = await fetch(url, { method: "POST", body: fd, signal: controller.signal });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      const err = new Error(`Remote compile failed (${resp.status})`);
      err.detail = txt;
      throw err;
    }
    const ab = await resp.arrayBuffer();
    return Buffer.from(ab);
  } finally {
    clearTimeout(to);
  }
}

/* ---------------- LaTeX helpers ---------------- */
function latexEscape(value = "") {
  return String(value)
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([{}%&_#])/g, "\\$1")
    .replace(/\$/g, "\\$")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/~/g, "\\textasciitilde{}");
}

function buildProductsLatex(products = {}) {
  const headers = products.headers || [];
  const rows = products.rows || [];
  if (headers.length === 0 && rows.length === 0) {
    return { productsColSpecLatex: "Y", productsHeaderRowLatex: "", productsBodyRowsLatex: "" };
  }
  const colSpec = headers.length > 0 ? headers.map(() => "Y").join("|") : "Y";
  const headerRowLatex =
    headers.length > 0
      ? headers.map((h) => `\\textbf{${latexEscape(h)}}`).join(" & ") + " \\\\ \\hline\n"
      : "";
  const bodyRowsLatex = rows
    .map((r) => {
      const cells = Array.isArray(r) ? r : r.cells || [];
      const safe = cells.map((c) => latexEscape(c ?? "")).join(" & ");
      return safe + " \\\\ \\hline\n";
    })
    .join("");
  return {
    productsColSpecLatex: colSpec,
    productsHeaderRowLatex: headerRowLatex,
    productsBodyRowsLatex: bodyRowsLatex,
  };
}

function buildServiceRows(rows = []) {
  let out = "";
  for (const r of rows) {
    const type = r.type || "line";
    if (type === "line") {
      out += `\\serviceLine{${latexEscape(" " + (r.label || ""))}}{${latexEscape(r.value || "")}}\n`;
    } else if (type === "bold") {
      out += `\\serviceBoldLine{${latexEscape(" " + (r.label || ""))}}{${latexEscape(r.value || "")}}\n`;
    } else if (type === "atCharge") {
      out += `\\serviceAtCharge{${latexEscape(r.label || "")}}{${latexEscape(r.v1 || "")}}{${latexEscape(r.v2 || "")}}{${latexEscape(r.v3 || "")}}\n`;
    }
  }
  return out;
}

function buildServiceColumn(col = {}) {
  let latex = "";
  if (Array.isArray(col.sections) && col.sections.length > 0) {
    for (const sec of col.sections) {
      latex += `\\serviceSection{${latexEscape(sec.heading || "")}}\n`;
      latex += buildServiceRows(sec.rows || []);
      latex += "\\vspace{0.4em}\n";
    }
  } else {
    latex += `\\serviceSection{${latexEscape(col.heading || "")}}\n`;
    latex += buildServiceRows(col.rows || []);
  }
  return latex;
}

function buildServicesRow(cols = []) {
  if (!cols || !cols.length) return "";
  let rowLatex = "\\noindent\n";
  cols.forEach((col, idx) => {
    rowLatex += "\\begin{minipage}[t]{0.24\\textwidth}\n";
    rowLatex += buildServiceColumn(col);
    rowLatex += "\\end{minipage}%\n";
    if (idx !== cols.length - 1) rowLatex += "\\hfill\n";
  });
  rowLatex += "\n";
  return rowLatex;
}

function buildServicesLatex(services = {}) {
  const topRowCols = services.topRow || [];
  const bottomRowCols = services.bottomRow || services.secondRow || [];
  const servicesTopRowLatex = buildServicesRow(topRowCols);
  const servicesBottomRowLatex = buildServicesRow(bottomRowCols);

  let refreshSectionLatex = "";
  const sec = services.refreshPowerScrub;
  if (sec && Array.isArray(sec.columns) && sec.columns.length > 0) {
    const heading = latexEscape(sec.heading || "REFRESH POWER SCRUB");
    const cols = (sec.columns || []).slice(0, 6).map((c) => latexEscape(c || ""));
    const colCount = cols.length;
    const freqLabelsRaw = (sec.freqLabels || []).slice(0, colCount).map((l) => latexEscape(l || ""));
    const freqLabels = Array.from({ length: colCount }, (_, i) =>
      freqLabelsRaw[i] && freqLabelsRaw[i].trim() !== "" ? freqLabelsRaw[i] : "Freq"
    );
    if (colCount > 0) {
      const colSpec = "|" + Array(colCount).fill("Y").join("|") + "|";
      const labelRow = "  " + cols.map((h) => `\\scriptsize ${h} \\sblank`).join(" & ") + " \\\\";
      const freqRow = "  " + freqLabels.map((l) => `\\scriptsize ${l} \\sblank`).join(" & ") + " \\\\";
      refreshSectionLatex += "\\vspace{0.9em}\n";
      refreshSectionLatex += `\\serviceBigHeading{${heading}}\n\n`;
      refreshSectionLatex += "\\vspace{0.25em}\n";
      refreshSectionLatex += "\\noindent\n";
      refreshSectionLatex += `\\begin{tabularx}{\\textwidth}{${colSpec}}\n`;
      refreshSectionLatex += "  \\hline\n" + labelRow + "\n";
      refreshSectionLatex += "  \\hline\n" + freqRow + "\n";
      refreshSectionLatex += "  \\hline\n";
      refreshSectionLatex += "\\end{tabularx}\n";
    }
  }

  let serviceNotesLatex = "";
  if (services.notes) {
    const notes = services.notes;
    const textLines = Array.isArray(notes.textLines) ? notes.textLines : [];
    const lines = textLines.length || notes.lines || 3;
    serviceNotesLatex += "\\vspace{1.0em}\n";
    serviceNotesLatex += `\\serviceBigHeading{${latexEscape(notes.heading || "SERVICE NOTES")}}\n`;
    serviceNotesLatex += "\\vspace{0.35em}\n";
    for (let i = 0; i < lines; i++) {
      const content = textLines[i] ? latexEscape(textLines[i]) : "";
      serviceNotesLatex += `\\filledline{ ${content} }\\\\[0.6em]\n`;
    }
  }

  return { servicesTopRowLatex, servicesBottomRowLatex, refreshSectionLatex, serviceNotesLatex };
}

/* ---------------- Public API for controllers ---------------- */

export async function getPdfHealth() {
  try {
    const r = await fetch(`${PDF_REMOTE_BASE.replace(/\/+$/, "")}/health`);
    const j = await r.json();
    return { mode: "remote", ok: true, base: PDF_REMOTE_BASE, remote: j };
  } catch (e) {
    return { mode: "remote", ok: false, base: PDF_REMOTE_BASE, error: String(e) };
  }
}

// (A) raw TeX → DO compiler
export async function compileRawTex(texString) {
  if (!texString || typeof texString !== "string") {
    const err = new Error("Body must include a 'template' string.");
    err.status = 400;
    throw err;
  }
  const buffer = await remotePostPdf("pdf/compile", { template: texString });
  return { buffer, filename: "document.pdf" };
}

// (B) repo proposal.tex (+ image asset) → DO compiler (bundle)
export async function compileProposalTemplate() {
  const mainTex = await fs.readFile(PDF_TEMPLATE_PATH); // Buffer
  const baseDir = path.dirname(PDF_TEMPLATE_PATH);
  const logoPath = path.join(baseDir, "images", "Envimaster.png");
  const logoBuf = await fs.readFile(logoPath);

  const files = [
    { field: "main", name: "doc.tex", data: mainTex, type: "application/x-tex" },
    { field: "assets", name: "images/Envimaster.png", data: logoBuf, type: "image/png" },
  ];
  const manifest = { "Envimaster.png": "images/Envimaster.png" };

  const buffer = await remotePostMultipart("pdf/compile-bundle", files, { assetsManifest: manifest });
  return { buffer, filename: "proposal.pdf" };
}

// (C) customer-header — render Mustache locally, then SEND BUNDLE with logo
export async function compileCustomerHeader(body = {}) {
  const view = {
    headerTitle: latexEscape(body.headerTitle || ""),
    headerRows: (body.headerRows || []).map((r) => ({
      labelLeft: latexEscape(r.labelLeft || ""),
      valueLeft: latexEscape(r.valueLeft || ""),
      labelRight: latexEscape(r.labelRight || ""),
      valueRight: latexEscape(r.valueRight || ""),
    })),
    agreementEnviroOf: latexEscape(body.agreement?.enviroOf || ""),
    agreementExecutedOn: latexEscape(body.agreement?.customerExecutedOn || ""),
    agreementAdditionalMonths: latexEscape(body.agreement?.additionalMonths || ""),
    ...buildProductsLatex(body.products || {}),
    ...buildServicesLatex(body.services || {}),
  };

  const template = await fs.readFile(PDF_HEADER_TEMPLATE_PATH, "utf8");
  const tex = Mustache.render(template, view);

  const headerDir = path.dirname(PDF_HEADER_TEMPLATE_PATH);
  const logoBuf = await fs.readFile(path.join(headerDir, "images", "Envimaster.png"));

  const files = [
    { field: "main", name: "doc.tex", data: Buffer.from(tex, "utf8"), type: "application/x-tex" },
    { field: "assets", name: "images/Envimaster.png", data: logoBuf, type: "image/png" },
  ];
  const manifest = { "Envimaster.png": "images/Envimaster.png" };

  const buffer = await remotePostMultipart("pdf/compile-bundle", files, { assetsManifest: manifest });
  return { buffer, filename: "customer-header.pdf" };
}

/* (D) Pass-through: clients upload to your backend; you forward to DO */

// single .tex uploaded to your backend → forward to DO
export async function proxyCompileFileToRemote(file, opts = {}) {
  if (!file?.buffer) {
    const err = new Error("Missing file buffer");
    err.status = 400;
    throw err;
  }
  const files = [
    {
      field: "file",
      name: file.originalname || "doc.tex",
      data: file.buffer,
      type: file.mimetype || "application/x-tex",
    },
  ];
  const buffer = await remotePostMultipart("pdf/compile-file", files, {}, opts);
  return { buffer, filename: "document.pdf" };
}

// .tex + assets[] uploaded to your backend → forward to DO (with manifest)
export async function proxyCompileBundleToRemote(mainFile, assets = [], manifest = {}, opts = {}) {
  if (!mainFile?.buffer) {
    const err = new Error("Missing 'main' .tex file");
    err.status = 400;
    throw err;
  }
  const files = [
    {
      field: "main",
      name: mainFile.originalname || "doc.tex",
      data: mainFile.buffer,
      type: mainFile.mimetype || "application/x-tex",
    },
    ...assets.map((f) => ({
      field: "assets",
      name: f.originalname || "asset.bin",
      data: f.buffer,
      type: f.mimetype || "application/octet-stream",
    })),
  ];
  const buffer = await remotePostMultipart("pdf/compile-bundle", files, { assetsManifest: manifest }, opts);
  return { buffer, filename: "document.pdf" };
}
