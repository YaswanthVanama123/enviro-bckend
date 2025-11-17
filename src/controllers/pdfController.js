// src/controllers/pdfController.js
import axios from "axios";
import mongoose from "mongoose";
import {
  getPdfHealth,
  compileRawTex,
  compileProposalTemplate,
  compileCustomerHeader,
  proxyCompileFileToRemote,
  proxyCompileBundleToRemote,
} from "../services/pdfService.js";

import CustomerHeaderDoc from "../models/CustomerHeaderDoc.js";
import AdminHeaderDoc from "../models/AdminHeaderDoc.js";

/* ------------ health + low-level compile endpoints ------------ */

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
    res.status(err?.status || 500).json({
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
    res.status(500).json({
      error: "LaTeX compilation failed",
      detail: err?.detail || String(err),
    });
  }
}

/* ------------ CUSTOMER HEADER FLOW (CustomerHeaderDoc) ------------ */

// compile ONLY, no DB
export async function compileCustomerHeaderPdf(req, res) {
  try {
    const { buffer, filename } = await compileCustomerHeader(req.body || {});
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({
      error: "LaTeX compilation failed",
      detail: err?.detail || String(err),
    });
  }
}

// POST /api/pdf/customer-header  (compile + store CustomerHeaderDoc)
export async function compileAndStoreCustomerHeader(req, res) {
  try {
    const body = req.body || {};
    const { buffer, filename } = await compileCustomerHeader(body);

    const payload = {
      headerTitle: body.headerTitle || "",
      headerRows: body.headerRows || [],
      products: body.products || {},
      services: body.services || {},
      agreement: body.agreement || {},
    };

    const zoho = {
      bigin: {
        dealId: body.zoho?.bigin?.dealId || null,
        fileId: body.zoho?.bigin?.fileId || null,
        url: body.zoho?.bigin?.url || null,
      },
      crm: {
        dealId: body.zoho?.crm?.dealId || null,
        fileId: body.zoho?.crm?.fileId || null,
        url: body.zoho?.crm?.url || null,
      },
    };

    const doc = await CustomerHeaderDoc.create({
      payload,
      pdf_meta: {
        sizeBytes: buffer.length,
        contentType: "application/pdf",
        storedAt: new Date(),
        externalUrl: null,
      },
      status: body.status || "draft",
      createdBy: req.admin?.id || null,
      updatedBy: req.admin?.id || null,
      zoho,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("X-CustomerHeaderDoc-Id", doc._id.toString());
    res.send(buffer);
  } catch (err) {
    console.error("compileAndStoreCustomerHeader error:", err);
    res.status(500).json({
      error: "LaTeX compilation failed",
      detail: err?.detail || String(err),
    });
  }
}

// GET /api/pdf/customer-headers  (full list, paged)
export async function getCustomerHeaders(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit || "20", 10), 1),
      100
    );

    const filter = {};
    const total = await CustomerHeaderDoc.countDocuments(filter);
    const items = await CustomerHeaderDoc.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({ total, page, limit, items });
  } catch (err) {
    console.error("getCustomerHeaders error:", err);
    res
      .status(500)
      .json({ error: "Failed to fetch docs", detail: String(err) });
  }
}

// GET /api/pdf/customer-headers/:id (full doc, no Zoho fetch)
export async function getCustomerHeaderById(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res
        .status(400)
        .json({ error: "bad_request", detail: "Invalid id" });
    }

    const doc = await CustomerHeaderDoc.findById(id).lean();
    if (!doc) {
      return res
        .status(404)
        .json({ error: "not_found", detail: "Document not found" });
    }

    res.json(doc);
  } catch (err) {
    console.error("getCustomerHeaderById error:", err);
    res
      .status(500)
      .json({ error: "server_error", detail: err?.message || String(err) });
  }
}

// PUT /api/pdf/customer-headers/:id  (optionally ?recompile=true)
export async function updateCustomerHeader(req, res) {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const recompile = req.query.recompile === "true";

    const doc = await CustomerHeaderDoc.findById(id);
    if (!doc) {
      return res
        .status(404)
        .json({ error: "Not found", detail: "CustomerHeaderDoc not found" });
    }

    doc.payload ||= {};
    doc.zoho ||= { bigin: {}, crm: {} };

    if (body.headerTitle !== undefined)
      doc.payload.headerTitle = body.headerTitle;
    if (body.headerRows !== undefined)
      doc.payload.headerRows = body.headerRows;
    if (body.products !== undefined) doc.payload.products = body.products;
    if (body.services !== undefined) doc.payload.services = body.services;
    if (body.agreement !== undefined) doc.payload.agreement = body.agreement;
    if (body.status !== undefined) doc.status = body.status;

    if (body.zoho?.bigin) {
      doc.zoho.bigin = {
        ...doc.zoho.bigin,
        ...body.zoho.bigin,
      };
    }
    if (body.zoho?.crm) {
      doc.zoho.crm = {
        ...doc.zoho.crm,
        ...body.zoho.crm,
      };
    }

    doc.updatedBy = req.admin?.id || doc.updatedBy;

    let buffer = null;
    let filename = "customer-header.pdf";

    if (recompile) {
      const { buffer: pdfBuf, filename: fn } = await compileCustomerHeader({
        headerTitle: doc.payload.headerTitle,
        headerRows: doc.payload.headerRows,
        products: doc.payload.products,
        services: doc.payload.services,
        agreement: doc.payload.agreement,
      });

      buffer = pdfBuf;
      filename = fn || filename;
      doc.pdf_meta = {
        ...(doc.pdf_meta || {}),
        sizeBytes: buffer.length,
        contentType: "application/pdf",
        storedAt: new Date(),
      };
    }

    await doc.save();

    if (buffer) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      return res.send(buffer);
    }

    return res.json({ success: true, doc });
  } catch (err) {
    console.error("updateCustomerHeader error:", err);
    res
      .status(500)
      .json({ error: "Failed to update doc", detail: String(err) });
  }
}

/* ------------ ADMIN HEADER FLOW (AdminHeaderDoc) ------------ */

// --- ADMIN HEADER FLOW (AdminHeaderDoc) ---

export async function compileAndStoreAdminHeader(req, res) {
  try {
    const body = req.body || {};
    const { buffer, filename } = await compileCustomerHeader(body);

    // Map body directly into schema fields
    const doc = await AdminHeaderDoc.create({
      headerTitle: body.headerTitle || "",
      headerRows: body.headerRows || [],
      products: body.products || {},
      services: body.services || {},
      agreement: {
        enviroOf: body.agreement?.enviroOf || "",
        customerExecutedOn: body.agreement?.customerExecutedOn || "",
        additionalMonths: body.agreement?.additionalMonths || "",
      },
      pdfMeta: {
        sizeBytes: buffer.length,
        contentType: "application/pdf",
        storedAt: new Date(),
        externalUrl: null,
      },
      status: body.status || "draft",
      createdBy: req.admin?.id || null,
      updatedBy: req.admin?.id || null,
      label: body.label || "",
      // if you later add zohoBigin to the UI, map it here:
      // zohoBigin: { ...body.zohoBigin },
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("X-AdminHeaderDoc-Id", doc._id.toString());
    res.send(buffer);
  } catch (err) {
    console.error("compileAndStoreAdminHeader error:", err);
    res.status(500).json({
      error: "LaTeX compilation failed",
      detail: err?.detail || String(err),
    });
  }
}


export async function getAdminHeaders(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit || "20", 10), 1),
      100
    );

    const filter = {};
    const total = await AdminHeaderDoc.countDocuments(filter);
    const items = await AdminHeaderDoc.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({ total, page, limit, items });
  } catch (err) {
    console.error("getAdminHeaders error:", err);
    res
      .status(500)
      .json({ error: "Failed to fetch docs", detail: String(err) });
  }
}

export async function getAdminHeaderById(req, res) {
  try {
    const { id } = req.params;
    const doc = await AdminHeaderDoc.findById(id).lean();
    if (!doc) {
      return res
        .status(404)
        .json({ error: "Not found", detail: "AdminHeaderDoc not found" });
    }
    res.json(doc);
  } catch (err) {
    console.error("getAdminHeaderById error:", err);
    res
      .status(500)
      .json({ error: "Failed to fetch doc", detail: String(err) });
  }
}

export async function updateAdminHeader(req, res) {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const recompile = req.query.recompile === "true";

    const doc = await AdminHeaderDoc.findById(id);
    if (!doc) {
      return res
        .status(404)
        .json({ error: "Not found", detail: "AdminHeaderDoc not found" });
    }

    if (body.headerTitle !== undefined) doc.headerTitle = body.headerTitle;
    if (body.headerRows !== undefined) doc.headerRows = body.headerRows;
    if (body.products !== undefined) doc.products = body.products;
    if (body.services !== undefined) doc.services = body.services;
    if (body.status !== undefined) doc.status = body.status;
    if (body.label !== undefined) doc.label = body.label;

    if (body.agreement !== undefined) {
      doc.agreement = {
        enviroOf:
          body.agreement.enviroOf ?? doc.agreement?.enviroOf ?? "",
        customerExecutedOn:
          body.agreement.customerExecutedOn ??
          doc.agreement?.customerExecutedOn ??
          "",
        additionalMonths:
          body.agreement.additionalMonths ??
          doc.agreement?.additionalMonths ??
          "",
      };
    }

    // If you later use zohoBigin, merge here:
    // if (body.zohoBigin) {
    //   doc.zohoBigin = { ...doc.zohoBigin, ...body.zohoBigin };
    // }

    doc.updatedBy = req.admin?.id || doc.updatedBy;

    let buffer = null;
    let filename = "admin-header.pdf";

    if (recompile) {
      const { buffer: pdfBuf, filename: fn } = await compileCustomerHeader({
        headerTitle: doc.headerTitle,
        headerRows: doc.headerRows,
        products: doc.products,
        services: doc.services,
        agreement: doc.agreement,
      });

      buffer = pdfBuf;
      filename = fn || filename;
      doc.pdfMeta = {
        ...(doc.pdfMeta || {}),
        sizeBytes: buffer.length,
        contentType: "application/pdf",
        storedAt: new Date(),
      };
    }

    await doc.save();

    if (buffer) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      return res.send(buffer);
    }

    return res.json({ success: true, doc });
  } catch (err) {
    console.error("updateAdminHeader error:", err);
    res
      .status(500)
      .json({ error: "Failed to update doc", detail: String(err) });
  }
}


/* ------------ VIEWER APIS (CustomerHeaderDoc + Zoho) ------------ */

// async function fetchZohoPdfFromBigin(zohoInfo) {
//   if (!zohoInfo) return null;

//   const url = zohoInfo.url || zohoInfo.downloadUrl;
//   if (!url) return null;

//   const token = process.env.ZOHO_BIGIN_ACCESS_TOKEN;
//   if (!token) {
//     console.warn("ZOHO_BIGIN_ACCESS_TOKEN not set; cannot fetch PDF");
//     return null;
//   }

//   const resp = await axios.get(url, {
//     responseType: "arraybuffer",
//     headers: { Authorization: `Zoho-oauthtoken ${token}` },
//   });

//   return Buffer.from(resp.data);
// }

// GET /api/pdf/viewer/getall/highlevel

async function fetchZohoPdfFromBigin(zohoInfo) {
  if (!zohoInfo) return null;

  const url = zohoInfo.url || zohoInfo.downloadUrl;
  if (!url) return null;

  const token = process.env.ZOHO_BIGIN_ACCESS_TOKEN;
  if (!token) {
    console.warn("ZOHO_BIGIN_ACCESS_TOKEN not set; cannot fetch PDF");
    return null;
  }

  const resp = await axios.get(url, {
    responseType: "arraybuffer",
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });

  return Buffer.from(resp.data);
}


export async function getCustomerHeadersHighLevel(req, res) {
  try {
    const docs = await CustomerHeaderDoc.find({})
      .sort({ createdAt: -1 })
      .select({
        _id: 1,
        status: 1,
        createdAt: 1,
        updatedAt: 1,
        "payload.headerTitle": 1,
        "zoho.bigin.dealId": 1,
        "zoho.bigin.fileId": 1,
        "zoho.bigin.url": 1,
        "zoho.crm.dealId": 1,
        "zoho.crm.fileId": 1,
        "zoho.crm.url": 1,
      })
      .lean();

    const response = docs.map((d) => ({
      id: d._id,
      headerTitle: d.payload?.headerTitle || "",
      status: d.status,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      zoho: {
        bigin: {
          dealId: d.zoho?.bigin?.dealId || null,
          fileId: d.zoho?.bigin?.fileId || null,
          url: d.zoho?.bigin?.url || null,
        },
        crm: {
          dealId: d.zoho?.crm?.dealId || null,
          fileId: d.zoho?.crm?.fileId || null,
          url: d.zoho?.crm?.url || null,
        },
      },
    }));

    res.json(response);
  } catch (err) {
    console.error("getCustomerHeadersHighLevel error:", err);
    res
      .status(500)
      .json({ error: "server_error", detail: err?.message || String(err) });
  }
}

// GET /api/pdf/viewer/getbyid/:id
export async function getCustomerHeaderViewerById(req, res) {
  try {
    const { id } = req.params;
    const doc = await CustomerHeaderDoc.findById(id).lean();
    if (!doc) {
      return res
        .status(404)
        .json({ error: "Not found", detail: "CustomerHeaderDoc not found" });
    }

    let pdfBase64 = null;
    let pdfContentType = "application/pdf";

    try {
      const buf = await fetchZohoPdfFromBigin(doc.zoho?.bigin || {});
      if (buf) {
        pdfBase64 = buf.toString("base64");
      }
    } catch (e) {
      console.error("Error fetching PDF from Zoho Bigin:", e);
    }

    res.json({
      doc,
      pdf: pdfBase64,
      contentType: pdfBase64 ? pdfContentType : null,
    });
  } catch (err) {
    console.error("getCustomerHeaderViewerById error:", err);
    res.status(500).json({
      error: "Failed to fetch viewer doc",
      detail: String(err),
    });
  }
}

/* ------------ pass-through file/bundle endpoints ------------ */

export async function proxyCompileFile(req, res) {
  try {
    const file = req.file; // multer single('file')
    const { buffer, filename } = await proxyCompileFileToRemote(file);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(err?.status || 500).json({
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
      } catch {}
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
    res.status(err?.status || 500).json({
      error: "LaTeX compilation failed",
      detail: err?.detail || String(err),
    });
  }
}


// GET /api/pdf/viewer/download/:id
// Downloads PDF from Zoho Bigin and streams it to the client
export async function downloadCustomerHeaderPdf(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res
        .status(400)
        .json({ error: "bad_request", detail: "Invalid id" });
    }

    const doc = await CustomerHeaderDoc.findById(id).lean();
    if (!doc) {
      return res
        .status(404)
        .json({ error: "not_found", detail: "CustomerHeaderDoc not found" });
    }

    const zohoInfo = doc.zoho?.bigin || {};

    if (!zohoInfo || (!zohoInfo.url && !zohoInfo.downloadUrl)) {
      return res.status(400).json({
        error: "no_zoho_pdf",
        detail: "No Zoho Bigin PDF URL stored for this document",
      });
    }

    const buf = await fetchZohoPdfFromBigin(zohoInfo);
    if (!buf) {
      return res.status(502).json({
        error: "upstream_error",
        detail: "Failed to download PDF from Zoho Bigin",
      });
    }

    // Build a safe filename: <headerTitle>-<id>.pdf
    const baseName =
      (doc.payload?.headerTitle || "customer-header")
        .toString()
        .replace(/[^a-zA-Z0-9-_]+/g, "_")
        .substring(0, 80) || "customer-header";

    const filename = `${baseName}-${doc._id.toString()}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    res.send(buf);
  } catch (err) {
    console.error("downloadCustomerHeaderPdf error:", err);
    res
      .status(500)
      .json({ error: "server_error", detail: err?.message || String(err) });
  }
}

