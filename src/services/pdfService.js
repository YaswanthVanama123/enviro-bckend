// src/services/pdfService.js
import fs from "fs/promises";
import path from "path";
import {
  PDF_REMOTE_BASE,
  PDF_REMOTE_TIMEOUT_MS,
  PDF_TEMPLATE_PATH,
} from "../config/pdfConfig.js";

/* ---------- simple JSON POST helper ---------- */
async function remotePostPdf(pathname, body = {}, { timeoutMs = PDF_REMOTE_TIMEOUT_MS } = {}) {
  const url = `${PDF_REMOTE_BASE.replace(/\/+$/, "")}/${pathname.replace(/^\/+/, "")}`;
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/pdf" },
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

/* ---------- multipart (bundle) POST helper ---------- */
async function postMultipartBundle(pathname, files, manifest, { timeoutMs = PDF_REMOTE_TIMEOUT_MS } = {}) {
  const url = `${PDF_REMOTE_BASE.replace(/\/+$/, "")}/${pathname.replace(/^\/+/, "")}`;
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const fd = new FormData();

    // Attach files
    for (const f of files) {
      // IMPORTANT: normalize names to forward slashes so Linux treats them as paths
      const filename = String(f.name).replace(/\\/g, "/");
      fd.append(
        f.field,
        new Blob([f.data], { type: f.type || "application/octet-stream" }),
        filename
      );
    }

    // Attach manifest that maps original file names to desired relative paths
    if (manifest && Object.keys(manifest).length) {
      fd.append("assetsManifest", JSON.stringify(manifest));
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

/* ---------- public API ---------- */
export async function getPdfHealth() {
  try {
    const r = await fetch(`${PDF_REMOTE_BASE.replace(/\/+$/, "")}/health`);
    const j = await r.json();
    return { mode: "remote", ok: true, base: PDF_REMOTE_BASE, remote: j };
  } catch (e) {
    return { mode: "remote", ok: false, base: PDF_REMOTE_BASE, error: String(e) };
  }
}

// 1) compile EXACT TeX string sent by client
export async function compileRawTex(texString) {
  if (!texString || typeof texString !== "string") {
    const err = new Error("Body must include a 'template' string.");
    err.status = 400;
    throw err;
  }
  const buffer = await remotePostPdf("pdf/compile", { template: texString });
  return { buffer, filename: "document.pdf" };
}

// 2) compile your LOCAL proposal.tex by sending it + assets bundle
export async function compileProposalTemplate() {
  // Read template and local assets
  const mainTex = await fs.readFile(PDF_TEMPLATE_PATH); // Buffer
  const baseDir = path.dirname(PDF_TEMPLATE_PATH);
  const logoPath = path.join(baseDir, "images", "Envimaster.png");
  const logoBuf = await fs.readFile(logoPath);

  // Files to send (note: names use POSIX-style subpaths)
  const files = [
    { field: "main",   name: "doc.tex",               data: mainTex, type: "application/x-tex" },
    { field: "assets", name: "images/Envimaster.png", data: logoBuf, type: "image/png" },
  ];

  // Manifest tells DO where to put each original filename
  // Multer sees "originalname" (basename), so we map basename -> desired rel path.
  const manifest = {
    "Envimaster.png": "images/Envimaster.png",
  };

  const buffer = await postMultipartBundle("pdf/compile-bundle", files, manifest);
  return { buffer, filename: "proposal.pdf" };
}
