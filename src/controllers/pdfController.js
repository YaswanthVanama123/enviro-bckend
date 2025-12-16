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
import ManualUploadDocument from "../models/ManualUploadDocument.js"; // ✅ NEW: For optimized file storage
import VersionPdf from "../models/VersionPdf.js"; // ✅ NEW: For version PDFs
import PriceOverrideLog from "../models/PriceOverrideLog.js"; // ✅ NEW: For price override logging
import VersionChangeLog from "../models/VersionChangeLog.js"; // ✅ NEW: For version-based change logging
// import mongoose from "mongoose"; // ✅ Add mongoose import for ObjectId handling

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

    // ✅ NEW: For non-draft, we'll create agreement first, then PDF goes to VersionPdf collection
    // No PDF compilation here - that happens in version creation step
    if (!isDraft) {
      console.log("📄 Non-draft mode: Agreement will be created, PDF will go to VersionPdf collection");

      // Set zoho data to empty for now (will be populated when user uploads to Zoho)
      zohoData.bigin = { dealId: null, fileId: null, url: null };
      zohoData.crm = { dealId: null, fileId: null, url: null };

      // Mark as successful since we're not doing Zoho upload here
      zohoUploadSuccess = true;
      console.log("💾 No immediate PDF compilation - PDF will be stored in VersionPdf collection");
    }

    // DEBUG: Log the full payload before storing to database
    // console.log("🐛 [DEBUG] PAYLOAD BEFORE STORAGE:", JSON.stringify(payload, null, 2));
    // console.log("🐛 [DEBUG] PAYLOAD SERVICES KEYS:", Object.keys(payload.services || {}));

    // Create document in database
    const doc = await CustomerHeaderDoc.create({
      payload,
      pdf_meta: {
        sizeBytes: 0,
        contentType: "application/pdf",
        storedAt: null,
        pdfBuffer: null, // ✅ NEW: No PDF stored in CustomerHeaderDoc - all PDFs go to VersionPdf
        externalUrl: null,
      },
      status,
      createdBy: req.admin?.id || null,
      updatedBy: req.admin?.id || null,
      zoho: zohoData,
    });

    // ✅ Log document creation confirmation
    console.log(`✅ Agreement document created: ${doc._id} (PDF will be stored in VersionPdf collection)`);

    // console.log(`Document created with ID: ${doc._id}, status: ${status}`);

    // DEBUG: Log what was actually stored in the database
    const storedDoc = await CustomerHeaderDoc.findById(doc._id).lean();
    // console.log("🐛 [DEBUG] STORED DOC SERVICES:", JSON.stringify(storedDoc.payload.services, null, 2));
    if (storedDoc.payload.services?.refreshPowerScrub) {
      // console.log("🐛 [DEBUG] STORED REFRESH POWER SCRUB:", JSON.stringify(storedDoc.payload.services.refreshPowerScrub, null, 2));
    }

    // ✅ NEW: Return JSON response for both draft and final status
    // PDF creation happens later in version system, not here
    res.setHeader("X-CustomerHeaderDoc-Id", doc._id.toString());
    return res.status(201).json({
      success: true,
      _id: doc._id.toString(),
      status: doc.status,
      createdAt: doc.createdAt,
      message: isDraft ? "Draft saved successfully" : "Agreement created successfully - PDF will be generated in version system"
    });
  } catch (err) {
    console.error("compileAndStoreCustomerHeader error:", err);

    // ✅ TESTING FIX: Handle MongoDB connection issues gracefully
    const isMongoConnectionError = mongoose.connection.readyState === 0 ||
                                   err?.message?.includes('MongoDB') ||
                                   err?.message?.includes('mongoose') ||
                                   err?.message?.includes('Connection') ||
                                   err?.name === 'MongooseError';

    if (isMongoConnectionError) {
      console.log("⚠️ [TESTING MODE] MongoDB not connected - generating mock response for frontend testing");

      // Generate mock document ID for testing
      const mockDocId = new mongoose.Types.ObjectId().toString();

      // Set header for frontend ID extraction
      res.setHeader("X-CustomerHeaderDoc-Id", mockDocId);

      // Return successful response for testing (matches normal flow)
      const isDraft = (req.body?.status || "saved") === "draft";

      if (isDraft) {
        return res.status(201).json({
          success: true,
          _id: mockDocId,
          status: "draft",
          createdAt: new Date().toISOString(),
          message: "Draft saved successfully",
          testing: true
        });
      } else {
        // ✅ NEW: Return JSON for non-draft too (PDF creation happens in version system)
        return res.status(201).json({
          success: true,
          _id: mockDocId,
          status: "saved",
          createdAt: new Date().toISOString(),
          message: "Agreement created successfully - PDF will be generated in version system",
          testing: true
        });
      }
    }

    // Original error handling for real errors
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
    // ✅ NEW: Support isDeleted filter for trash functionality
    if (req.query.isDeleted !== undefined) {
      const isDeletedParam = req.query.isDeleted === 'true';
      if (isDeletedParam) {
        // Trash mode: show only deleted items
        filter.isDeleted = true;
      } else {
        // Normal mode: show only non-deleted items
        filter.isDeleted = { $ne: true };
      }
    } else {
      // Default: show only non-deleted items if no filter specified
      filter.isDeleted = { $ne: true };
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

// GET /api/pdf/saved-files/grouped (CORRECTED: One document per agreement with attachedFiles)
export async function getSavedFilesGrouped(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit || "20", 10), 1),
      100
    );

    // Check if we're in development mode without database
    if (mongoose.connection.readyState === 0) {
      console.log('⚠️ Database not connected, returning empty list for grouped files');
      return res.json({
        total: 0,
        totalGroups: 0,
        page,
        limit,
        agreements: []
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

    // ✅ FIXED: Different logic for trash mode vs normal mode
    const isTrashMode = req.query.isDeleted === 'true';

    if (isTrashMode) {
      // Trash mode: Fetch ALL agreements (we'll filter files later)
      // Don't filter agreements by isDeleted - we want to show deleted files from any agreement
      console.log(`📁 [TRASH MODE] Fetching all agreements to find deleted files`);
    } else {
      // Normal mode: show only non-deleted agreements
      filter.isDeleted = { $ne: true };
    }

    // ✅ CORRECTED: Fetch agreements (no grouping - each is already one document)
    const totalAgreements = await CustomerHeaderDoc.countDocuments(filter);

    console.log(`📁 [FETCH] Found ${totalAgreements} total agreements matching filter`);

    // ✅ FIXED: Dynamic populate filter based on trash mode
    let manualDocumentMatch;
    if (isTrashMode) {
      // Trash mode: include only deleted manual documents
      manualDocumentMatch = { isDeleted: true };
    } else {
      // Normal mode: exclude deleted manual documents
      manualDocumentMatch = { isDeleted: { $ne: true } };
    }

    const agreements = await CustomerHeaderDoc.find(filter)
      .select({
        _id: 1,
        status: 1,
        isDeleted: 1, // ✅ ADDED: Include isDeleted status for frontend logic
        deletedAt: 1, // ✅ ADDED: Include deletion timestamp
        deletedBy: 1, // ✅ ADDED: Include who deleted it
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
        'attachedFiles': 1,  // ✅ Include attached file references
      })
      .populate({
        path: 'attachedFiles.manualDocumentId',  // ✅ Populate referenced ManualUploadDocument
        model: 'ManualUploadDocument',
        match: manualDocumentMatch, // ✅ FIXED: Dynamic filter based on trash mode
        select: 'fileName originalFileName fileSize mimeType description uploadedBy status zoho createdAt updatedAt'
      })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    console.log(`📁 [FETCH] Retrieved ${agreements.length} agreements for page ${page}`);
    console.log(`📁 [DEBUG] First agreement structure:`, agreements[0] ? {
      id: agreements[0]._id,
      title: agreements[0].payload?.headerTitle,
      attachedFilesCount: agreements[0].attachedFiles?.length || 0,
      attachedFilesStructure: agreements[0].attachedFiles?.slice(0, 1)
    } : 'No agreements found');

    // ✅ FIXED: Fetch all version PDFs for these agreements in one query (dynamic filter)
    const agreementIds = agreements.map(agreement => agreement._id);

    // ✅ FIXED: Dynamic version PDF filter based on trash mode
    let versionPdfFilter = {
      agreementId: { $in: agreementIds },
      status: { $ne: 'archived' } // Exclude archived versions
    };

    if (isTrashMode) {
      // Trash mode: include only deleted version PDFs
      versionPdfFilter.isDeleted = true;
    } else {
      // Normal mode: exclude deleted version PDFs
      versionPdfFilter.isDeleted = { $ne: true };
    }

    const allVersionPdfs = await VersionPdf.find(versionPdfFilter)
    .select({
      _id: 1,
      agreementId: 1,
      versionNumber: 1,
      versionLabel: 1,
      status: 1,  // ✅ ADDED: Include the status field
      createdAt: 1,
      updatedAt: 1,
      createdBy: 1,
      changeNotes: 1,
      'pdf_meta.sizeBytes': 1,
      'pdf_meta.storedAt': 1,
      'pdf_meta.pdfBuffer': 1,
      'zoho.bigin.dealId': 1,
      'zoho.bigin.fileId': 1,
      'zoho.crm.dealId': 1,
      'zoho.crm.fileId': 1,
    })
    .sort({ agreementId: 1, versionNumber: -1 }) // Group by agreement, latest versions first
    .lean();

    // Group version PDFs by agreement ID for efficient lookup
    const versionsByAgreement = {};
    allVersionPdfs.forEach(version => {
      const agreementId = version.agreementId.toString();
      if (!versionsByAgreement[agreementId]) {
        versionsByAgreement[agreementId] = [];
      }
      versionsByAgreement[agreementId].push(version);
    });

    console.log(`📁 [VERSIONS] Found ${allVersionPdfs.length} version PDFs across ${Object.keys(versionsByAgreement).length} agreements`);

    // ✅ Transform to show attached files + version PDFs for each agreement (NO MAIN FILE)
    const transformedAgreements = agreements.map(agreement => {
      // ✅ REMOVED: No more mainFile since all PDFs are in VersionPdf collection

      // ✅ Add attached files to the same agreement (now using populated references)
      const attachedFiles = (agreement.attachedFiles || []).map(attachmentRef => {
        const manualDoc = attachmentRef.manualDocumentId; // Populated ManualUploadDocument

        // ✅ FIX: Handle case where populate failed or reference is invalid
        if (!manualDoc || !manualDoc._id) {
          console.warn(`⚠️ Invalid attachment reference in agreement ${agreement._id}:`, attachmentRef);
          return null; // Skip this attachment
        }

        return {
          id: manualDoc._id,
          agreementId: agreement._id,  // ✅ FIX: Add agreement ID for Zoho upload
          fileName: manualDoc.originalFileName,
          fileType: 'attached_pdf',
          title: manualDoc.originalFileName,
          status: 'attached',
          createdAt: manualDoc.createdAt,
          updatedAt: manualDoc.updatedAt,
          createdBy: manualDoc.uploadedBy,
          updatedBy: null,
          fileSize: manualDoc.fileSize || 0,
          pdfStoredAt: manualDoc.createdAt,
          // ✅ FIX: Files stored in ManualUploadDocument are always accessible
          hasPdf: manualDoc.status === 'uploaded' || manualDoc.status === 'completed',
          description: attachmentRef.description || manualDoc.description || '',
          zohoInfo: {
            biginDealId: manualDoc.zoho?.bigin?.dealId || null,
            biginFileId: manualDoc.zoho?.bigin?.fileId || null,
            crmDealId: manualDoc.zoho?.crm?.dealId || null,
            crmFileId: manualDoc.zoho?.crm?.fileId || null,
          }
        };
      }).filter(file => file !== null); // Filter out any invalid references

      // ✅ NEW: Add version PDFs to the same agreement (using pre-fetched data)
      const agreementVersions = versionsByAgreement[agreement._id.toString()] || [];

      const versionFiles = agreementVersions.map(version => ({
        id: version._id,
        agreementId: agreement._id,  // ✅ FIX: Add agreement ID for Zoho upload
        fileName: `${agreement.payload?.headerTitle || 'Untitled'} - Version ${version.versionNumber}.pdf`,
        fileType: 'version_pdf',
        title: `Version ${version.versionNumber}${version.versionLabel ? ` (${version.versionLabel})` : ''}`,
        status: version.status || 'saved', // ✅ FIXED: Use actual version status from database
        createdAt: version.createdAt,
        updatedAt: version.updatedAt,
        createdBy: version.createdBy,
        updatedBy: null,
        fileSize: version.pdf_meta?.sizeBytes || 0,
        pdfStoredAt: version.pdf_meta?.storedAt || null,
        hasPdf: !!(
          // Check for Zoho fileId (valid, non-mock) OR PDF stored in MongoDB
          (version.zoho?.bigin?.fileId && !version.zoho.bigin.fileId.includes('MOCK_')) ||
          (version.zoho?.crm?.fileId && !version.zoho.crm.fileId.includes('MOCK_')) ||
          version.pdf_meta?.pdfBuffer
        ),
        description: version.changeNotes || `Version ${version.versionNumber} created on ${new Date(version.createdAt).toLocaleDateString()}`,
        versionNumber: version.versionNumber, // ✅ Add version number for sorting/display
        zohoInfo: {
          biginDealId: version.zoho?.bigin?.dealId || null,
          biginFileId: version.zoho?.bigin?.fileId || null,
          crmDealId: version.zoho?.crm?.dealId || null,
          crmFileId: version.zoho?.crm?.fileId || null,
        }
      }));

      // ✅ Combine attached files + version files (NO MORE MAIN FILE)
      const allFiles = [...attachedFiles, ...versionFiles];

      return {
        id: agreement._id,
        agreementTitle: agreement.payload?.headerTitle || 'Untitled Agreement',
        fileCount: allFiles.length,
        latestUpdate: agreement.updatedAt,
        statuses: [agreement.status], // Main agreement status
        isDeleted: agreement.isDeleted || false, // ✅ ADDED: Include agreement deletion status
        deletedAt: agreement.deletedAt, // ✅ ADDED: Include deletion timestamp
        deletedBy: agreement.deletedBy, // ✅ ADDED: Include who deleted it
        hasUploads: allFiles.some(f => f.zohoInfo.biginDealId || f.zohoInfo.crmDealId),
        files: allFiles
      };
    });

    // ✅ NEW: In trash mode, filter out agreements with no deleted files
    let finalAgreements = transformedAgreements;
    if (isTrashMode) {
      finalAgreements = transformedAgreements.filter(agreement => agreement.fileCount > 0);
      console.log(`📁 [TRASH FILTER] Filtered from ${transformedAgreements.length} to ${finalAgreements.length} agreements with deleted files`);
    }

    const totalFiles = finalAgreements.reduce((sum, agreement) => sum + agreement.fileCount, 0);

    console.log(`📁 [SAVED-FILES-GROUPED] Fetched ${finalAgreements.length} agreements with ${totalFiles} total files for page ${page}`);

    res.json({
      success: true,
      total: totalFiles,
      totalGroups: isTrashMode ? finalAgreements.length : totalAgreements, // In trash mode, count filtered agreements
      page,
      limit,
      groups: finalAgreements,  // ✅ FIXED: Use filtered agreements
      _metadata: {
        queryType: 'agreements_with_attached_files',
        structure: 'single_document_per_agreement',
        fieldsIncluded: ['basic_info', 'file_meta', 'attached_files', 'zoho_refs'],
        fieldsExcluded: ['full_payload', 'pdf_buffer']
      }
    });
  } catch (error) {
    console.error("❌ Error fetching agreements with attached files:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
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


// ✅ NEW: Add file(s) to existing agreement's attachedFiles array
export async function addFileToAgreement(req, res) {
  try {
    const { agreementId } = req.params;
    const { files } = req.body; // Array of file data

    if (!mongoose.isValidObjectId(agreementId)) {
      return res.status(400).json({
        success: false,
        error: "bad_request",
        detail: "Invalid agreement ID format"
      });
    }

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: "bad_request",
        detail: "Files array is required and must contain at least one file"
      });
    }

    // Find the agreement
    const agreement = await CustomerHeaderDoc.findById(agreementId);
    if (!agreement) {
      return res.status(404).json({
        success: false,
        error: "not_found",
        detail: "Agreement not found"
      });
    }

    // ✅ NEW APPROACH: Store PDFs in ManualUploadDocument collection
    const userId = req.user?.id || req.admin?.id || 'system';
    const addedFiles = [];
    const attachmentRefs = [];

    for (const file of files) {
      // ✅ Convert number array back to Buffer if provided
      let pdfBuffer = null;
      if (file.pdfBuffer && Array.isArray(file.pdfBuffer)) {
        pdfBuffer = Buffer.from(file.pdfBuffer);
      } else if (file.pdfBuffer instanceof Buffer) {
        pdfBuffer = file.pdfBuffer;
      }

      if (!pdfBuffer) {
        throw new Error(`File ${file.fileName}: No PDF data provided. Please select a valid file.`);
      }

      // 1. Create ManualUploadDocument with actual PDF data
      const manualDoc = new ManualUploadDocument({
        fileName: `${agreement.payload.headerTitle}_${file.fileName}`,
        originalFileName: file.fileName || 'Untitled.pdf',
        fileSize: file.fileSize || pdfBuffer.length,
        mimeType: file.contentType || 'application/pdf',
        description: file.description || `Attached to agreement: ${agreement.payload.headerTitle}`,
        uploadedBy: userId,
        status: 'uploaded',
        pdfBuffer: pdfBuffer, // Store actual PDF Buffer here
        zoho: {
          bigin: file.zoho?.bigin || {},
          crm: file.zoho?.crm || {},
        },
        metadata: {
          attachedToAgreement: agreementId,
          agreementTitle: agreement.payload.headerTitle,
          attachedAt: new Date()
        }
      });

      await manualDoc.save();

      console.log(`📁 [SAVED-FILE] ManualUploadDocument saved with ID: ${manualDoc._id}`);

      // Verify the document was saved correctly
      if (!manualDoc._id) {
        throw new Error(`Failed to save ManualUploadDocument for file: ${file.fileName}`);
      }

      // 2. Create lightweight reference in CustomerHeaderDoc.attachedFiles
      // ✅ Ensure ObjectId is properly converted
      const documentId = manualDoc._id;
      if (!documentId) {
        throw new Error(`ManualUploadDocument ID is null for file: ${file.fileName}`);
      }

      const attachmentRef = {
        manualDocumentId: new mongoose.Types.ObjectId(documentId), // ✅ Explicit ObjectId conversion
        fileName: file.fileName || 'Untitled.pdf',
        fileSize: file.fileSize || 0,
        description: file.description || '',
        attachedAt: new Date(),
        attachedBy: userId,
        displayOrder: agreement.attachedFiles.length + attachmentRefs.length
      };

      console.log(`📁 [ATTACHMENT-REF] Creating reference:`, {
        manualDocumentId: attachmentRef.manualDocumentId,
        fileName: attachmentRef.fileName,
        hasId: !!attachmentRef.manualDocumentId
      });

      attachmentRefs.push(attachmentRef);
      addedFiles.push({
        id: manualDoc._id,
        fileName: file.fileName,
        fileSize: file.fileSize
      });
    }

    console.log(`📁 [REFS-READY] About to add ${attachmentRefs.length} attachment refs to agreement`);
    console.log(`📁 [REFS-PREVIEW]`, attachmentRefs.map(ref => ({
      manualDocumentId: ref.manualDocumentId,
      fileName: ref.fileName
    })));

    // 🛡️ VALIDATION FIX: Clean existing corrupt attachments before adding new ones
    const originalAttachmentCount = agreement.attachedFiles.length;
    agreement.attachedFiles = agreement.attachedFiles.filter(attachment => {
      const isValid = attachment.manualDocumentId &&
                     mongoose.isValidObjectId(attachment.manualDocumentId);

      if (!isValid) {
        console.log(`🗑️  [CLEANUP] Removing corrupt attachment: fileName="${attachment.fileName || 'N/A'}", manualDocumentId="${attachment.manualDocumentId || 'undefined'}"`);
      }
      return isValid;
    });

    const cleanedCount = originalAttachmentCount - agreement.attachedFiles.length;
    if (cleanedCount > 0) {
      console.log(`🧹 [VALIDATION-FIX] Removed ${cleanedCount} corrupt attachments from agreement ${agreement._id}`);
    }

    // 3. Add attachment references to agreement
    agreement.attachedFiles.push(...attachmentRefs);
    agreement.updatedBy = userId;

    await agreement.save();

    console.log(`📎 [ADD-FILE-OPTIMIZED] Added ${attachmentRefs.length} file refs to agreement: ${agreement.payload.headerTitle}`);

    res.json({
      success: true,
      message: `Successfully added ${attachmentRefs.length} file(s) to agreement`,
      agreement: {
        id: agreement._id,
        title: agreement.payload.headerTitle,
        attachedFilesCount: agreement.attachedFiles.length
      },
      addedFiles: addedFiles
    });

  } catch (err) {
    console.error("addFileToAgreement error:", err);
    res.status(500).json({
      success: false,
      error: "server_error",
      detail: err?.message || String(err),
    });
  }
}

// ✅ NEW: Download attached file from ManualUploadDocument collection
export async function downloadAttachedFile(req, res) {
  try {
    const { fileId } = req.params;

    if (!mongoose.isValidObjectId(fileId)) {
      return res.status(400).json({
        success: false,
        error: "bad_request",
        detail: "Invalid file ID format"
      });
    }

    // Find the file in ManualUploadDocument collection
    const manualDoc = await ManualUploadDocument.findById(fileId).select('fileName originalFileName mimeType pdfBuffer');

    if (!manualDoc) {
      return res.status(404).json({
        success: false,
        error: "not_found",
        detail: "File not found"
      });
    }

    if (!manualDoc.pdfBuffer) {
      return res.status(404).json({
        success: false,
        error: "no_file_data",
        detail: "File data not available"
      });
    }

    // Set headers for file download
    res.set({
      'Content-Type': manualDoc.mimeType || 'application/pdf',
      'Content-Disposition': `attachment; filename="${manualDoc.originalFileName || 'document.pdf'}"`,
      'Content-Length': manualDoc.pdfBuffer.length.toString()
    });

    res.send(manualDoc.pdfBuffer);

  } catch (err) {
    console.error("downloadAttachedFile error:", err);
    res.status(500).json({
      success: false,
      error: "server_error",
      detail: err?.message || String(err),
    });
  }
}

/* ------------ DELETE AND RESTORE API ------------ */

// ✅ NEW: Restore deleted agreement from trash (soft restore)
export async function restoreAgreement(req, res) {
  try {
    const { agreementId } = req.params;

    if (!mongoose.isValidObjectId(agreementId)) {
      return res.status(400).json({
        success: false,
        error: "bad_request",
        detail: "Invalid agreement ID format"
      });
    }

    // Find the deleted agreement
    const agreement = await CustomerHeaderDoc.findOne({
      _id: agreementId,
      isDeleted: true
    });

    if (!agreement) {
      return res.status(404).json({
        success: false,
        error: "not_found",
        detail: "Deleted agreement not found"
      });
    }

    // Restore the agreement
    agreement.isDeleted = false;
    agreement.deletedAt = null;
    agreement.deletedBy = null;
    agreement.updatedBy = req.user?.id || req.admin?.id || 'system';

    await agreement.save();

    console.log(`♻️ [RESTORE] Agreement restored: ${agreement.payload.headerTitle} (ID: ${agreementId})`);

    res.json({
      success: true,
      message: "Agreement restored successfully",
      agreement: {
        id: agreement._id,
        title: agreement.payload.headerTitle
      }
    });

  } catch (err) {
    console.error("restoreAgreement error:", err);
    res.status(500).json({
      success: false,
      error: "server_error",
      detail: err?.message || String(err),
    });
  }
}

// ✅ NEW: Restore deleted file from trash (soft restore)
export async function restoreFile(req, res) {
  try {
    const { fileId } = req.params;

    if (!mongoose.isValidObjectId(fileId)) {
      return res.status(400).json({
        success: false,
        error: "bad_request",
        detail: "Invalid file ID format"
      });
    }

    // Find the deleted file
    const file = await ManualUploadDocument.findOne({
      _id: fileId,
      isDeleted: true
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        error: "not_found",
        detail: "File not found"
      });
    }

    // Restore the file
    file.isDeleted = false;
    file.deletedAt = null;
    file.deletedBy = null;

    await file.save();

    console.log(`♻️ [RESTORE] File restored: ${file.fileName} (ID: ${fileId})`);

    res.json({
      success: true,
      message: "File restored successfully",
      file: {
        id: file._id,
        title: file.fileName
      }
    });

  } catch (err) {
    console.error("restoreFile error:", err);
    res.status(500).json({
      success: false,
      error: "server_error",
      detail: err?.message || String(err),
    });
  }
}

// ✅ NEW: Soft delete agreement (move to trash)
export async function deleteAgreement(req, res) {
  try {
    const { agreementId } = req.params;

    if (!mongoose.isValidObjectId(agreementId)) {
      return res.status(400).json({
        success: false,
        error: "bad_request",
        detail: "Invalid agreement ID format"
      });
    }

    // Find the agreement
    const agreement = await CustomerHeaderDoc.findOne({
      _id: agreementId,
      isDeleted: { $ne: true }
    });

    if (!agreement) {
      return res.status(404).json({
        success: false,
        error: "not_found",
        detail: "Agreement not found or already deleted"
      });
    }

    // Soft delete the agreement
    const userId = req.user?.id || req.admin?.id || 'system';
    agreement.isDeleted = true;
    agreement.deletedAt = new Date();
    agreement.deletedBy = userId;

    await agreement.save();

    console.log(`🗑️ [SOFT DELETE] Agreement moved to trash: ${agreement.payload.headerTitle} (ID: ${agreementId})`);

    res.json({
      success: true,
      message: "Agreement moved to trash successfully"
    });

  } catch (err) {
    console.error("deleteAgreement error:", err);
    res.status(500).json({
      success: false,
      error: "server_error",
      detail: err?.message || String(err),
    });
  }
}

// ✅ FIXED: Soft delete file (move to trash) - handles all file types
export async function deleteFile(req, res) {
  try {
    const { fileId } = req.params;

    if (!mongoose.isValidObjectId(fileId)) {
      return res.status(400).json({
        success: false,
        error: "bad_request",
        detail: "Invalid file ID format"
      });
    }

    let file = null;
    let fileType = null;
    let fileName = "Unknown File";

    // 1. Try to find in ManualUploadDocument (attached files)
    file = await ManualUploadDocument.findOne({
      _id: fileId,
      isDeleted: { $ne: true }
    });

    if (file) {
      fileType = "attached_file";
      fileName = file.fileName;
    } else {
      // 2. Try to find in VersionPdf (version PDFs)
      file = await VersionPdf.findOne({
        _id: fileId,
        isDeleted: { $ne: true }
      });

      if (file) {
        fileType = "version_pdf";
        fileName = file.fileName || `Version ${file.versionNumber}`;
      } else {
        // 3. Try to find in CustomerHeaderDoc (main agreement PDFs)
        file = await CustomerHeaderDoc.findOne({
          _id: fileId,
          isDeleted: { $ne: true }
        });

        if (file) {
          fileType = "main_pdf";
          fileName = file.payload?.headerTitle || "Agreement Document";
        }
      }
    }

    if (!file) {
      return res.status(404).json({
        success: false,
        error: "not_found",
        detail: "File not found or already deleted"
      });
    }

    // Soft delete the file
    const userId = req.user?.id || req.admin?.id || 'system';
    file.isDeleted = true;
    file.deletedAt = new Date();
    file.deletedBy = userId;

    await file.save();

    console.log(`🗑️ [SOFT DELETE] ${fileType} moved to trash: ${fileName} (ID: ${fileId})`);

    res.json({
      success: true,
      message: "File moved to trash successfully",
      fileType: fileType,
      fileName: fileName
    });

  } catch (err) {
    console.error("deleteFile error:", err);
    res.status(500).json({
      success: false,
      error: "server_error",
      detail: err?.message || String(err),
    });
  }
}

// ✅ NEW: Permanently delete agreement and all associated files (cascade delete)
export async function permanentlyDeleteAgreement(req, res) {
  try {
    const { agreementId } = req.params;

    if (!mongoose.isValidObjectId(agreementId)) {
      return res.status(400).json({
        success: false,
        error: "bad_request",
        detail: "Invalid agreement ID format"
      });
    }

    // Find the deleted agreement (must be in trash first)
    const agreement = await CustomerHeaderDoc.findOne({
      _id: agreementId,
      isDeleted: true
    });

    if (!agreement) {
      return res.status(404).json({
        success: false,
        error: "not_found",
        detail: "Agreement not found in trash"
      });
    }

    const agreementTitle = agreement.payload.headerTitle;
    let deletedAttachedFiles = 0;
    let deletedZohoMappings = 0;
    let deletedVersions = 0;

    console.log(`💥 [PERMANENT DELETE] Starting cascade deletion for agreement: ${agreementTitle} (ID: ${agreementId})`);

    // 1. Delete all attached files from ManualUploadDocument collection
    if (agreement.attachedFiles && agreement.attachedFiles.length > 0) {
      const attachedFileIds = agreement.attachedFiles
        .filter(attachment => attachment.manualDocumentId)
        .map(attachment => attachment.manualDocumentId);

      if (attachedFileIds.length > 0) {
        const deleteResult = await ManualUploadDocument.deleteMany({
          _id: { $in: attachedFileIds }
        });
        deletedAttachedFiles = deleteResult.deletedCount;
        console.log(`💥 [CASCADE] Deleted ${deletedAttachedFiles} attached files from ManualUploadDocument collection`);
      }
    }

    // 2. Delete version PDFs if any (assuming VersionPdf model exists)
    if (agreement.versions && agreement.versions.length > 0) {
      const versionIds = agreement.versions
        .filter(version => version.versionId)
        .map(version => version.versionId);

      if (versionIds.length > 0) {
        try {
          const versionDeleteResult = await VersionPdf.deleteMany({
            _id: { $in: versionIds }
          });
          deletedVersions = versionDeleteResult.deletedCount;
          console.log(`💥 [CASCADE] Deleted ${deletedVersions} version PDFs from VersionPdf collection`);
        } catch (versionError) {
          console.warn(`⚠️ [CASCADE] Could not delete versions (VersionPdf model may not exist):`, versionError.message);
        }
      }
    }

    // 3. Count and clean up Zoho mappings
    let zohoMappings = 0;
    if (agreement.zoho?.bigin?.dealId || agreement.zoho?.bigin?.fileId) zohoMappings++;
    if (agreement.zoho?.crm?.dealId || agreement.zoho?.crm?.fileId) zohoMappings++;

    // Count Zoho mappings from attached files and versions
    agreement.attachedFiles?.forEach(file => {
      // Note: We already deleted the files, but we count the mappings that were removed
      zohoMappings += (file.zoho?.bigin?.dealId ? 1 : 0) + (file.zoho?.crm?.dealId ? 1 : 0);
    });
    agreement.versions?.forEach(version => {
      if (version.zohoUploadStatus?.dealId) zohoMappings++;
    });

    deletedZohoMappings = zohoMappings;

    // 4. Finally, delete the main agreement document
    await CustomerHeaderDoc.findByIdAndDelete(agreementId);

    console.log(`💥 [PERMANENT DELETE] Agreement permanently deleted: ${agreementTitle}`);
    console.log(`💥 [CLEANUP SUMMARY] Files: ${deletedAttachedFiles}, Versions: ${deletedVersions}, Zoho mappings: ${deletedZohoMappings}`);

    res.json({
      success: true,
      message: "Agreement permanently deleted",
      deletedData: {
        agreementId,
        deletedAttachedFiles,
        deletedZohoMappings,
        deletedVersions
      }
    });

  } catch (err) {
    console.error("permanentlyDeleteAgreement error:", err);
    res.status(500).json({
      success: false,
      error: "server_error",
      detail: err?.message || String(err),
    });
  }
}

// ✅ NEW: Permanently delete individual file and cleanup references
export async function permanentlyDeleteFile(req, res) {
  try {
    const { fileId } = req.params;

    if (!mongoose.isValidObjectId(fileId)) {
      return res.status(400).json({
        success: false,
        error: "bad_request",
        detail: "Invalid file ID format"
      });
    }

    // Find the deleted file (must be in trash first)
    const file = await ManualUploadDocument.findOne({
      _id: fileId,
      isDeleted: true
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        error: "not_found",
        detail: "File not found in trash"
      });
    }

    const fileName = file.fileName;
    let cleanedReferences = 0;

    console.log(`💥 [PERMANENT DELETE] Starting deletion for file: ${fileName} (ID: ${fileId})`);

    // 1. Remove references from CustomerHeaderDoc.attachedFiles arrays
    const updateResult = await CustomerHeaderDoc.updateMany(
      { "attachedFiles.manualDocumentId": fileId },
      {
        $pull: {
          attachedFiles: { manualDocumentId: fileId }
        }
      }
    );

    cleanedReferences = updateResult.modifiedCount;
    console.log(`💥 [CLEANUP] Removed file references from ${cleanedReferences} agreements`);

    // 2. Delete the file from ManualUploadDocument collection
    await ManualUploadDocument.findByIdAndDelete(fileId);

    console.log(`💥 [PERMANENT DELETE] File permanently deleted: ${fileName}`);
    console.log(`💥 [CLEANUP SUMMARY] Cleaned ${cleanedReferences} references from agreements`);

    res.json({
      success: true,
      message: "File permanently deleted",
      deletedData: {
        fileId,
        fileName,
        cleanedReferences
      }
    });

  } catch (err) {
    console.error("permanentlyDeleteFile error:", err);
    res.status(500).json({
      success: false,
      error: "server_error",
      detail: err?.message || String(err),
    });
  }
}


/* ------------ PRICE OVERRIDE LOGGING API ------------ */

// POST /api/pdf/price-overrides/log - Log a price override
export async function logPriceOverride(req, res) {
  try {
    const {
      agreementId,
      versionId,
      versionNumber,
      salespersonId,
      salespersonName,
      productKey,
      productName,
      productType,
      fieldType,
      originalValue,
      overrideValue,
      quantity,
      frequency,
      sessionId,
      documentTitle,
      source
    } = req.body;

    // Validate required fields
    if (!agreementId || !salespersonId || !salespersonName || !productKey || !productName ||
        !productType || !fieldType || originalValue === undefined || overrideValue === undefined) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        detail: "agreementId, salespersonId, salespersonName, productKey, productName, productType, fieldType, originalValue, and overrideValue are required"
      });
    }

    // Get client information
    const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
    const userAgent = req.headers['user-agent'];

    // Create price override log
    const overrideLog = new PriceOverrideLog({
      agreementId,
      versionId: versionId || null,
      versionNumber: versionNumber || 1,
      salespersonId,
      salespersonName,
      productKey,
      productName,
      productType,
      fieldType,
      originalValue: Number(originalValue),
      overrideValue: Number(overrideValue),
      quantity: quantity || 0,
      frequency: frequency || '',
      sessionId: sessionId || `session_${Date.now()}`,
      documentTitle: documentTitle || 'Untitled Document',
      source: source || 'form_filling',
      ipAddress,
      userAgent
    });

    await overrideLog.save();

    console.log(`💰 [PRICE-OVERRIDE] Logged override: ${productName} - ${fieldType} changed from $${originalValue} to $${overrideValue} by ${salespersonName}`);

    res.json({
      success: true,
      message: "Price override logged successfully",
      log: {
        id: overrideLog._id,
        changeAmount: overrideLog.changeAmount,
        changePercentage: overrideLog.changePercentage,
        isSignificantChange: overrideLog.isSignificantChange,
        requiresApproval: overrideLog.requiresApproval,
        reviewStatus: overrideLog.reviewStatus
      }
    });

  } catch (err) {
    console.error("logPriceOverride error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to log price override",
      detail: err?.message || String(err)
    });
  }
}

// GET /api/pdf/price-overrides/logs/:agreementId - Get logs for an agreement
export async function getPriceOverrideLogs(req, res) {
  try {
    const { agreementId } = req.params;
    const {
      versionNumber,
      salespersonId,
      reviewStatus,
      limit = 50,
      sortOrder = -1
    } = req.query;

    if (!mongoose.isValidObjectId(agreementId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid agreement ID format"
      });
    }

    const options = {
      versionNumber: versionNumber ? Number(versionNumber) : null,
      salespersonId,
      reviewStatus,
      limit: Number(limit),
      sortOrder: Number(sortOrder)
    };

    const logs = await PriceOverrideLog.getLogsForAgreement(agreementId, options);
    const stats = await PriceOverrideLog.getOverrideStats(agreementId);

    console.log(`📊 [PRICE-OVERRIDE] Retrieved ${logs.length} override logs for agreement ${agreementId}`);

    res.json({
      success: true,
      total: logs.length,
      logs,
      statistics: stats
    });

  } catch (err) {
    console.error("getPriceOverrideLogs error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve price override logs",
      detail: err?.message || String(err)
    });
  }
}

// GET /api/pdf/price-overrides/stats/:agreementId - Get override statistics
export async function getPriceOverrideStats(req, res) {
  try {
    const { agreementId } = req.params;

    if (!mongoose.isValidObjectId(agreementId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid agreement ID format"
      });
    }

    const stats = await PriceOverrideLog.getOverrideStats(agreementId);
    const recentLogs = await PriceOverrideLog.getLogsForAgreement(agreementId, { limit: 5 });

    res.json({
      success: true,
      statistics: stats,
      recentOverrides: recentLogs
    });

  } catch (err) {
    console.error("getPriceOverrideStats error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve price override statistics",
      detail: err?.message || String(err)
    });
  }
}

// PATCH /api/pdf/price-overrides/:logId/review - Review/approve a price override
export async function reviewPriceOverride(req, res) {
  try {
    const { logId } = req.params;
    const { reviewStatus, reviewNotes } = req.body;

    if (!mongoose.isValidObjectId(logId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid log ID format"
      });
    }

    const validStatuses = ['approved', 'rejected'];
    if (!reviewStatus || !validStatuses.includes(reviewStatus)) {
      return res.status(400).json({
        success: false,
        error: "Invalid review status. Must be 'approved' or 'rejected'"
      });
    }

    const log = await PriceOverrideLog.findById(logId);
    if (!log) {
      return res.status(404).json({
        success: false,
        error: "Price override log not found"
      });
    }

    log.reviewStatus = reviewStatus;
    log.reviewedBy = req.admin?.id || req.user?.id || 'system';
    log.reviewedAt = new Date();
    log.reviewNotes = reviewNotes || '';

    await log.save();

    console.log(`✅ [PRICE-OVERRIDE] Override ${reviewStatus} for ${log.productName} by ${log.reviewedBy}`);

    res.json({
      success: true,
      message: `Price override ${reviewStatus} successfully`,
      log: {
        id: log._id,
        reviewStatus: log.reviewStatus,
        reviewedBy: log.reviewedBy,
        reviewedAt: log.reviewedAt
      }
    });

  } catch (err) {
    console.error("reviewPriceOverride error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to review price override",
      detail: err?.message || String(err)
    });
  }
}

// GET /api/pdf/price-overrides/pending - Get all pending overrides (admin view)
export async function getPendingPriceOverrides(req, res) {
  try {
    const {
      page = 1,
      limit = 20,
      salespersonId,
      significantOnly
    } = req.query;

    const filter = {
      reviewStatus: 'pending',
      isDeleted: { $ne: true }
    };

    if (salespersonId) {
      filter.salespersonId = salespersonId;
    }

    if (significantOnly === 'true') {
      filter.isSignificantChange = true;
    }

    const total = await PriceOverrideLog.countDocuments(filter);
    const logs = await PriceOverrideLog.find(filter)
      .populate('agreementId', 'payload.headerTitle')
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean();

    console.log(`⏳ [PRICE-OVERRIDE] Retrieved ${logs.length} pending overrides`);

    res.json({
      success: true,
      total,
      page: Number(page),
      limit: Number(limit),
      pendingOverrides: logs
    });

  } catch (err) {
    console.error("getPendingPriceOverrides error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve pending price overrides",
      detail: err?.message || String(err)
    });
  }
}

/* ------------ VERSION-BASED CHANGE LOGGING API ------------ */

// POST /api/pdf/version-changes/log - Log all changes for a version (batch)
export async function logVersionChanges(req, res) {
  try {
    const {
      agreementId,
      versionId,
      versionNumber,
      salespersonId,
      salespersonName,
      changes,
      saveAction,
      documentTitle,
      sessionId
    } = req.body;

    // Validate required fields
    if (!agreementId || !versionId || !salespersonId || !salespersonName ||
        !changes || !Array.isArray(changes) || changes.length === 0 ||
        !saveAction || !documentTitle) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        detail: "agreementId, versionId, salespersonId, salespersonName, changes (array), saveAction, and documentTitle are required"
      });
    }

    // Get client information
    const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
    const userAgent = req.headers['user-agent'];

    // Check if log already exists for this version (replace if exists)
    let versionLog = await VersionChangeLog.findOne({ versionId });

    if (versionLog) {
      // Update existing log
      versionLog.salespersonId = salespersonId;
      versionLog.salespersonName = salespersonName;
      versionLog.changes = changes;
      versionLog.saveAction = saveAction;
      versionLog.documentTitle = documentTitle;
      versionLog.sessionId = sessionId || `session_${Date.now()}`;
      versionLog.ipAddress = ipAddress;
      versionLog.userAgent = userAgent;
      versionLog.updatedAt = new Date();
    } else {
      // Create new log
      versionLog = new VersionChangeLog({
        agreementId,
        versionId,
        versionNumber: versionNumber || 1,
        salespersonId,
        salespersonName,
        changes,
        saveAction,
        documentTitle,
        sessionId: sessionId || `session_${Date.now()}`,
        ipAddress,
        userAgent
      });
    }

    await versionLog.save();

    console.log(`📝 [VERSION-CHANGES] Logged ${changes.length} changes for version ${versionNumber} by ${salespersonName} (${saveAction})`);

    res.json({
      success: true,
      message: "Version changes logged successfully",
      log: {
        id: versionLog._id,
        versionId: versionLog.versionId,
        versionNumber: versionLog.versionNumber,
        totalChanges: versionLog.totalChanges,
        totalPriceImpact: versionLog.totalPriceImpact,
        hasSignificantChanges: versionLog.hasSignificantChanges,
        reviewStatus: versionLog.reviewStatus,
        saveAction: versionLog.saveAction
      }
    });

  } catch (err) {
    console.error("logVersionChanges error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to log version changes",
      detail: err?.message || String(err)
    });
  }
}

// GET /api/pdf/version-changes/logs/:agreementId - Get all version change logs for an agreement
export async function getVersionChangeLogs(req, res) {
  try {
    const { agreementId } = req.params;
    const {
      versionNumber,
      salespersonId,
      reviewStatus,
      limit = 50,
      sortOrder = -1
    } = req.query;

    if (!mongoose.isValidObjectId(agreementId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid agreement ID format"
      });
    }

    const options = {
      versionNumber: versionNumber ? Number(versionNumber) : null,
      salespersonId,
      reviewStatus,
      limit: Number(limit),
      sortOrder: Number(sortOrder)
    };

    const logs = await VersionChangeLog.getLogsForAgreement(agreementId, options);
    const stats = await VersionChangeLog.getChangeStats(agreementId);

    console.log(`📊 [VERSION-CHANGES] Retrieved ${logs.length} version change logs for agreement ${agreementId}`);

    res.json({
      success: true,
      total: logs.length,
      logs,
      statistics: stats.length > 0 ? stats[0] : {
        totalVersions: 0,
        totalChanges: 0,
        totalPriceImpact: 0,
        versionsWithSignificantChanges: 0,
        pendingApprovals: 0
      }
    });

  } catch (err) {
    console.error("getVersionChangeLogs error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve version change logs",
      detail: err?.message || String(err)
    });
  }
}

// GET /api/pdf/version-changes/log/:versionId - Get specific version change log
export async function getVersionChangeLog(req, res) {
  try {
    const { versionId } = req.params;

    if (!mongoose.isValidObjectId(versionId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid version ID format"
      });
    }

    const log = await VersionChangeLog.findOne({ versionId, isDeleted: { $ne: true } });

    if (!log) {
      return res.status(404).json({
        success: false,
        error: "Version change log not found"
      });
    }

    res.json({
      success: true,
      log
    });

  } catch (err) {
    console.error("getVersionChangeLog error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve version change log",
      detail: err?.message || String(err)
    });
  }
}

// PATCH /api/pdf/version-changes/:logId/review - Review/approve a version's changes
export async function reviewVersionChanges(req, res) {
  try {
    const { logId } = req.params;
    const { reviewStatus, reviewNotes } = req.body;

    if (!mongoose.isValidObjectId(logId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid log ID format"
      });
    }

    const validStatuses = ['approved', 'rejected'];
    if (!reviewStatus || !validStatuses.includes(reviewStatus)) {
      return res.status(400).json({
        success: false,
        error: "Invalid review status. Must be 'approved' or 'rejected'"
      });
    }

    const log = await VersionChangeLog.findById(logId);
    if (!log) {
      return res.status(404).json({
        success: false,
        error: "Version change log not found"
      });
    }

    log.reviewStatus = reviewStatus;
    log.reviewedBy = req.admin?.id || req.user?.id || 'system';
    log.reviewedAt = new Date();
    log.reviewNotes = reviewNotes || '';

    await log.save();

    console.log(`✅ [VERSION-CHANGES] Version changes ${reviewStatus} for version ${log.versionNumber} by ${log.reviewedBy}`);

    res.json({
      success: true,
      message: `Version changes ${reviewStatus} successfully`,
      log: {
        id: log._id,
        versionId: log.versionId,
        versionNumber: log.versionNumber,
        reviewStatus: log.reviewStatus,
        reviewedBy: log.reviewedBy,
        reviewedAt: log.reviewedAt
      }
    });

  } catch (err) {
    console.error("reviewVersionChanges error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to review version changes",
      detail: err?.message || String(err)
    });
  }
}

// GET /api/pdf/version-changes/pending - Get all pending version changes (admin view)
export async function getPendingVersionChanges(req, res) {
  try {
    const {
      page = 1,
      limit = 20,
      salespersonId,
      significantOnly
    } = req.query;

    const filter = {
      reviewStatus: 'pending',
      isDeleted: { $ne: true }
    };

    if (salespersonId) {
      filter.salespersonId = salespersonId;
    }

    if (significantOnly === 'true') {
      filter.hasSignificantChanges = true;
    }

    const total = await VersionChangeLog.countDocuments(filter);
    const logs = await VersionChangeLog.find(filter)
      .populate('agreementId', 'payload.headerTitle')
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean();

    console.log(`⏳ [VERSION-CHANGES] Retrieved ${logs.length} pending version changes`);

    res.json({
      success: true,
      total,
      page: Number(page),
      limit: Number(limit),
      pendingVersionChanges: logs
    });

  } catch (err) {
    console.error("getPendingVersionChanges error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve pending version changes",
      detail: err?.message || String(err)
    });
  }
}

