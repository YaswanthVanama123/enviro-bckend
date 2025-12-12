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

import { uploadToZohoBigin, getZohoAccessToken, testZohoAccess, runZohoDiagnostics, testLayoutPipelineDetection, getOrCreateContactForDeal, getBiginContactsByAccount, testV9SimplePipelineDetection, testV10LayoutPipelineCompatibility } from "../services/zohoService.js";

import CustomerHeaderDoc from "../models/CustomerHeaderDoc.js";
import AdminHeaderDoc from "../models/AdminHeaderDoc.js";
import ServiceConfig from "../models/ServiceConfig.js";

/* ------------ health + low-level compile endpoints ------------ */

export async function pdfHealth(_req, res) {
  const info = await getPdfHealth();
  res.json(info);
}

// ✅ NEW: Test endpoint to verify Zoho API integration
export async function testZohoAccessEndpoint(_req, res) {
  try {
    console.log("🧪 [TEST-ENDPOINT] Testing Zoho access...");
    await testZohoAccess();

    res.json({
      success: true,
      message: "Zoho access test completed - check server logs for detailed results"
    });
  } catch (error) {
    console.error("❌ [TEST-ENDPOINT] Zoho access test failed:", error);
    res.status(500).json({
      success: false,
      error: "Zoho access test failed",
      detail: error.message
    });
  }
}

// ✅ V7: Comprehensive Zoho diagnostics endpoint
export async function runZohoDiagnosticsEndpoint(_req, res) {
  try {
    console.log("🧪 [DIAGNOSTICS-ENDPOINT] Running comprehensive Zoho diagnostics...");
    const results = await runZohoDiagnostics();

    res.json({
      success: true,
      message: "Zoho diagnostics completed - check server logs for detailed results",
      results: results
    });
  } catch (error) {
    console.error("❌ [DIAGNOSTICS-ENDPOINT] Zoho diagnostics failed:", error);
    res.status(500).json({
      success: false,
      error: "Zoho diagnostics failed",
      detail: error.message
    });
  }
}

// ✅ V10: Layout+Pipeline compatibility test endpoint
export async function testV10CompatibilityEndpoint(_req, res) {
  try {
    console.log("🧪 [V10-TEST-ENDPOINT] Testing V10 Layout+Pipeline compatibility matching...");
    const results = await testV10LayoutPipelineCompatibility();

    res.json({
      success: true,
      message: "V10 Layout+Pipeline compatibility test completed - check server logs for detailed results",
      results: results
    });
  } catch (error) {
    console.error("❌ [V10-TEST-ENDPOINT] V10 compatibility test failed:", error);
    res.status(500).json({
      success: false,
      error: "V10 compatibility test failed",
      detail: error.message
    });
  }
}
export async function testV9SimplePipelineEndpoint(_req, res) {
  try {
    console.log("🧪 [V9-TEST-ENDPOINT] Testing V9 Simple Pipeline detection...");
    const results = await testV9SimplePipelineDetection();

    res.json({
      success: true,
      message: "V9 Simple Pipeline test completed - check server logs for detailed results",
      results: results
    });
  } catch (error) {
    console.error("❌ [V9-TEST-ENDPOINT] V9 Simple Pipeline test failed:", error);
    res.status(500).json({
      success: false,
      error: "V9 Simple Pipeline test failed",
      detail: error.message
    });
  }
}
export async function testV7LayoutPipelineEndpoint(_req, res) {
  try {
    console.log("🧪 [V7-TEST-ENDPOINT] Testing V7 Layout+Pipeline detection...");
    const results = await testLayoutPipelineDetection();

    res.json({
      success: true,
      message: "V7 Layout+Pipeline test completed - check server logs for detailed results",
      results: results
    });
  } catch (error) {
    console.error("❌ [V7-TEST-ENDPOINT] V7 Layout+Pipeline test failed:", error);
    res.status(500).json({
      success: false,
      error: "V7 Layout+Pipeline test failed",
      detail: error.message
    });
  }
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
    let status = body.status || "saved"; // Default to "saved" instead of "draft"
    const isDraft = status === "draft";

    // Prepare payload structure
    const payload = {
      headerTitle: body.headerTitle || "",
      headerRows: body.headerRows || [],
      products: body.products || {},
      services: body.services || {},
      agreement: body.agreement || {},
    };

    // DEBUG: Log the products structure being sent from frontend
    // console.log("🐛 [DEBUG] Products payload structure:", JSON.stringify(body.products, null, 2));
    // console.log("🐛 [DEBUG] Custom columns from products:", JSON.stringify(body.products?.customColumns, null, 2));

    // DEBUG: Log the services structure being sent from frontend
    // console.log("🐛 [DEBUG] Services payload structure:", JSON.stringify(body.services, null, 2));
    if (body.services?.refreshPowerScrub) {
      // console.log("🐛 [DEBUG] REFRESH POWER SCRUB - Full service data:", JSON.stringify(body.services.refreshPowerScrub, null, 2));
      if (body.services.refreshPowerScrub.services) {
        // console.log("🐛 [DEBUG] REFRESH POWER SCRUB - Services breakdown:", JSON.stringify(body.services.refreshPowerScrub.services, null, 2));
      }
    }
    if (body.products) {
      // Check for NEW 2-category format (products[] + dispensers[])
      if (body.products.products && body.products.dispensers) {
        // console.log("🐛 [DEBUG] NEW FORMAT - Product counts:", {
        //   mergedProducts: (body.products.products || []).length,
        //   dispensers: (body.products.dispensers || []).length
        // });
        // console.log("🐛 [DEBUG] Sample merged product:", body.products.products[0]);
        // console.log("🐛 [DEBUG] Sample dispenser:", body.products.dispensers[0]);
      }
      // Check for OLD 3-category format (for backward compatibility)
      else if (body.products.smallProducts || body.products.bigProducts || body.products.dispensers) {
        // console.log("🐛 [DEBUG] OLD FORMAT - Product counts:", {
        //   smallProducts: (body.products.smallProducts || []).length,
        //   bigProducts: (body.products.bigProducts || []).length,
        //   dispensers: (body.products.dispensers || []).length
        // });
      }
      else {
        // console.log("🐛 [DEBUG] UNKNOWN FORMAT - Product keys:", Object.keys(body.products));
      }
    }

    let buffer = null;
    let filename = "customer-header.pdf";
    let zohoData = {
      bigin: { dealId: null, fileId: null, url: null },
      crm: { dealId: null, fileId: null, url: null },
    };

    // ✅ FIXED: Define at function scope
    let zohoUploadSuccess = false;
    let zohoErrors = []; // ✅ FIXED: Define at function scope

    // If NOT a draft, compile PDF and upload to Zoho
    if (!isDraft) {
      // console.log("Compiling PDF for final save...");
      const pdfResult = await compileCustomerHeader(payload);
      buffer = pdfResult.buffer;
      filename = pdfResult.filename || filename;

      // Track upload success for better error handling
      // zohoErrors already declared at function scope

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

        // ✅ FIXED: Check for valid file ID instead of URL (Zoho Bigin doesn't return direct URLs)
        if (biginResult.fileId && biginResult.fileId.length > 10 && !biginResult.fileId.includes('MOCK_')) {
          zohoUploadSuccess = true;
          console.log("✅ Zoho Bigin upload successful:", biginResult.fileId);
        } else {
          console.log("⚠️ Zoho Bigin upload failed - No valid file ID received");
        }
      } catch (zohoErr) {
        console.error("❌ Zoho Bigin upload failed:", zohoErr.message);
        zohoErrors.push(`Bigin: ${zohoErr.message}`);
        // Continue even if Zoho fails
      }

      // Upload to Zoho CRM (if needed)
      // try {
      //   console.log("Uploading to Zoho CRM...");
      //   const crmResult = await uploadToZohoCRM(
      //     buffer,
      //     filename,
      //     body.zoho?.crm?.dealId || null
      //   );
      //   zohoData.crm = {
      //     dealId: crmResult.dealId,
      //     fileId: crmResult.fileId,
      //     url: crmResult.url,
      //   };

      //   // ✅ FIXED: Only consider successful if we have a real URL
      //   if (crmResult.url && !crmResult.url.includes('null')) {
      //     zohoUploadSuccess = true;
      //     console.log("✅ Zoho CRM upload successful:", crmResult.fileId);
      //   } else {
      //     console.log("⚠️ Zoho CRM returned mock data (no real URL)");
      //   }
      // } catch (zohoErr) {
      //   console.error("❌ Zoho CRM upload failed:", zohoErr.message);
      //   zohoErrors.push(`CRM: ${zohoErr.message}`);
      //   // Continue even if Zoho fails
      // }

      // 🚫 CRM upload temporarily disabled (scope mismatch)
// Prevent CRM failure from blocking Bigin success
console.log("⏭️ Skipping Zoho CRM upload — waiting for correct scopes");
zohoData.crm = { dealId: null, fileId: null, url: null };

      // ✅ NEW: Handle Zoho upload failures - force draft status
      // if (!zohoUploadSuccess) {
      //   console.warn("⚠️  WARNING: All Zoho uploads failed. Forcing status to draft.");
      //   console.warn("Errors:", zohoErrors);

      //   // ✅ FORCE DRAFT STATUS: If Zoho fails, always save as draft regardless of user input
      //   status = "draft";
      //   console.log("🔧 [ZOHO-FAILURE] Forcing document status to 'draft' due to Zoho upload failure");
      // }
      // Only force draft if Bigin also failed.
// CRM is ignored for now.
if (!zohoData.bigin?.url || zohoData.bigin.url.includes("null")) {
  status = "draft";
}

    }

    // DEBUG: Log the full payload before storing to database
    // console.log("🐛 [DEBUG] PAYLOAD BEFORE STORAGE:", JSON.stringify(payload, null, 2));
    // console.log("🐛 [DEBUG] PAYLOAD SERVICES KEYS:", Object.keys(payload.services || {}));

    // Create document in database
    const doc = await CustomerHeaderDoc.create({
      payload,
      pdf_meta: buffer
        ? {
            sizeBytes: buffer.length,
            contentType: "application/pdf",
            storedAt: new Date(),
            pdfBuffer: buffer, // ✅ STORE PDF in MongoDB as Buffer (not base64)
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

    // ✅ Log PDF storage confirmation
    if (buffer) {
      console.log(`✅ PDF stored in MongoDB: ${doc._id} (${buffer.length} bytes → ${doc.pdf_meta.sizeBytes} bytes base64)`);
    } else {
      console.log(`📝 Document created without PDF: ${doc._id} (draft mode)`);
    }

    // console.log(`Document created with ID: ${doc._id}, status: ${status}`);

    // DEBUG: Log what was actually stored in the database
    const storedDoc = await CustomerHeaderDoc.findById(doc._id).lean();
    // console.log("🐛 [DEBUG] STORED DOC SERVICES:", JSON.stringify(storedDoc.payload.services, null, 2));
    if (storedDoc.payload.services?.refreshPowerScrub) {
      // console.log("🐛 [DEBUG] STORED REFRESH POWER SCRUB:", JSON.stringify(storedDoc.payload.services.refreshPowerScrub, null, 2));
    }

    // ✅ NEW: Return response based on Zoho upload success
    // If Zoho uploads failed, return error response (keeps user in same place)
    if (!isDraft && !zohoUploadSuccess) {
      console.log("❌ [ZOHO-FAILURE] Returning error response to keep user in current form");
      res.setHeader("X-CustomerHeaderDoc-Id", doc._id.toString());
      return res.status(422).json({
        success: false,
        error: "zoho_upload_failed",
        message: "Document saved as draft due to file upload issues. Please try again or contact support.",
        detail: "Zoho CRM upload failed. Document has been saved as draft for your safety.",
        _id: doc._id.toString(),
        status: doc.status, // Will be "draft"
        createdAt: doc.createdAt,
        zohoErrors: zohoErrors
      });
    }

    // Return response based on draft or final (original logic for successful cases)
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
      // Final: Return PDF with metadata in header (only when Zoho succeeded)
      console.log("✅ [ZOHO-SUCCESS] Returning PDF response - redirecting to saved files");
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
      // console.log('⚠️ Database not connected, returning empty list for PDF testing');
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
      // console.log('⚠️ Database not connected, returning mock data for PDF testing');
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

// GET /api/pdf/customer-headers/:id/edit-format
// Special endpoint that converts stored data to frontend-expected format for editing
export async function getCustomerHeaderForEdit(req, res) {
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

    console.log(`🔄 [EDIT FORMAT] Converting document for edit mode - ID: ${id}`);

    // Convert stored format to edit-friendly format while preserving ALL data
    const originalProducts = doc.payload?.products || {};

    // console.log(`🔄 [EDIT FORMAT] Original storage format detected:`, {
    //   hasProducts: !!(originalProducts.products),
    //   hasSmallProducts: !!(originalProducts.smallProducts),
    //   hasBigProducts: !!(originalProducts.bigProducts),
    //   hasDispensers: !!(originalProducts.dispensers),
    //   hasCustomColumns: !!(originalProducts.customColumns),
    //   customColumnsContent: originalProducts.customColumns,
    //   productsCount: (originalProducts.products || []).length,
    //   smallProductsCount: (originalProducts.smallProducts || []).length,
    //   bigProductsCount: (originalProducts.bigProducts || []).length,
    //   dispensersCount: (originalProducts.dispensers || []).length
    // });

    let mergedProductsArray = [];

    // Handle NEW format (products[] array exists)
    if (originalProducts.products && Array.isArray(originalProducts.products)) {
      // console.log(`🆕 [EDIT FORMAT] Using NEW format - found ${originalProducts.products.length} products in merged array`);
      mergedProductsArray = originalProducts.products.map(p => ({
        ...p,
        // Preserve existing _productType or infer from product structure
        _productType: p._productType || (p.amount !== undefined ? 'big' : 'small'),
        // Ensure all critical fields are preserved
        productKey: p.productKey,
        customName: p.customName || p.displayName,
        displayName: p.displayName || p.customName,
        qty: p.qty || 0,
        // Handle both small product (unitPrice) and big product (amount) fields
        unitPrice: p.unitPrice,
        unitPriceOverride: p.unitPriceOverride,
        amount: p.amount,
        amountOverride: p.amountOverride,
        frequency: p.frequency || '', // ← PRESERVE frequency
        total: p.total || p.extPrice,
        extPrice: p.extPrice || p.total
      }));
    }
    // Handle OLD format (smallProducts[] + bigProducts[] arrays exist)
    else {
      // console.log(`🔄 [EDIT FORMAT] Using OLD format - merging ${(originalProducts.smallProducts || []).length} small + ${(originalProducts.bigProducts || []).length} big products`);
      mergedProductsArray = [
        ...(originalProducts.smallProducts || []).map(p => ({
          ...p,
          _productType: 'small',
          // Ensure all critical fields are preserved
          productKey: p.productKey,
          customName: p.customName || p.displayName,
          displayName: p.displayName || p.customName,
          qty: p.qty || 0,
          unitPrice: p.unitPrice,
          unitPriceOverride: p.unitPriceOverride,
          frequency: p.frequency || '', // ← PRESERVE frequency
          total: p.total || p.extPrice,
          extPrice: p.extPrice || p.total
        })),
        ...(originalProducts.bigProducts || []).map(p => ({
          ...p,
          _productType: 'big',
          // Ensure all critical fields are preserved
          productKey: p.productKey,
          customName: p.customName || p.displayName,
          displayName: p.displayName || p.customName,
          qty: p.qty || 0,
          amount: p.amount,
          amountOverride: p.amountOverride,
          frequency: p.frequency || '', // ← PRESERVE frequency
          total: p.total
        }))
      ];
    }

    const convertedProducts = {
      // Use the merged products array
      products: mergedProductsArray,
      // Keep dispensers separate with enhanced data preservation
      dispensers: (originalProducts.dispensers || []).map(d => ({
        ...d,
        _productType: 'dispenser',
        // Ensure all critical fields are preserved for dispensers
        productKey: d.productKey,
        customName: d.customName || d.displayName,
        displayName: d.displayName || d.customName,
        qty: d.qty || 0,
        warrantyRate: d.warrantyRate,
        warrantyPriceOverride: d.warrantyPriceOverride,
        replacementRate: d.replacementRate,
        replacementPriceOverride: d.replacementPriceOverride,
        frequency: d.frequency || '', // ← CRITICAL: PRESERVE dispenser frequency
        total: d.total
      }))
    };

    // Log frequency preservation for debugging
    // console.log(`🔄 [EDIT FORMAT] Dispenser frequency preservation:`);
    convertedProducts.dispensers.forEach((d, i) => {
      // console.log(`  Dispenser ${i+1}: "${d.customName}" → frequency: "${d.frequency}"`);
    });

    // SERVICES TRANSFORMATION: Convert stored format to form-expected format
    const originalServices = doc.payload?.services || {};
    const convertedServices = { ...originalServices };

    // Special handling for Refresh Power Scrub
    if (originalServices.refreshPowerScrub && originalServices.refreshPowerScrub.services) {
      // console.log(`🔄 [EDIT FORMAT] Converting Refresh Power Scrub from stored format to form format`);

      const storedRPS = originalServices.refreshPowerScrub;
      // console.log(`🔄 [EDIT FORMAT] Stored services keys:`, Object.keys(storedRPS.services || {}));

      // Helper function to normalize frequency labels
      const normalizeFrequencyLabel = (freq) => {
        if (!freq || freq === "TBD") return "";
        const normalized = freq.toLowerCase();
        if (normalized.includes("bi-weekly") || normalized.includes("biweekly")) return "Bi-weekly";
        if (normalized.includes("quarterly")) return "Quarterly";
        if (normalized.includes("monthly")) return "Monthly";
        if (normalized.includes("weekly")) return "Weekly";
        return freq; // Return as-is if no match
      };

      // Extract actual stored values from serviceInfo if available
      let hourlyRate = 200;
      let minimumVisit = 400;
      if (storedRPS.serviceInfo && storedRPS.serviceInfo.value) {
        const serviceInfoStr = storedRPS.serviceInfo.value;
        const hourlyMatch = serviceInfoStr.match(/Hourly Rate: \$(\d+)/);
        const minMatch = serviceInfoStr.match(/Minimum: \$(\d+)/);
        if (hourlyMatch) hourlyRate = parseInt(hourlyMatch[1]);
        if (minMatch) minimumVisit = parseInt(minMatch[1]);
      }

      const convertedRPS = {
        serviceId: storedRPS.serviceId,
        displayName: storedRPS.displayName,
        isActive: storedRPS.isActive,
        // Extract actual stored values
        hourlyRate: hourlyRate,
        minimumVisit: minimumVisit,
        frequency: "monthly", // Default - could be enhanced to extract from data
        contractMonths: 12, // Default - could be enhanced to extract from data
        notes: storedRPS.notes || "",
        customFields: storedRPS.customFields || []
      };

      // Convert each area from services structure back to direct area structure
      const areaMapping = {
        'dumpster': 'dumpster',
        'patio': 'patio',
        'frontHouse': 'foh',
        'backHouse': 'boh',
        'walkway': 'walkway',
        'other': 'other'
      };

      for (const [serviceKey, areaKey] of Object.entries(areaMapping)) {
        // console.log(`🔄 [EDIT FORMAT] Checking ${serviceKey} → ${areaKey}`);
        if (storedRPS.services[serviceKey] && storedRPS.services[serviceKey].enabled) {
          // console.log(`🔄 [EDIT FORMAT] Processing enabled area: ${serviceKey} → ${areaKey}`);
          const serviceData = storedRPS.services[serviceKey];
          // console.log(`🔄 [EDIT FORMAT] Service data for ${serviceKey}:`, JSON.stringify(serviceData, null, 2));

          // Map pricing method back to form format
          const pricingTypeMapping = {
            'Per Hour': 'perHour',
            'Per Worker': 'perWorker',
            'Square Feet': 'squareFeet',
            'Preset Package': 'preset',
            'Custom Amount': 'custom'
          };

          const pricingType = pricingTypeMapping[serviceData.pricingMethod?.value] || 'preset';

          const convertedArea = {
            enabled: true,
            pricingType: pricingType,

            // Per Worker fields
            workers: 2, // Default

            // Per Hour fields
            hours: 0, // Default
            hourlyRate: 200, // Default

            // Square Feet fields
            insideSqFt: 0, // Default
            outsideSqFt: 0, // Default
            insideRate: 0.6, // Default
            outsideRate: 0.4, // Default
            sqFtFixedFee: 200, // Default

            // Custom Amount field
            customAmount: 0, // Default

            // Area-specific fields
            kitchenSize: "smallMedium", // Default (for boh)
            patioMode: "standalone", // Default (for patio)
            includePatioAddon: false, // Default (for patio)

            // Frequency and contract with normalized values
            frequencyLabel: normalizeFrequencyLabel(serviceData.frequency?.value || "TBD"),
            contractMonths: serviceData.contract?.quantity || 12
          };

          // Extract specific values based on pricing type
          if (pricingType === 'perHour' && serviceData.hours) {
            convertedArea.hours = Number(serviceData.hours.quantity) || 0;
            convertedArea.hourlyRate = Number(serviceData.hours.priceRate) || 200;
          } else if (pricingType === 'perWorker' && serviceData.workersCalc) {
            convertedArea.workers = Number(serviceData.workersCalc.quantity) || 0;
          } else if (pricingType === 'squareFeet') {
            if (serviceData.fixedFee) {
              convertedArea.sqFtFixedFee = Number(serviceData.fixedFee.value) || 200;
            }
            if (serviceData.insideSqft) {
              convertedArea.insideSqFt = Number(serviceData.insideSqft.quantity) || 0;
              convertedArea.insideRate = Number(serviceData.insideSqft.priceRate) || 0.6;
            }
            if (serviceData.outsideSqft) {
              convertedArea.outsideSqFt = Number(serviceData.outsideSqft.quantity) || 0;
              convertedArea.outsideRate = Number(serviceData.outsideSqft.priceRate) || 0.4;
            }
          } else if (pricingType === 'preset') {
            if (serviceData.plan) {
              if (areaKey === 'patio') {
                convertedArea.patioMode = serviceData.plan.value === 'Upsell' ? 'upsell' : 'standalone';
                // ✅ Extract patio add-on selection from stored data
                if (serviceData.includePatioAddon) {
                  convertedArea.includePatioAddon = serviceData.includePatioAddon.value || false;
                }
                // console.log(`🔄 [EDIT FORMAT] Patio conversion: patioMode=${convertedArea.patioMode}, includePatioAddon=${convertedArea.includePatioAddon}`);
              } else if (areaKey === 'boh') {
                convertedArea.kitchenSize = serviceData.plan.value === 'Large' ? 'large' : 'smallMedium';
              }
            }
          } else if (pricingType === 'custom' && serviceData.total) {
            convertedArea.customAmount = Number(serviceData.total.value) || 0;
          }

          convertedRPS[areaKey] = convertedArea;

          // console.log(`🔄 [EDIT FORMAT] Converted ${serviceKey} → ${areaKey}:`, {
          //   enabled: convertedArea.enabled,
          //   pricingType: convertedArea.pricingType,
          //   frequency: convertedArea.frequencyLabel,
          //   converted: convertedArea
          // });
        }
      }

      // Add default disabled areas with all required fields
      const defaultAreas = ['dumpster', 'patio', 'walkway', 'foh', 'boh', 'other'];
      for (const areaKey of defaultAreas) {
        if (!convertedRPS[areaKey]) {
          convertedRPS[areaKey] = {
            enabled: false,
            pricingType: "preset",

            // Per Worker fields
            workers: 2,

            // Per Hour fields
            hours: 0,
            hourlyRate: 200,

            // Square Feet fields
            insideSqFt: 0,
            outsideSqFt: 0,
            insideRate: 0.6,
            outsideRate: 0.4,
            sqFtFixedFee: 200,

            // Custom Amount field
            customAmount: 0,

            // Area-specific fields
            kitchenSize: "smallMedium",
            patioMode: "standalone",
            includePatioAddon: false, // ✅ NEW: Patio add-on selection

            // Frequency and contract
            frequencyLabel: "",
            contractMonths: 12
          };
        }
      }

      convertedServices.refreshPowerScrub = convertedRPS;
      // console.log(`✅ [EDIT FORMAT] Refresh Power Scrub conversion complete`);
      // console.log(`🔄 [EDIT FORMAT] Final converted RPS:`, JSON.stringify(convertedRPS, null, 2));
    }

    // Create edit-friendly response AFTER services transformation
    const editResponse = {
      ...doc,
      payload: {
        ...doc.payload,
        products: {
          ...convertedProducts,
          customColumns: originalProducts.customColumns || { products: [], dispensers: [] } // Include custom columns inside products
        },
        services: convertedServices, // Use converted services instead of original
      },
      _editFormatMetadata: {
        originalStructure: {
          // Show actual detected format
          format: originalProducts.products ? 'NEW (merged products array)' : 'OLD (separate small/big arrays)',
          products: (originalProducts.products || []).length,
          smallProducts: (originalProducts.smallProducts || []).length,
          dispensers: (originalProducts.dispensers || []).length,
          bigProducts: (originalProducts.bigProducts || []).length
        },
        convertedStructure: {
          products: convertedProducts.products.length,
          dispensers: convertedProducts.dispensers.length
        },
        productFrequencyPreservation: convertedProducts.products.map(p => ({
          name: p.customName || p.displayName,
          frequency: p.frequency,
          hasFrequency: !!p.frequency,
          productType: p._productType
        })),
        dispenserFrequencyPreservation: convertedProducts.dispensers.map(d => ({
          name: d.customName,
          frequency: d.frequency,
          hasFrequency: !!d.frequency
        })),
        conversionTime: new Date().toISOString()
      }
    };

    // console.log(`✅ [EDIT FORMAT] Conversion complete - preserved ${convertedProducts.products.length} products and ${convertedProducts.dispensers.length} dispensers with frequencies`);

    // Log product frequency preservation for debugging
    if (convertedProducts.products.length > 0) {
      // console.log(`🔄 [EDIT FORMAT] Product frequency preservation:`);
      convertedProducts.products.forEach((p, i) => {
        // console.log(`  Product ${i+1}: "${p.customName || p.displayName}" (${p._productType}) → frequency: "${p.frequency}"`);
      });
    }

    // Log dispenser frequency preservation for debugging
    if (convertedProducts.dispensers.length > 0) {
      // console.log(`🔄 [EDIT FORMAT] Dispenser frequency preservation:`);
      convertedProducts.dispensers.forEach((d, i) => {
        // console.log(`  Dispenser ${i+1}: "${d.customName}" → frequency: "${d.frequency}"`);
      });
    }

    // Debug: Show what customColumns are being returned
    // console.log(`🔍 [EDIT FORMAT] CustomColumns debug:`, {
    //   originalCustomColumns: originalProducts.customColumns,
    //   returnedCustomColumns: originalProducts.customColumns || { products: [], dispensers: [] },
    //   willIncludeInResponse: !!(originalProducts.customColumns),
    //   editResponseCustomColumns: editResponse.payload.products.customColumns
    // });

    res.json(editResponse);
  } catch (err) {
    console.error("getCustomerHeaderForEdit error:", err);
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

    // DEBUG: Log services data for updates
    // console.log("🐛 [UPDATE DEBUG] Services payload structure:", JSON.stringify(body.services, null, 2));
    if (body.services?.refreshPowerScrub) {
      // console.log("🐛 [UPDATE DEBUG] REFRESH POWER SCRUB - Full service data:", JSON.stringify(body.services.refreshPowerScrub, null, 2));
      if (body.services.refreshPowerScrub.services) {
        // console.log("🐛 [UPDATE DEBUG] REFRESH POWER SCRUB - Services breakdown:", JSON.stringify(body.services.refreshPowerScrub.services, null, 2));
      }
    }

    // Update payload fields
    doc.payload ||= {};
    if (body.headerTitle !== undefined) doc.payload.headerTitle = body.headerTitle;
    if (body.headerRows !== undefined) doc.payload.headerRows = body.headerRows;
    if (body.products !== undefined) doc.payload.products = body.products;
    if (body.services !== undefined) doc.payload.services = body.services;
    if (body.agreement !== undefined) doc.payload.agreement = body.agreement;
    if (body.customColumns !== undefined) doc.payload.customColumns = body.customColumns; // Update custom columns
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
      // console.log('🔍 [DEBUG] Database doc.payload.products:', JSON.stringify(doc.payload.products, null, 2));
      if (body.products) {
        // console.log('🔍 [DEBUG] Frontend body.products:', JSON.stringify(body.products, null, 2));
      }

      const productsData = body.products || doc.payload.products;
      // console.log('🔍 [DEBUG] Using products data from:', body.products ? 'FRONTEND PAYLOAD' : 'STORED DATABASE');
      // console.log('🔍 [DEBUG] Final products data structure:', JSON.stringify(productsData, null, 2));

      const pdfResult = await compileCustomerHeader({
        headerTitle: doc.payload.headerTitle,
        headerRows: doc.payload.headerRows,
        products: productsData,  // Use the determined data source
        services: body.services || doc.payload.services,
        agreement: doc.payload.agreement,
        customColumns: doc.payload.products?.customColumns || body.products?.customColumns || { products: [], dispensers: [] }, // Pass custom columns from products section
      });

      buffer = pdfResult.buffer;
      filename = pdfResult.filename || filename;

      // ✅ SIMPLIFIED: Only store PDF in MongoDB during updates (no Zoho upload)
      // Zoho upload only happens during initial "Save & Generate PDF" action

      // Update PDF metadata
      doc.pdf_meta = {
        sizeBytes: buffer.length,
        contentType: "application/pdf",
        storedAt: new Date(),
        pdfBuffer: buffer, // ✅ STORE PDF in MongoDB as Buffer (not base64)
        externalUrl: doc.pdf_meta?.externalUrl || null,
      };

      // ✅ Log PDF storage confirmation
      console.log(`✅ PDF updated in MongoDB: ${doc._id} (${buffer.length} bytes → ${doc.pdf_meta.sizeBytes} bytes Buffer)`);
    }

    await doc.save();

    console.log(`Document ${id} updated, status: ${doc.status}, compiled: ${shouldCompilePdf}`);

    // DEBUG: Log what was actually saved in the update
    const updatedDoc = await CustomerHeaderDoc.findById(id).lean();
    // console.log("🐛 [UPDATE DEBUG] UPDATED DOC SERVICES:", JSON.stringify(updatedDoc.payload.services, null, 2));
    if (updatedDoc.payload.services?.refreshPowerScrub) {
      // console.log("🐛 [UPDATE DEBUG] UPDATED REFRESH POWER SCRUB:", JSON.stringify(updatedDoc.payload.services.refreshPowerScrub, null, 2));
    }

    // ✅ SIMPLIFIED: Return response based on whether PDF was compiled (no Zoho dependency)
    if (buffer) {
      // Return PDF if compiled successfully
      console.log("✅ [UPDATE SUCCESS] Returning PDF response");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      return res.send(buffer);
    } else {
      // Return JSON for non-PDF updates
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

    // console.log(`Document ${id} status updated to: ${status}`);

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
        customColumns: doc.products?.customColumns || { products: [], dispensers: [] }, // Add custom columns from products section
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

  const fileId = zohoInfo.fileId;
  const dealId = zohoInfo.dealId;

  if (!fileId || !dealId) {
    console.log("❌ Missing fileId or dealId in zohoInfo:", { fileId, dealId });
    return null;
  }

  try {
    const token = await getZohoAccessToken();
    // ✅ Use the correct base URL that was discovered
    const baseUrl = process.env.ZOHO_BIGIN_WORKING_URL || "https://bigin.zoho.in/api/v2";

    console.log("📥 Downloading PDF from Zoho Bigin deals/attachments...");
    console.log("🌍 Using base URL:", baseUrl);
    console.log("📎 File ID:", fileId);
    console.log("🏢 Deal ID:", dealId);

    // ✅ CORRECT: Use exact structure with correct base URL
    const downloadUrl = `${baseUrl}/deals/${dealId}/attachments/${fileId}`;

    console.log(`📥 Downloading from: ${downloadUrl}`);
    const resp = await axios.get(downloadUrl, {
      responseType: "arraybuffer",
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });

    console.log("✅ PDF downloaded successfully from deals/attachments");
    return Buffer.from(resp.data);

  } catch (error) {
    console.error("❌ Failed to download PDF from Zoho deals/attachments:", error.message);
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Response data:", error.response.data);
    }
    return null;
  }
}

// Helper function to extract file ID from URL
function extractFileIdFromUrl(url) {
  if (!url) return null;

  // Extract file ID from various URL patterns
  const patterns = [
    /\/files\/([a-f0-9]+)/i,
    /\/attachments\/([a-f0-9]+)/i,
    /fileId[=:]([a-f0-9]+)/i,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
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

    // ✅ FIXED: Get PDF from MongoDB instead of Zoho
    if (doc.pdf_meta?.pdfBuffer && doc.pdf_meta.pdfBuffer.length > 0) {
      console.log(`📄 [PDF-VIEWER] Serving PDF from MongoDB for document ${id} (${doc.pdf_meta.sizeBytes} bytes)`);
      pdfBase64 = doc.pdf_meta.pdfBuffer.toString("base64");
      pdfContentType = doc.pdf_meta.contentType || "application/pdf";
    } else {
      console.log(`⚠️ [PDF-VIEWER] No PDF buffer found in MongoDB for document ${id}`);
      console.log(`📊 Document info: status=${doc.status}, hasPdfMeta=${!!doc.pdf_meta}, bufferSize=${doc.pdf_meta?.pdfBuffer?.length || 0}`);
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

    // ✅ FIXED: Get PDF from MongoDB instead of Zoho
    if (!doc.pdf_meta?.pdfBuffer || doc.pdf_meta.pdfBuffer.length === 0) {
      console.error(`❌ [PDF-DOWNLOAD] No PDF buffer in MongoDB for document ${id}:`, {
        status: doc.status,
        hasPdfMeta: !!doc.pdf_meta,
        bufferSize: doc.pdf_meta?.pdfBuffer?.length || 0,
        createdAt: doc.createdAt
      });

      return res.status(400).json({
        error: "no_pdf",
        detail: "PDF not available for download. This can happen if: (1) Document is still a draft, (2) PDF compilation failed during creation, or (3) Document was created without generating PDF. Please try regenerating the PDF.",
        suggestions: [
          "Edit the document and save again to regenerate PDF",
          "Check if document status is 'draft'",
          "Contact admin if problem persists"
        ],
        documentInfo: {
          id: doc._id,
          status: doc.status,
          title: doc.payload?.headerTitle || 'Untitled',
          createdAt: doc.createdAt,
          hasPdfBuffer: !!doc.pdf_meta?.pdfBuffer,
          pdfBufferSize: doc.pdf_meta?.pdfBuffer?.length || 0
        }
      });
    }

    console.log(`📄 [PDF-DOWNLOAD] Serving PDF from MongoDB for document ${id} (${doc.pdf_meta.sizeBytes} bytes)`);

    // Extract customer name from headerRows or customerName field
    const customerName = extractCustomerNameFromDoc(doc);
    const filename = `${customerName}.pdf`;

    res.setHeader("Content-Type", doc.pdf_meta.contentType || "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${filename}"`
    );
    res.send(doc.pdf_meta.pdfBuffer);

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

/* ------------ NEW SAVED-FILES API (Lazy Loading) ------------ */

// GET /api/pdf/saved-files (lightweight list - high level data only)
export async function getSavedFilesList(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit || "20", 10), 1),
      100
    );

    // Check if we're in development mode without database
    if (mongoose.connection.readyState === 0) {
      console.log('⚠️ Database not connected, returning empty list for saved files');
      return res.json({
        total: 0,
        page,
        limit,
        files: []
      });
    }

    const filter = {};

    // Optional filters
    if (req.query.status) {
      filter.status = req.query.status;
    }
    if (req.query.search) {
      filter['payload.headerTitle'] = {
        $regex: req.query.search,
        $options: 'i'
      };
    }

    const total = await CustomerHeaderDoc.countDocuments(filter);

    // ✅ LIGHTWEIGHT QUERY: Only fetch minimal fields needed for list view
    const files = await CustomerHeaderDoc.find(filter)
      .select({
        _id: 1,
        status: 1,
        createdAt: 1,
        updatedAt: 1,
        createdBy: 1,
        updatedBy: 1,
        'payload.headerTitle': 1,
        'pdf_meta.sizeBytes': 1,
        'pdf_meta.storedAt': 1,
        'pdf_meta.pdfBuffer': 1,
        'zoho.bigin.dealId': 1,
        'zoho.bigin.fileId': 1,
        'zoho.crm.dealId': 1,
        'zoho.crm.fileId': 1,
      })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // Transform to consistent format
    const transformedFiles = files.map(file => ({
      id: file._id,
      title: file.payload?.headerTitle || 'Untitled Document',
      status: file.status,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      createdBy: file.createdBy,
      updatedBy: file.updatedBy,
      fileSize: file.pdf_meta?.sizeBytes || 0,
      pdfStoredAt: file.pdf_meta?.storedAt || null,
      hasPdf: !!(
        // Check for Zoho fileId (valid, non-mock)
        (file.zoho?.bigin?.fileId && !file.zoho.bigin.fileId.includes('MOCK_')) ||
        (file.zoho?.crm?.fileId && !file.zoho.crm.fileId.includes('MOCK_')) ||
        // OR check for PDF stored in MongoDB
        file.pdf_meta?.pdfBuffer
      ),
      isEditable: file.status === 'draft' || file.status === 'saved',
      zohoInfo: {
        biginDealId: file.zoho?.bigin?.dealId || null,
        biginFileId: file.zoho?.bigin?.fileId || null,
        crmDealId: file.zoho?.crm?.dealId || null,
        crmFileId: file.zoho?.crm?.fileId || null,
      }
    }));

    console.log(`📄 [SAVED-FILES] Fetched ${transformedFiles.length} files (lightweight) for page ${page}`);

    res.json({
      success: true,
      total,
      page,
      limit,
      files: transformedFiles,
      _metadata: {
        queryType: 'lightweight',
        fieldsIncluded: ['basic_info', 'file_meta', 'zoho_refs'],
        fieldsExcluded: ['full_payload', 'pdf_buffer']
      }
    });

  } catch (err) {
    console.error("getSavedFilesList error:", err);

    // If it's a database timeout, return empty list for testing
    if (err.message.includes('buffering timed out')) {
      console.log('⚠️ Database timeout, returning empty list for saved files');
      return res.json({
        success: true,
        total: 0,
        page: 1,
        limit: 20,
        files: []
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to fetch saved files",
      detail: err?.message || String(err),
    });
  }
}

// GET /api/pdf/saved-files/:id/details (full payload data on-demand)
export async function getSavedFileDetails(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: "bad_request",
        detail: "Invalid document ID format"
      });
    }

    // Check if we're in development mode without database
    if (mongoose.connection.readyState === 0) {
      console.log('⚠️ Database not connected, returning mock data for saved file details');
      return res.json({
        success: true,
        file: {
          id: id,
          title: "Sample Document",
          status: "draft",
          createdAt: new Date(),
          updatedAt: new Date(),
          payload: {
            headerTitle: "Sample Document",
            headerRows: [],
            products: { products: [], dispensers: [] },
            services: {},
            agreement: {}
          }
        }
      });
    }

    // ✅ FULL QUERY: Fetch complete document with all payload data
    const file = await CustomerHeaderDoc.findById(id)
      .select({
        // Include everything EXCEPT pdf buffer (for performance)
        "pdf_meta.pdfBuffer": 0, // ✅ Exclude the actual PDF buffer field
      })
      .lean();

    if (!file) {
      return res.status(404).json({
        success: false,
        error: "not_found",
        detail: "Saved file not found"
      });
    }

    // console.log(`📄 [SAVED-FILES] Fetched full details for file ${id}: "${file.payload?.headerTitle}"`);

    // Transform to consistent format
    const transformedFile = {
      id: file._id,
      title: file.payload?.headerTitle || 'Untitled Document',
      status: file.status,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      createdBy: file.createdBy,
      updatedBy: file.updatedBy,

      // ✅ FULL PAYLOAD DATA (loaded on-demand)
      payload: file.payload || {},

      // PDF metadata (no buffer included)
      pdfMeta: {
        sizeBytes: file.pdf_meta?.sizeBytes || 0,
        contentType: file.pdf_meta?.contentType || null,
        storedAt: file.pdf_meta?.storedAt || null,
        externalUrl: file.pdf_meta?.externalUrl || null,
      },

      // Zoho integration data
      zoho: file.zoho || {
        bigin: { dealId: null, fileId: null, url: null },
        crm: { dealId: null, fileId: null, url: null }
      },

      // Helper flags
      hasPdf: !!(file.zoho?.bigin?.fileId || file.zoho?.crm?.fileId),
      isEditable: file.status === 'draft' || file.status === 'saved',
    };

    res.json({
      success: true,
      file: transformedFile,
      _metadata: {
        queryType: 'full_details',
        fieldsIncluded: ['all_payload', 'pdf_meta', 'zoho_data'],
        fieldsExcluded: ['pdf_buffer'],
        payloadSize: JSON.stringify(file.payload || {}).length
      }
    });

  } catch (err) {
    console.error("getSavedFileDetails error:", err);

    // If it's a database timeout, return mock data for testing
    if (err.message.includes('buffering timed out')) {
      console.log('⚠️ Database timeout, returning mock data for saved file details');
      return res.json({
        success: true,
        file: {
          id: req.params.id,
          title: "Sample Document",
          status: "draft",
          createdAt: new Date(),
          updatedAt: new Date(),
          payload: {
            headerTitle: "Sample Document",
            headerRows: [],
            products: { products: [], dispensers: [] },
            services: {},
            agreement: {}
          }
        }
      });
    }

    res.status(500).json({
      success: false,
      error: "server_error",
      detail: err?.message || String(err),
    });
  }
}

