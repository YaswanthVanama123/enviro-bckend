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

import { uploadToZohoBigin, uploadToZohoCRM } from "../services/zohoService.js";

import CustomerHeaderDoc from "../models/CustomerHeaderDoc.js";
import AdminHeaderDoc from "../models/AdminHeaderDoc.js";
import ServiceConfig from "../models/ServiceConfig.js";

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
// Supports DRAFT (no PDF) and FINAL (with PDF + Zoho)
export async function compileAndStoreCustomerHeader(req, res) {
  try {
    const body = req.body || {};
    const status = body.status || "saved"; // Default to "saved" instead of "draft"
    const isDraft = status === "draft";

    // Prepare payload structure
    const payload = {
      headerTitle: body.headerTitle || "",
      headerRows: body.headerRows || [],
      products: body.products || {},
      services: body.services || {},
      agreement: body.agreement || {},
    };

    // DEBUG: Log the products structure being sent to PDF service
    console.log("🐛 [DEBUG] Products payload structure:", JSON.stringify(body.products, null, 2));
    if (body.products) {
      console.log("🐛 [DEBUG] Product counts:", {
        smallProducts: (body.products.smallProducts || []).length,
        bigProducts: (body.products.bigProducts || []).length,
        dispensers: (body.products.dispensers || []).length
      });
    }

    let buffer = null;
    let filename = "customer-header.pdf";
    let zohoData = {
      bigin: { dealId: null, fileId: null, url: null },
      crm: { dealId: null, fileId: null, url: null },
    };

    // If NOT a draft, compile PDF and upload to Zoho
    if (!isDraft) {
      console.log("Compiling PDF for final save...");
      const pdfResult = await compileCustomerHeader(payload);
      buffer = pdfResult.buffer;
      filename = pdfResult.filename;

      // Upload to Zoho Bigin
      try {
        console.log("Uploading to Zoho Bigin...");
        const biginResult = await uploadToZohoBigin(
          buffer,
          filename,
          body.zoho?.bigin?.dealId || null
        );
        zohoData.bigin = {
          dealId: biginResult.dealId,
          fileId: biginResult.fileId,
          url: biginResult.url,
        };
      } catch (zohoErr) {
        console.error("Zoho Bigin upload failed:", zohoErr.message);
        // Continue even if Zoho fails
      }

      // Upload to Zoho CRM (if needed)
      try {
        console.log("Uploading to Zoho CRM...");
        const crmResult = await uploadToZohoCRM(
          buffer,
          filename,
          body.zoho?.crm?.dealId || null
        );
        zohoData.crm = {
          dealId: crmResult.dealId,
          fileId: crmResult.fileId,
          url: crmResult.url,
        };
      } catch (zohoErr) {
        console.error("Zoho CRM upload failed:", zohoErr.message);
        // Continue even if Zoho fails
      }
    }

    // Create document in database
    const doc = await CustomerHeaderDoc.create({
      payload,
      pdf_meta: buffer
        ? {
            sizeBytes: buffer.length,
            contentType: "application/pdf",
            storedAt: new Date(),
            pdfBuffer: buffer, // Store PDF in database
            externalUrl: null,
          }
        : {
            sizeBytes: 0,
            contentType: "application/pdf",
            storedAt: null,
            pdfBuffer: null,
            externalUrl: null,
          },
      status,
      createdBy: req.admin?.id || null,
      updatedBy: req.admin?.id || null,
      zoho: zohoData,
    });

    console.log(`Document created with ID: ${doc._id}, status: ${status}`);

    // Return response based on draft or final
    if (isDraft) {
      // Draft: Return JSON only
      res.setHeader("X-CustomerHeaderDoc-Id", doc._id.toString());
      return res.status(201).json({
        success: true,
        _id: doc._id.toString(),
        status: doc.status,
        createdAt: doc.createdAt,
      });
    } else {
      // Final: Return PDF with metadata in header
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      res.setHeader("X-CustomerHeaderDoc-Id", doc._id.toString());
      return res.send(buffer);
    }
  } catch (err) {
    console.error("compileAndStoreCustomerHeader error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to save document",
      detail: err?.detail || err?.message || String(err),
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

    // Check if we're in development mode without database
    if (mongoose.connection.readyState === 0) {
      console.log('⚠️ Database not connected, returning empty list for PDF testing');
      return res.json({ total: 0, page, limit, items: [] });
    }

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

    // If it's a database timeout, return empty list for testing
    if (err.message.includes('buffering timed out')) {
      console.log('⚠️ Database timeout, returning empty list for PDF testing');
      return res.json({ total: 0, page: 1, limit: 20, items: [] });
    }

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

    // Check if we're in development mode without database
    if (mongoose.connection.readyState === 0) {
      console.log('⚠️ Database not connected, returning mock data for PDF testing');
      return res.json({
        _id: id,
        payload: {
          headerTitle: "Sample Document",
          headerRows: [],
          products: { products: [], dispensers: [] },
          services: {},
          agreement: {}
        },
        status: "draft",
        createdAt: new Date(),
        updatedAt: new Date()
      });
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

    // If it's a database timeout, return mock data for testing
    if (err.message.includes('buffering timed out')) {
      console.log('⚠️ Database timeout, returning mock data for PDF testing');
      return res.json({
        _id: req.params.id,
        payload: {
          headerTitle: "Sample Document",
          headerRows: [],
          products: { products: [], dispensers: [] },
          services: {},
          agreement: {}
        },
        status: "draft",
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    res
      .status(500)
      .json({ error: "server_error", detail: err?.message || String(err) });
  }
}

// PUT /api/pdf/customer-headers/:id  (optionally ?recompile=true)
// Supports updating drafts and recompiling PDFs
export async function updateCustomerHeader(req, res) {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const recompile = req.query.recompile === "true";

    const doc = await CustomerHeaderDoc.findById(id);
    if (!doc) {
      return res
        .status(404)
        .json({ success: false, error: "Not found", detail: "CustomerHeaderDoc not found" });
    }

    const previousStatus = doc.status;
    const newStatus = body.status || doc.status;
    const statusChanged = previousStatus !== newStatus;
    const wasDraft = previousStatus === "draft";
    const isNowFinal = newStatus !== "draft";

    // Update payload fields
    doc.payload ||= {};
    if (body.headerTitle !== undefined) doc.payload.headerTitle = body.headerTitle;
    if (body.headerRows !== undefined) doc.payload.headerRows = body.headerRows;
    if (body.products !== undefined) doc.payload.products = body.products;
    if (body.services !== undefined) doc.payload.services = body.services;
    if (body.agreement !== undefined) doc.payload.agreement = body.agreement;
    doc.status = newStatus;

    // Update Zoho references if provided
    doc.zoho ||= { bigin: {}, crm: {} };
    if (body.zoho?.bigin) {
      doc.zoho.bigin = { ...doc.zoho.bigin, ...body.zoho.bigin };
    }
    if (body.zoho?.crm) {
      doc.zoho.crm = { ...doc.zoho.crm, ...body.zoho.crm };
    }

    doc.updatedBy = req.admin?.id || doc.updatedBy;

    // Determine if we need to compile PDF
    const shouldCompilePdf = recompile || (statusChanged && wasDraft && isNowFinal);

    let buffer = null;
    let filename = "customer-header.pdf";

    if (shouldCompilePdf) {
      console.log(`Compiling PDF for document ${id}...`);

      // DEBUG: Check what's stored in the database vs what's coming from frontend
      console.log('🔍 [DEBUG] Database doc.payload.products:', JSON.stringify(doc.payload.products, null, 2));
      if (body.products) {
        console.log('🔍 [DEBUG] Frontend body.products:', JSON.stringify(body.products, null, 2));
      }

      const productsData = body.products || doc.payload.products;
      console.log('🔍 [DEBUG] Using products data from:', body.products ? 'FRONTEND PAYLOAD' : 'STORED DATABASE');
      console.log('🔍 [DEBUG] Final products data structure:', JSON.stringify(productsData, null, 2));

      const pdfResult = await compileCustomerHeader({
        headerTitle: doc.payload.headerTitle,
        headerRows: doc.payload.headerRows,
        products: productsData,  // Use the determined data source
        services: body.services || doc.payload.services,
        agreement: doc.payload.agreement,
      });

      buffer = pdfResult.buffer;
      filename = pdfResult.filename || filename;

      // Update PDF metadata
      doc.pdf_meta = {
        sizeBytes: buffer.length,
        contentType: "application/pdf",
        storedAt: new Date(),
        pdfBuffer: buffer, // Store PDF in database
        externalUrl: doc.pdf_meta?.externalUrl || null,
      };

      // Upload to Zoho if this is a status change from draft to final
      if (statusChanged && wasDraft && isNowFinal) {
        // Upload to Zoho Bigin
        try {
          console.log("Uploading to Zoho Bigin...");
          const biginResult = await uploadToZohoBigin(
            buffer,
            filename,
            body.zoho?.bigin?.dealId || doc.zoho?.bigin?.dealId || null
          );
          doc.zoho.bigin = {
            dealId: biginResult.dealId,
            fileId: biginResult.fileId,
            url: biginResult.url,
          };
        } catch (zohoErr) {
          console.error("Zoho Bigin upload failed:", zohoErr.message);
        }

        // Upload to Zoho CRM
        try {
          console.log("Uploading to Zoho CRM...");
          const crmResult = await uploadToZohoCRM(
            buffer,
            filename,
            body.zoho?.crm?.dealId || doc.zoho?.crm?.dealId || null
          );
          doc.zoho.crm = {
            dealId: crmResult.dealId,
            fileId: crmResult.fileId,
            url: crmResult.url,
          };
        } catch (zohoErr) {
          console.error("Zoho CRM upload failed:", zohoErr.message);
        }
      }
    }

    await doc.save();

    console.log(`Document ${id} updated, status: ${doc.status}, compiled: ${shouldCompilePdf}`);

    // Return response based on whether PDF was compiled
    if (buffer) {
      // Return PDF if compiled
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      return res.send(buffer);
    } else {
      // Return JSON for draft updates
      return res.json({
        success: true,
        doc: {
          _id: doc._id,
          status: doc.status,
          updatedAt: doc.updatedAt,
          pdf_meta: doc.pdf_meta,
          zoho: doc.zoho,
        },
      });
    }
  } catch (err) {
    console.error("updateCustomerHeader error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to update document",
      detail: err?.message || String(err),
    });
  }
}

// PATCH /api/pdf/customer-headers/:id/status (update status only)
export async function updateCustomerHeaderStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res
        .status(400)
        .json({ error: "bad_request", detail: "Invalid id" });
    }

    // Validate status
    const validStatuses = ["saved", "draft", "pending_approval", "approved_admin", "approved_salesman"];
    if (!status || !validStatuses.includes(status)) {
      return res
        .status(400)
        .json({
          error: "bad_request",
          detail: `Invalid status. Must be one of: ${validStatuses.join(", ")}`
        });
    }

    const doc = await CustomerHeaderDoc.findById(id);
    if (!doc) {
      return res
        .status(404)
        .json({ error: "not_found", detail: "Document not found" });
    }

    // Update status
    doc.status = status;
    doc.updatedBy = req.admin?.id || doc.updatedBy;
    await doc.save();

    console.log(`Document ${id} status updated to: ${status}`);

    res.json({
      success: true,
      doc: {
        _id: doc._id,
        status: doc.status,
        updatedAt: doc.updatedAt,
      },
    });
  } catch (err) {
    console.error("updateCustomerHeaderStatus error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to update status",
      detail: err?.message || String(err),
    });
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
      status: body.status || "saved", // Default to "saved" instead of "draft"
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

    // Fetch service configs where adminByDisplay is true and isActive is true
    const activeServices = await ServiceConfig.find({
      isActive: true,
      adminByDisplay: { $ne: false }
    }).lean();

    // Map to service metadata (serviceId, label, description)
    const serviceMetadata = activeServices.map(service => ({
      serviceId: service.serviceId,
      label: service.label,
      description: service.description,
      tags: service.tags || []
    }));

    // Return the doc with available services
    // Frontend will fetch products separately from product-catalog API
    res.json({
      ...doc,
      availableServices: serviceMetadata
    });
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

    const doc = await CustomerHeaderDoc.findById(id);
    if (!doc) {
      return res
        .status(404)
        .json({ error: "not_found", detail: "CustomerHeaderDoc not found" });
    }

    // Try to get PDF from database first
    if (doc.pdf_meta?.pdfBuffer) {
      const buffer = doc.pdf_meta.pdfBuffer;

      // Extract customer name from headerRows or customerName field
      const customerName = extractCustomerNameFromDoc(doc);
      const filename = `${customerName}.pdf`;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${filename}"`
      );
      return res.send(buffer);
    }

    // Fallback: Try to fetch from Zoho if pdfBuffer not available
    const zohoInfo = doc.zoho?.bigin || {};

    if (!zohoInfo || (!zohoInfo.url && !zohoInfo.downloadUrl)) {
      return res.status(400).json({
        error: "no_pdf",
        detail: "No PDF available for this document. It may be a draft that hasn't been finalized yet.",
      });
    }

    const buf = await fetchZohoPdfFromBigin(zohoInfo);
    if (!buf) {
      return res.status(502).json({
        error: "upstream_error",
        detail: "Failed to download PDF from Zoho Bigin",
      });
    }

    // Extract customer name from headerRows or customerName field
    const customerName = extractCustomerNameFromDoc(doc);
    const filename = `${customerName}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${filename}"`
    );
    res.send(buf);
  } catch (err) {
    console.error("downloadCustomerHeaderPdf error:", err);
    res
      .status(500)
      .json({ error: "server_error", detail: err?.message || String(err) });
  }
}

// Helper function to extract customer name from document
function extractCustomerNameFromDoc(doc) {
  // Try customerName field first (from frontend payload)
  if (doc.payload?.customerName && doc.payload.customerName.trim()) {
    return sanitizeFilename(doc.payload.customerName.trim());
  }

  // Fallback: search in headerRows for CUSTOMER NAME field
  const headerRows = doc.payload?.headerRows || [];
  for (const row of headerRows) {
    // Check left side
    if (row.labelLeft && row.labelLeft.toUpperCase().includes("CUSTOMER NAME")) {
      const name = row.valueLeft?.trim();
      if (name) return sanitizeFilename(name);
    }
    // Check right side
    if (row.labelRight && row.labelRight.toUpperCase().includes("CUSTOMER NAME")) {
      const name = row.valueRight?.trim();
      if (name) return sanitizeFilename(name);
    }
  }

  // Default fallback
  return "Unnamed_Customer";
}

// Helper to sanitize filename (remove special characters)
function sanitizeFilename(name) {
  return name
    .replace(/[^a-zA-Z0-9-_\s]+/g, "_") // Replace special chars with underscore
    .replace(/\s+/g, "_") // Replace spaces with underscore
    .substring(0, 80); // Limit length
}

