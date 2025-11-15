// src/controllers/pdfController.js
import {
  getPdfHealth,
  compileRawTex,
  compileProposalTemplate,
  compileCustomerHeader,
  proxyCompileFileToRemote,
  proxyCompileBundleToRemote,
} from "../services/pdfService.js";
import CustomerHeaderDoc from "../models/CustomerHeaderDoc.js";

/* ---------------- Health ---------------- */

export async function pdfHealth(_req, res) {
  const info = await getPdfHealth();
  res.json(info);
}

/* ---------------- Basic compile APIs ---------------- */

export async function compileFromRaw(req, res) {
  try {
    const tpl = req.body?.template;
    const { buffer, filename } = await compileRawTex(tpl);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res
      .status(err?.status || 500)
      .json({
        error: "LaTeX compilation failed",
        detail: err?.detail || String(err),
      });
  }
}

export async function compileFromProposalFile(_req, res) {
  try {
    const { buffer, filename } = await compileProposalTemplate();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res
      .status(500)
      .json({
        error: "LaTeX compilation failed",
        detail: err?.detail || String(err),
      });
  }
}

/* ---------------- Customer Header (PDF only, no DB) ---------------- */

// kept in case you want a “just compile, don’t store in DB” API
export async function compileCustomerHeaderPdf(req, res) {
  try {
    const { buffer, filename } = await compileCustomerHeader(req.body || {});
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res
      .status(500)
      .json({
        error: "LaTeX compilation failed",
        detail: err?.detail || String(err),
      });
  }
}

/* ---------------- Customer Header (POST: create + store in Mongo) ---------------- */

export async function compileAndStoreCustomerHeader(req, res) {
  try {
    const payload = req.body || {};

    const started = Date.now();
    const { buffer, filename } = await compileCustomerHeader(payload);
    const ms = Date.now() - started;

    const bytes = buffer?.length || 0;

    const doc = await CustomerHeaderDoc.create({
      payload,
      pdf_meta: {
        bytes,
        ms,
      },
      status: "draft", // or "active" if you prefer
      createdBy: "system", // later you can use req.user?.id or email
      updatedBy: "system",
    });

    // expose the Mongo _id + meta in headers so frontend can store it
    res.setHeader("X-Document-Id", String(doc._id));
    res.setHeader("X-Bytes", String(bytes));
    res.setHeader("X-Compile-Ms", String(ms));

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    console.error("compileAndStoreCustomerHeader error:", err);
    res
      .status(500)
      .json({
        error: "LaTeX compilation failed",
        detail: err?.detail || String(err),
      });
  }
}

/* ---------------- NEW: Customer Header GET / PUT APIs ---------------- */

/**
 * GET /api/pdf/customer-headers
 * Returns all stored customer header docs (newest first)
 */
export async function getAllCustomerHeaders(_req, res) {
  try {
    const docs = await CustomerHeaderDoc.find({})
      .sort({ createdAt: -1 })
      .lean();

    res.json(docs);
  } catch (err) {
    console.error("getAllCustomerHeaders error:", err);
    res
      .status(500)
      .json({ error: "Failed to fetch customer headers", detail: String(err) });
  }
}

/**
 * GET /api/pdf/customer-headers/:id
 * Returns single document (JSON + meta)
 */
export async function getCustomerHeaderById(req, res) {
  try {
    const { id } = req.params;
    const doc = await CustomerHeaderDoc.findById(id).lean();
    if (!doc) {
      return res
        .status(404)
        .json({ error: "Not found", detail: "CustomerHeaderDoc not found" });
    }
    res.json(doc);
  } catch (err) {
    console.error("getCustomerHeaderById error:", err);
    // If invalid ObjectId
    if (err?.name === "CastError") {
      return res
        .status(400)
        .json({ error: "Invalid id", detail: String(err) });
    }
    res
      .status(500)
      .json({ error: "Failed to fetch customer header", detail: String(err) });
  }
}

/**
 * PUT /api/pdf/customer-headers/:id
 * Update the JSON payload, recompile PDF, update meta, return new PDF
 */
export async function updateCustomerHeaderById(req, res) {
  try {
    const { id } = req.params;
    const existing = await CustomerHeaderDoc.findById(id);
    if (!existing) {
      return res
        .status(404)
        .json({ error: "Not found", detail: "CustomerHeaderDoc not found" });
    }

    // New payload from client (same JSON shape as on create)
    const payload = req.body || {};

    const started = Date.now();
    const { buffer, filename } = await compileCustomerHeader(payload);
    const ms = Date.now() - started;
    const bytes = buffer?.length || 0;

    existing.payload = payload;
    existing.pdf_meta = {
      ...(existing.pdf_meta || {}),
      bytes,
      ms,
    };
    existing.status = payload.status || existing.status || "draft";
    existing.updatedBy = "system"; // later: req.user?.id

    await existing.save();

    // send new meta in headers also
    res.setHeader("X-Document-Id", String(existing._id));
    res.setHeader("X-Bytes", String(bytes));
    res.setHeader("X-Compile-Ms", String(ms));

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    console.error("updateCustomerHeaderById error:", err);
    if (err?.name === "CastError") {
      return res
        .status(400)
        .json({ error: "Invalid id", detail: String(err) });
    }
    res
      .status(500)
      .json({
        error: "Failed to update & compile customer header",
        detail: err?.detail || String(err),
      });
  }
}

/* ---------------- Pass-through file proxies ---------------- */

export async function proxyCompileFile(req, res) {
  try {
    const file = req.file; // multer single('file')
    const { buffer, filename } = await proxyCompileFileToRemote(file);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res
      .status(err?.status || 500)
      .json({
        error: "LaTeX compilation failed",
        detail: err?.detail || String(err),
      });
  }
}

export async function proxyCompileBundle(req, res) {
  try {
    const main = req.files?.main?.[0];
    const assets = Array.isArray(req.files?.assets) ? req.files.assets : [];
    let manifest = {};
    if (req.body?.assetsManifest) {
      try {
        manifest = JSON.parse(req.body.assetsManifest);
      } catch {
        // ignore parse error, manifest stays {}
      }
    }

    const { buffer, filename } = await proxyCompileBundleToRemote(
      main,
      assets,
      manifest
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res
      .status(err?.status || 500)
      .json({
        error: "LaTeX compilation failed",
        detail: err?.detail || String(err),
      });
  }
}
