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
  const { smallProducts = [], dispensers = [], bigProducts = [] } = products;

  // Add debug logging
  console.log('[PDF] buildProductsLatex called with:', {
    smallProductsCount: smallProducts.length,
    dispensersCount: dispensers.length,
    bigProductsCount: bigProducts.length,
  });
  if (smallProducts.length > 0) {
    console.log('[PDF] First smallProduct:', JSON.stringify(smallProducts[0]));
  }
  if (dispensers.length > 0) {
    console.log('[PDF] First dispenser:', JSON.stringify(dispensers[0]));
  }
  if (bigProducts.length > 0) {
    console.log('[PDF] First bigProduct:', JSON.stringify(bigProducts[0]));
  }

  // Helper: pick first non-null value from a list of keys
  const pick = (obj, keys) => {
    if (!obj) return null;
    for (const k of keys) {
      const val = obj[k];
      // Handle 0 as a valid value, but reject empty string, null, undefined
      if (val !== undefined && val !== null && val !== "") {
        return val;
      }
    }
    return null;
  };

  const fmtDollar = (v) => {
    // Handle both number and string inputs
    if (v === null || v === undefined || v === "") return "";
    const num = typeof v === "number" ? v : parseFloat(v);
    if (!isNaN(num)) {
      return `$${num.toFixed(2)}`;
    }
    // Fallback for non-numeric strings
    return `$${v}`;
  };

  const toStr = (v) =>
    v === null || v === undefined ? "" : String(v);

  // How many rows?  (zip the three arrays)
  const rowCount = Math.max(
    smallProducts.length,
    dispensers.length,
    bigProducts.length
  );

  if (rowCount === 0) {
    return {
      productsColSpecLatex: "Y",
      productsHeaderRowLatex: "",
      productsBodyRowsLatex: "",
    };
  }

  // 14 columns, exactly like the UI grid
  const headers = [
    "Products",
    "Amount Per Unit",
    "Qty",
    "Total",
    "Dispensers",
    "Qty",
    "Warranty Rate",
    "Replacement Rate/Install",
    "Total",
    "Products",
    "Qty",
    "Amount",
    "Frequency of Service",
    "Total",
  ];

  const productsColSpecLatex = headers.map(() => "Y").join("|");
  const productsHeaderRowLatex =
    headers
      .map((h) => `\\textbf{${latexEscape(h)}}`)
      .join(" & ") + " \\\\ \\hline\n";

  let productsBodyRowsLatex = "";

  for (let i = 0; i < rowCount; i++) {
    const sp = smallProducts[i] || {};
    const dp = dispensers[i] || {};
    const bp = bigProducts[i] || {};

    // ----- LEFT BLOCK: small products (Products / Amount Per Unit / Qty / Total)
    const leftName =
      sp.customName ||
      sp.displayName ||
      sp.productName ||
      sp.productKey ||
      "";

    const leftAmount = pick(sp, [
      "amountPerUnit",
      "unitPriceOverride",
      "unitPrice",
      "amount",
    ]);

    const leftQty = pick(sp, ["qty", "quantity"]);

    const leftTotal = pick(sp, [
      "lineTotal",
      "extPrice",
      "totalOverride",
      "total",
    ]);

    // Debug logging for first row
    if (i === 0 && leftName) {
      console.log(`[PDF] Row ${i} smallProduct - name: ${leftName}, amount: ${leftAmount}, qty: ${leftQty}, total: ${leftTotal}`);
    }

    // ----- MIDDLE BLOCK: dispensers (Dispensers / Qty / Warranty / Replacement / Total)
    const dispName =
      dp.customName ||
      dp.displayName ||
      dp.productName ||
      dp.productKey ||
      "";

    const dispQty = pick(dp, ["qty", "quantity"]);

    const dispWarranty = pick(dp, [
      "warrantyPriceOverride",
      "warrantyRate",
      "warranty",
    ]);

    const dispReplacement = pick(dp, [
      "replacementPriceOverride",
      "replacementRate",
      "replacement",
    ]);

    const dispTotal = pick(dp, [
      "lineTotal",
      "extPrice",
      "totalOverride",
      "total",
    ]);

    // Debug logging for first row
    if (i === 0 && dispName) {
      console.log(`[PDF] Row ${i} dispenser - name: ${dispName}, qty: ${dispQty}, warranty: ${dispWarranty}, replacement: ${dispReplacement}, total: ${dispTotal}`);
    }

    // ----- RIGHT BLOCK: big products / extras (Products / Qty / Amount / Freq / Total)
    const rightName =
      bp.customName ||
      bp.displayName ||
      bp.productName ||
      bp.productKey ||
      "";

    const rightQty = pick(bp, ["qty", "quantity"]);

    const rightAmount = pick(bp, [
      "amount",
      "amountPerUnit",
      "unitPriceOverride",
      "unitPrice",
    ]);

    const rightFreq = pick(bp, [
      "frequencyOfService",
      "frequencyLabel",
      "frequency",
    ]) || "";

    const rightTotal = pick(bp, [
      "lineTotal",
      "extPrice",
      "totalOverride",
      "total",
    ]);

    // Debug logging for first row
    if (i === 0 && rightName) {
      console.log(`[PDF] Row ${i} bigProduct - name: ${rightName}, qty: ${rightQty}, amount: ${rightAmount}, freq: ${rightFreq}, total: ${rightTotal}`);
    }

    const rowCells = [
      // LEFT BLOCK
      latexEscape(leftName),
      latexEscape(fmtDollar(leftAmount)),
      latexEscape(toStr(leftQty)),
      latexEscape(fmtDollar(leftTotal)),

      // MIDDLE BLOCK
      latexEscape(dispName),
      latexEscape(toStr(dispQty)),
      latexEscape(fmtDollar(dispWarranty)),
      latexEscape(fmtDollar(dispReplacement)),
      latexEscape(fmtDollar(dispTotal)),

      // RIGHT BLOCK
      latexEscape(rightName),
      latexEscape(toStr(rightQty)),
      latexEscape(fmtDollar(rightAmount)),
      latexEscape(rightFreq ? latexEscape(rightFreq) : ""),
      latexEscape(fmtDollar(rightTotal)),
    ];

    productsBodyRowsLatex += rowCells.join(" & ") + " \\\\ \\hline\n";
  }

  return {
    productsColSpecLatex,
    productsHeaderRowLatex,
    productsBodyRowsLatex,
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

/* ---------------- Service Transformation Helper ---------------- */
function transformServicesToPdfFormat(usedServices) {
  const topRow = [];
  const bottomRow = [];

  // Service display configuration - determines which row each service goes into
  const topRowServices = ['saniclean', 'saniscrub', 'microfiberMopping', 'rpmWindows'];
  const bottomRowServices = ['foamingDrain', 'sanipod', 'carpetclean', 'janitorial', 'stripwax', 'greaseTrap'];

  // Service labels mapping
  const serviceLabels = {
    saniclean: 'RESTROOM & HYGIENE (SANICLEAN)',
    foamingDrain: 'FOAMING DRAIN',
    saniscrub: 'SANI SCRUB',
    microfiberMopping: 'MICROFIBER MOPPING',
    rpmWindows: 'RPM WINDOWS',
    sanipod: 'SANI POD',
    carpetclean: 'CARPET CLEAN',
    janitorial: 'JANITORIAL',
    stripwax: 'STRIP & WAX',
    greaseTrap: 'GREASE TRAP'
  };

  // Transform each service into column format
  for (const [serviceKey, serviceData] of Object.entries(usedServices)) {
    if (serviceKey === 'customServices') continue; // Handle custom services separately

    const column = transformServiceToColumn(serviceKey, serviceData, serviceLabels[serviceKey]);
    if (column && column.rows && column.rows.length > 0) {
      // Determine which row this service belongs to
      if (topRowServices.includes(serviceKey)) {
        topRow.push(column);
      } else if (bottomRowServices.includes(serviceKey)) {
        bottomRow.push(column);
      }
    }
  }

  // Handle custom services
  if (usedServices.customServices && Array.isArray(usedServices.customServices)) {
    for (const customService of usedServices.customServices) {
      const column = transformCustomServiceToColumn(customService);
      if (column && column.rows && column.rows.length > 0) {
        // Add custom services to bottom row
        bottomRow.push(column);
      }
    }
  }

  return { topRow, bottomRow };
}

function transformServiceToColumn(serviceKey, serviceData, label) {
  const rows = [];

  // Extract formData if present (newer format)
  const data = serviceData.formData || serviceData;

  // Common fields to look for
  const commonMappings = [
    { key: 'fixtureCount', label: 'Fixtures' },
    { key: 'fixtures', label: 'Fixtures' },
    { key: 'drainCount', label: 'Drains' },
    { key: 'drains', label: 'Drains' },
    { key: 'squareFeet', label: 'Square Feet' },
    { key: 'sqft', label: 'Square Feet' },
    { key: 'quantity', label: 'Quantity' },
    { key: 'qty', label: 'Qty' },
    { key: 'count', label: 'Count' },
    { key: 'ratePerFixture', label: 'Rate per Fixture' },
    { key: 'ratePerDrain', label: 'Rate per Drain' },
    { key: 'rate', label: 'Rate' },
    { key: 'unitPrice', label: 'Unit Price' }
  ];

  // Add data rows for common fields
  for (const mapping of commonMappings) {
    if (data[mapping.key] !== undefined && data[mapping.key] !== null && data[mapping.key] !== '') {
      let value = String(data[mapping.key]);
      // Format currency if it's a rate or price
      if (mapping.key.includes('rate') || mapping.key.includes('Price')) {
        value = typeof data[mapping.key] === 'number' ? `$${data[mapping.key].toFixed(2)}` : value;
      }
      rows.push({ type: 'line', label: mapping.label, value });
    }
  }

  // Add totals (always bold)
  if (data.weeklyTotal !== undefined && data.weeklyTotal !== null && data.weeklyTotal !== 0) {
    const value = typeof data.weeklyTotal === 'number' ? `$${data.weeklyTotal.toFixed(2)}` : String(data.weeklyTotal);
    rows.push({ type: 'bold', label: 'Weekly Total', value });
  }

  if (data.monthlyTotal !== undefined && data.monthlyTotal !== null && data.monthlyTotal !== 0) {
    const value = typeof data.monthlyTotal === 'number' ? `$${data.monthlyTotal.toFixed(2)}` : String(data.monthlyTotal);
    rows.push({ type: 'bold', label: 'Monthly Total', value });
  }

  if (data.contractTotal !== undefined && data.contractTotal !== null && data.contractTotal !== 0) {
    const value = typeof data.contractTotal === 'number' ? `$${data.contractTotal.toFixed(2)}` : String(data.contractTotal);
    rows.push({ type: 'bold', label: 'Contract Total', value });
  }

  // Add custom fields if present
  if (data.customFields && Array.isArray(data.customFields)) {
    for (const field of data.customFields) {
      if (field && field.label && field.value !== undefined && field.value !== '') {
        let value = String(field.value);
        // Format based on field type
        if (field.type === 'dollar' && typeof field.value === 'number') {
          value = `$${field.value.toFixed(2)}`;
        } else if (field.type === 'calc' && typeof field.value === 'number') {
          value = value;
        }
        rows.push({ type: 'line', label: field.label, value });
      }
    }
  }

  return {
    heading: label || serviceKey.toUpperCase(),
    rows
  };
}

function transformCustomServiceToColumn(customService) {
  const rows = [];

  const label = customService.name || customService.label || 'CUSTOM SERVICE';
  const fields = customService.fields || [];

  for (const field of fields) {
    if (field && field.label && field.value !== undefined && field.value !== '') {
      let value = String(field.value);

      // Format based on field type
      if (field.type === 'dollar') {
        const numValue = parseFloat(field.value);
        if (!isNaN(numValue)) {
          value = `$${numValue.toFixed(2)}`;
        }
      }

      const rowType = field.type === 'calc' ? 'bold' : 'line';
      rows.push({ type: rowType, label: field.label, value });
    }
  }

  return {
    heading: label,
    rows
  };
}

function buildServicesLatex(services = {}) {
  // Helper: unwrap nested formData.formData... and return the deepest "data" object
  const resolveServiceData = (serviceData) => {
    if (!serviceData) return null;
    let data = serviceData;
    const seen = new Set();
    while (data && data.formData && !seen.has(data)) {
      seen.add(data);
      data = data.formData;
    }
    return data || serviceData;
  };

  // Helper: Decide whether a service should be shown
  const isServiceUsed = (serviceData) => {
    if (!serviceData) return false;
    const data = resolveServiceData(serviceData);
    if (!data) return false;

    // Respect isActive at wrapper or data level
    if (serviceData.isActive === false) return false;
    if (data.isActive === false) return false;

    // Core totals we care about (covers saniscrub, sanipod, etc.)
    if (
      data.weeklyTotal ||
      data.monthlyTotal ||
      data.contractTotal ||
      data.firstVisit ||
      data.ongoingMonthly
    )
      return true;

    if (data.total || data.amount || data.charge) return true;

    // Custom fields (e.g. equipment rental, deep cleaning premium, etc.)
    if (Array.isArray(data.customFields) && data.customFields.length > 0) {
      const hasCustomValue = data.customFields.some((field) => {
        if (!field) return false;
        const v = field.value;
        if (v === null || v === undefined) return false;
        if (typeof v === "number") return v !== 0;
        if (typeof v === "string") return v.trim() !== "" && v !== "0";
        return true;
      });
      if (hasCustomValue) return true;
    }

    // Generic numeric/string fields; ignore pure config keys
    const ignoreKeys = new Set([
      "serviceId",
      "pricingMode",
      "location",
      "frequency",
      "rateTier",
      "contractMonths",
      "notes",
      "method",
    ]);

    for (const key of Object.keys(data)) {
      if (ignoreKeys.has(key)) continue;
      const val = data[key];
      if (typeof val === "number" && val > 0) return true;
      if (typeof val === "string" && val.trim() !== "" && val !== "0")
        return true;
    }

    return false;
  };

  // Helper used for both topRow/bottomRow and transformed branch
  const filterServiceColumns = (cols) => {
    if (!cols || !Array.isArray(cols)) return [];
    return cols.filter((col) => {
      if (!col) return false;
      if (col.rows && col.rows.length > 0) {
        return col.rows.some(
          (row) => row && (row.value || row.v1 || row.v2 || row.v3)
        );
      }
      return false;
    });
  };

  const hasTopBottomFormat = services.topRow || services.bottomRow;

  let servicesTopRowLatex = "";
  let servicesBottomRowLatex = "";
  let refreshSectionLatex = "";
  let serviceNotesLatex = "";

  /* ---------- CASE 1: services already in topRow/bottomRow format ---------- */
  if (hasTopBottomFormat) {
    const topRowCols = services.topRow || [];
    const bottomRowCols = services.bottomRow || services.secondRow || [];

    const filteredTopRowCols = filterServiceColumns(topRowCols);
    const filteredBottomRowCols = filterServiceColumns(bottomRowCols);

    servicesTopRowLatex = buildServicesRow(filteredTopRowCols);
    servicesBottomRowLatex = buildServicesRow(filteredBottomRowCols);

    // Refresh Power Scrub for this format (sec is already the "display" object)
    const sec = services.refreshPowerScrub;
    if (sec && Array.isArray(sec.columns) && sec.columns.length > 0) {
      const hasData = sec.columns.some((c) => c && c.trim() !== "");
      if (hasData) {
        const heading = latexEscape(sec.heading || "REFRESH POWER SCRUB");
        const cols = (sec.columns || [])
          .slice(0, 6)
          .map((c) => latexEscape(c || ""));
        const colCount = cols.length;
        const freqLabelsRaw = (sec.freqLabels || [])
          .slice(0, colCount)
          .map((l) => latexEscape(l || ""));
        const freqLabels = Array.from({ length: colCount }, (_, i) =>
          freqLabelsRaw[i] && freqLabelsRaw[i].trim() !== ""
            ? freqLabelsRaw[i]
            : "Freq"
        );
        if (colCount > 0) {
          const colSpec = "|" + Array(colCount).fill("Y").join("|") + "|";
          const labelRow =
            "  " +
            cols.map((h) => `\\scriptsize ${h} \\sblank`).join(" & ") +
            " \\\\";
          const freqRow =
            "  " +
            freqLabels
              .map((l) => `\\scriptsize ${l} \\sblank`)
              .join(" & ") +
            " \\\\";
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
    }

    // Notes if you ever add services.notes in this mode
    if (services.notes) {
      const notes = services.notes;
      const textLines = Array.isArray(notes.textLines) ? notes.textLines : [];
      const lines = textLines.length || notes.lines || 3;
      const hasContent = textLines.some((line) => line && line.trim() !== "");
      if (hasContent || lines > 0) {
        serviceNotesLatex += "\\vspace{1.0em}\n";
        serviceNotesLatex += `\\serviceBigHeading{${latexEscape(
          notes.heading || "SERVICE NOTES"
        )}}\n`;
        serviceNotesLatex += "\\vspace{0.35em}\n";
        for (let i = 0; i < lines; i++) {
          const content = textLines[i] ? latexEscape(textLines[i]) : "";
          serviceNotesLatex += `\\filledline{ ${content} }\\\\[0.6em]\n`;
        }
      }
    }

    return {
      servicesTopRowLatex,
      servicesBottomRowLatex,
      refreshSectionLatex,
      serviceNotesLatex,
    };
  }

  /* ---------- CASE 2: "storage" format (your JSON from frontend) ---------- */
  console.log(
    "[PDF Service] Converting individual service objects to PDF format"
  );

  const usedServices = {};
  const allServiceKeys = [
    "saniclean",
    "foamingDrain",
    "saniscrub",
    "microfiberMopping",
    "rpmWindows",
    "refreshPowerScrub", // special layout handled below
    "sanipod",
    "carpetclean",
    "janitorial",
    "stripwax",
    "greaseTrap",
  ];

  for (const serviceKey of allServiceKeys) {
    const svc = services[serviceKey];
    if (svc && isServiceUsed(svc)) {
      usedServices[serviceKey] = svc;
    }
  }

  // Custom services if present
  if (services.customServices && Array.isArray(services.customServices)) {
    const usedCustomServices = services.customServices.filter((cs) => {
      return cs && Array.isArray(cs.fields) && cs.fields.length > 0;
    });
    if (usedCustomServices.length > 0) {
      usedServices.customServices = usedCustomServices;
    }
  }

  // If nothing is actually used, return empty strings
  if (Object.keys(usedServices).length === 0) {
    return {
      servicesTopRowLatex: "",
      servicesBottomRowLatex: "",
      refreshSectionLatex: "",
      serviceNotesLatex: "",
    };
  }

  // Transform into topRow/bottomRow columns using your existing helpers
  const transformedServices = transformServicesToPdfFormat(usedServices);
  const topRowCols = transformedServices.topRow || [];
  const bottomRowCols = transformedServices.bottomRow || [];

  const filteredTopRowCols = filterServiceColumns(topRowCols);
  const filteredBottomRowCols = filterServiceColumns(bottomRowCols);

  servicesTopRowLatex = buildServicesRow(filteredTopRowCols);
  servicesBottomRowLatex = buildServicesRow(filteredBottomRowCols);

  // Refresh Power Scrub from *your* JSON:
  // services.refreshPowerScrub is the object with heading/columns/freqLabels
  if (services.refreshPowerScrub) {
    const secRoot = services.refreshPowerScrub;
    const sec = secRoot.formData || secRoot; // support both shapes

    if (sec && Array.isArray(sec.columns) && sec.columns.length > 0) {
      const hasData = sec.columns.some((c) => c && c.trim() !== "");
      if (hasData) {
        const heading = latexEscape(sec.heading || "REFRESH POWER SCRUB");
        const cols = (sec.columns || [])
          .slice(0, 6)
          .map((c) => latexEscape(c || ""));
        const colCount = cols.length;
        const freqLabelsRaw = (sec.freqLabels || [])
          .slice(0, colCount)
          .map((l) => latexEscape(l || ""));
        const freqLabels = Array.from({ length: colCount }, (_, i) =>
          freqLabelsRaw[i] && freqLabelsRaw[i].trim() !== ""
            ? freqLabelsRaw[i]
            : "Freq"
        );
        if (colCount > 0) {
          const colSpec = "|" + Array(colCount).fill("Y").join("|") + "|";
          const labelRow =
            "  " +
            cols.map((h) => `\\scriptsize ${h} \\sblank`).join(" & ") +
            " \\\\";
          const freqRow =
            "  " +
            freqLabels
              .map((l) => `\\scriptsize ${l} \\sblank`)
              .join(" & ") +
            " \\\\";
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
    }
  }

  // Top-level service notes if you ever add services.notes in this JSON
  if (services.notes) {
    const notes = services.notes;
    const textLines = Array.isArray(notes.textLines) ? notes.textLines : [];
    const lines = textLines.length || notes.lines || 3;
    const hasContent = textLines.some((line) => line && line.trim() !== "");
    if (hasContent || lines > 0) {
      serviceNotesLatex += "\\vspace{1.0em}\n";
      serviceNotesLatex += `\\serviceBigHeading{${latexEscape(
        notes.heading || "SERVICE NOTES"
      )}}\n`;
      serviceNotesLatex += "\\vspace{0.35em}\n";
      for (let i = 0; i < lines; i++) {
        const content = textLines[i] ? latexEscape(textLines[i]) : "";
        serviceNotesLatex += `\\filledline{ ${content} }\\\\[0.6em]\n`;
      }
    }
  }

  return {
    servicesTopRowLatex,
    servicesBottomRowLatex,
    refreshSectionLatex,
    serviceNotesLatex,
  };
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
