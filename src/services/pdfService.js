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

/* ---------------- Service Agreement LaTeX Builder ---------------- */
function buildServiceAgreementLatex(agreementData = {}) {
  if (!agreementData || !agreementData.includeInPdf) {
    return '';
  }

  const escape = latexEscape;

  // Helper for checkbox - using simple text boxes that don't require special packages
  const checkbox = (checked) => checked ? '{[\\textbf{X}]}' : '{[~~]}';

  // Build the LaTeX content for the service agreement on a new page
  return `
\\newpage

% ====== SERVICE AGREEMENT PAGE ======================================

\\begin{center}
\\begin{minipage}[c]{0.20\\textwidth}
  \\centering
  % Enviro-Master logo
  \\includegraphics[width=0.80\\linewidth]{images/Envimaster.png}
\\end{minipage}%
\\hfill
\\begin{minipage}[c]{0.75\\textwidth}
  \\centering
  {\\bfseries\\Large\\textcolor{emred}{${escape(agreementData.titleText || 'SERVICE AGREEMENT')}}}
\\end{minipage}
\\end{center}

\\vspace{1em}

\\begin{center}
{\\large\\bfseries ${escape(agreementData.subtitleText || 'Terms and Conditions')}}
\\end{center}

\\vspace{1em}

% Terms
\\begin{enumerate}
  \\item ${escape(agreementData.term1 || '')}

  \\item ${escape(agreementData.term2 || '')}

  \\item ${escape(agreementData.term3 || '')}

  \\item ${escape(agreementData.term4 || '')}

  \\item ${escape(agreementData.term5 || '')}

  \\item ${escape(agreementData.term6 || '')}

  \\item ${escape(agreementData.term7 || '')}
\\end{enumerate}

\\vspace{1em}

% Dispenser options
\\noindent
${checkbox(agreementData.retainDispensers)} ${escape(agreementData.retainDispensersLabel || 'Customer desires to retain existing dispensers')}
\\hspace{2em}
${checkbox(agreementData.disposeDispensers)} ${escape(agreementData.disposeDispensersLabel || 'Customer desires to dispose of existing dispensers')}

\\vspace{1em}

\\noindent
${escape(agreementData.noteText || '')}

\\vspace{1em}

% Representatives
\\noindent
${escape(agreementData.emSalesRepLabel || 'EM Sales Representative')}: \\underline{\\hspace{5cm} ${escape(agreementData.emSalesRepresentative || '')}} \\hspace{2em}
${escape(agreementData.insideSalesRepLabel || 'Inside Sales Representative')}: \\underline{\\hspace{5cm} ${escape(agreementData.insideSalesRepresentative || '')}}

\\vspace{1em}

\\noindent
{\\bfseries ${escape(agreementData.authorityText || 'I HEREBY REPRESENT THAT I HAVE THE AUTHORITY TO SIGN THIS AGREEMENT:')}}

\\vspace{1.5em}

% Signatures
\\noindent
\\begin{minipage}[t]{0.48\\textwidth}
  ${escape(agreementData.customerContactLabel || 'Customer Contact Name:')}: \\underline{\\hspace{6cm} ${escape(agreementData.customerContactName || '')}}

  \\vspace{1em}

  ${escape(agreementData.customerSignatureLabel || 'Signature:')}: \\underline{\\hspace{6cm} ${escape(agreementData.customerSignature || '')}}

  \\vspace{1em}

  ${escape(agreementData.customerDateLabel || 'Date:')}: \\underline{\\hspace{3cm} ${escape(agreementData.customerSignatureDate || '')}}
\\end{minipage}%
\\hfill
\\begin{minipage}[t]{0.48\\textwidth}
  ${escape(agreementData.emFranchiseeLabel || 'EM Franchisee:')}: \\underline{\\hspace{6cm} ${escape(agreementData.emFranchisee || '')}}

  \\vspace{1em}

  ${escape(agreementData.emSignatureLabel || 'Signature:')}: \\underline{\\hspace{6cm} ${escape(agreementData.emSignature || '')}}

  \\vspace{1em}

  ${escape(agreementData.emDateLabel || 'Date:')}: \\underline{\\hspace{3cm} ${escape(agreementData.emSignatureDate || '')}}
\\end{minipage}

\\vspace{2em}

\\begin{center}
${escape(agreementData.pageNumberText || 'Page #2')}
\\end{center}
`;
}

/* ---------------- Watermark LaTeX Builder ---------------- */
/**
 * ✅ NEW: Builds LaTeX code for "DRAFT" watermark overlay
 * Uses TikZ to place diagonal watermark on every page
 * Watermark is semi-transparent gray, centered, rotated 45 degrees
 *
 * Returns object with:
 *  - preamble: packages to be inserted before \begin{document}
 *  - command: watermark command to be inserted after \begin{document}
 */
function buildWatermarkLatex() {
  const preamble = `
% ====== DRAFT WATERMARK PACKAGES ======================================
\\usepackage{tikz}
\\usepackage{everypage}
% ======================================================================
`;

  const command = `
% ====== DRAFT WATERMARK COMMAND =======================================
\\AddEverypageHook{%
  \\begin{tikzpicture}[remember picture, overlay]
    \\node[
      rotate=45,
      scale=10,
      text opacity=0.15,
      inner sep=0pt,
      text=gray
    ] at (current page.center) {\\textbf{DRAFT}};
  \\end{tikzpicture}%
}
% ======================================================================
`;

  return { preamble, command };
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

// ✅ NEW: Special escape for table headers - makes slashes breakable and allows word breaks
function latexEscapeHeader(value = "") {
  let result = String(value)
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([{}%&_#])/g, "\\$1")
    .replace(/\$/g, "\\$")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\//g, "/\\allowbreak{}"); // ✅ Allow line breaks after slashes

  // ✅ Allow word breaks in long words (10+ chars) by inserting \- at natural syllable breaks
  result = result.replace(/Replacement/g, "Replace\\-ment");
  result = result.replace(/Warranty/g, "War\\-ranty");
  result = result.replace(/Frequency/g, "Fre\\-quency");
  result = result.replace(/Install/g, "In\\-stall");

  return result;
}

function buildProductsLatex(products = {}, customColumns = { products: [], dispensers: [] }) {
  // Handle BOTH payload formats:
  // 1. Original frontend format: { smallProducts: [...], dispensers: [...], bigProducts: [...] }
  // 2. Transformed format: { products: [...], dispensers: [...] }

  let mergedProducts = [];
  let dispensers = [];

  // Check which format we're receiving
  if (products.products && Array.isArray(products.products)) {
    // Format 2: Already merged products array (from frontend transformer)
    mergedProducts = products.products;
    dispensers = products.dispensers || [];
  } else {
    // Format 1: Separate smallProducts + bigProducts (original format)
    const { smallProducts = [], bigProducts = [] } = products;
    mergedProducts = [...smallProducts, ...bigProducts];
    dispensers = products.dispensers || [];
  }

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
  const grayCell = (value) => `\\cellcolor[RGB]{217,217,217}${value}`;

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

  const toStr = (v) =>
    v === null || v === undefined ? "" : String(v);

  // How many rows? (zip the two arrays: products + dispensers)
  const rowCount = Math.max(
    mergedProducts.length,
    dispensers.length
  );

  if (rowCount === 0) {
    // ✅ FIX: Return proper longtable column spec (not "Y" which only works with tabularx)
    return {
      productsColSpecLatex: "p{\\textwidth}",
      productsHeaderRowLatex: "",
      productsBodyRowsLatex: "",
    };
  }

  // Build dynamic headers based on custom columns
  const baseProductHeaders = ["Products", "Qty", "Unit Price/Amount", "Frequency", "Total"];
  const baseDispenserHeaders = ["Dispensers", "Qty", "Warranty Rate", "Replacement Rate/Install", "Frequency", "Total"];

  // Add custom column headers for products
  const productCustomHeaders = (customColumns.products || []).map(col => col.label || col.id);

  // Add custom column headers for dispensers
  const dispenserCustomHeaders = (customColumns.dispensers || []).map(col => col.label || col.id);

  // Combine all headers: Products (5) + Product Custom Columns + Dispensers (6) + Dispenser Custom Columns
  const headers = [
    ...baseProductHeaders,
    ...productCustomHeaders,
    ...baseDispenserHeaders,
    ...dispenserCustomHeaders,
  ];

  // Calculate column width for longtable
  const numCols = headers.length;
  const colWidth = `\\dimexpr\\textwidth/${numCols}-2\\tabcolsep-1.5\\arrayrulewidth\\relax`;

  // ✅ FIX: Add \raggedright\arraybackslash to COLUMN SPEC (not cell content)
  // This allows natural text wrapping without height restrictions
  // >{...} prefix applies formatting to entire column
  const productsColSpecLatex = headers.map(() => `>{\\centering\\arraybackslash}m{${colWidth}}`).join("|");

  // ✅ FIX: Headers with breakable slashes and word breaks
  // latexEscapeHeader makes slashes breakable with \allowbreak
  // \hspace{0pt} allows hyphenation at any position for long words
const productsHeaderRowLatex =
  "\\arrayrulecolor{black}\n" +
  "\\hline\n" +
  "\\rowcolor[RGB]{218,233,247}\n" +
  headers
    .map((h) => `\\textbf{\\textcolor{emred}{\\hspace{0pt}${latexEscapeHeader(h)}}}`)
    .join(" & ") +
  " \\\\\n" +
  "\\hline\n" +
  "\\arrayrulecolor{black}\n";




  let productsBodyRowsLatex = "";

  for (let i = 0; i < rowCount; i++) {
    const mp = mergedProducts[i] || {}; // merged product (small or big)
    const dp = dispensers[i] || {};

    // ----- LEFT BLOCK: merged products (Products / Qty / Unit Price or Amount / Frequency / Total)
    const leftName =
      mp.customName ||
      mp.displayName ||
      mp.productName ||
      mp.productKey ||
      "";

    const leftQty = pick(mp, ["qty", "quantity"]);

    // For merged products, try both unitPrice (small) and amount (big)
    const leftAmount = pick(mp, [
      "unitPrice",
      "unitPriceOverride",
      "amount",
      "amountPerUnit",
    ]);

    const leftFreq = pick(mp, [
      "frequency",
      "frequencyOfService",
      "frequencyLabel",
    ]) || "";

    const leftTotal = pick(mp, [
      "total",
      "totalOverride",
      "lineTotal",
      "extPrice",
    ]);

    // ----- RIGHT BLOCK: dispensers (Dispensers / Qty / Warranty / Replacement / Frequency / Total)
    const rightName =
      dp.customName ||
      dp.displayName ||
      dp.productName ||
      dp.productKey ||
      "";

    const rightQty = pick(dp, ["qty", "quantity"]);

    const rightWarranty = pick(dp, [
      "warrantyRate",
      "warrantyPriceOverride",
      "warranty",
    ]);

    const rightReplacement = pick(dp, [
      "replacementRate",
      "replacementPriceOverride",
      "replacement",
    ]);

    const rightFreq = pick(dp, [
      "frequency",
      "frequencyOfService",
      "frequencyLabel",
    ]) || "";

    const rightTotal = pick(dp, [
      "total",
      "totalOverride",
      "lineTotal",
      "extPrice",
    ]);

    // Extract custom field values for products
    const leftCustomValues = (customColumns.products || []).map(col => {
      const value = mp.customFields?.[col.id];

      // Handle different value types and empty values
      if (value === undefined || value === null || value === "") {
        return latexEscape("");
      }

      // For numeric values, format as dollar amount
      if (typeof value === "number") {
        return latexEscape(fmtDollar(value));
      }

      // For string values, check if it's a numeric string
      if (typeof value === "string") {
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
          return latexEscape(fmtDollar(numValue));
        }
        // Non-numeric string, return as-is
        return latexEscape(value);
      }

      return latexEscape(String(value));
    });

    // Extract custom field values for dispensers
    const rightCustomValues = (customColumns.dispensers || []).map(col => {
      const value = dp.customFields?.[col.id];

      // Handle different value types and empty values
      if (value === undefined || value === null || value === "") {
        return latexEscape("");
      }

      // For numeric values, format as dollar amount
      if (typeof value === "number") {
        return latexEscape(fmtDollar(value));
      }

      // For string values, check if it's a numeric string
      if (typeof value === "string") {
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
          return latexEscape(fmtDollar(numValue));
        }
        // Non-numeric string, return as-is
        return latexEscape(value);
      }

      return latexEscape(String(value));
    });

    const rowCells = [
      grayCell(latexEscape(leftName)),
      latexEscape(toStr(leftQty)),
      latexEscape(fmtDollar(leftAmount)),
      latexEscape(leftFreq),
      latexEscape(fmtDollar(leftTotal)),

      ...leftCustomValues,

      grayCell(latexEscape(rightName)),
      latexEscape(toStr(rightQty)),
      latexEscape(fmtDollar(rightWarranty)),
      latexEscape(fmtDollar(rightReplacement)),
      latexEscape(rightFreq),
      latexEscape(fmtDollar(rightTotal)),

      ...rightCustomValues,
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
    const label = r.label || "";
    const value = r.value || "";
    const gapSuffix = r.gap === "wide" ? "Wide" : "";
    if (type === "line") {
      // バ. FIX: Remove space prefix before label for proper left alignment
      const lineCommand = "\\serviceLine";
      const command = gapSuffix ? `${lineCommand}${gapSuffix}` : lineCommand;
      if (gapSuffix) {
        console.debug(`[PDF gap] line ${command} ${label}`);
      }
      out += `${command}{${latexEscape(label)}}{${latexEscape(value)}}\n`;
    } else if (type === "bold") {
      // Check if this is a total field and use appropriate command
      const lowerLabel = label.toLowerCase();
      const isTotal = lowerLabel.includes('total') ||
                     lowerLabel.includes('recurring') ||
                     lowerLabel.includes('contract') ||
                     lowerLabel.includes('monthly') ||
                     lowerLabel.includes('weekly') ||
                     lowerLabel.includes('annual') ||
                     lowerLabel.includes('visit');

      const baseCommand = isTotal ? "\\serviceTotalLine" : "\\serviceBoldLine";
      const command = gapSuffix ? `${baseCommand}Wide` : baseCommand;
      if (gapSuffix) {
        console.debug(`[PDF gap] bold ${command} ${label}`);
      }
      out += `${command}{${latexEscape(label)}}{${latexEscape(value)}}\n`;
    } else if (type === "atCharge") {
      out += `\\serviceAtCharge{${latexEscape(r.label || "")}}{${latexEscape(r.v1 || "")}}{${latexEscape(r.v2 || "")}}{${latexEscape(r.v3 || "")}}\n`;
    } else if (type === "gap") {
      out += `\\serviceGapLine{${latexEscape(r.label || "")}}{${latexEscape(r.value || "")}}\n`;
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
      latex += "\\vspace{1.2em}\n";
    }
  } else {
    latex += `\\serviceSection{${latexEscape(col.heading || "")}}\n`;
    latex += buildServiceRows(col.rows || []);
  }
  return latex;
}

function buildServicesRow(cols = []) {
  if (!cols || !cols.length) return "";

  const sortedCols = cols.map((col) => {
    if (!col || !Array.isArray(col.rows)) return col;
    return {
      ...col,
      rows: [...col.rows].sort((a, b) => {
        const ai = typeof a?.orderNo === "number" ? a.orderNo : Number.MAX_SAFE_INTEGER;
        const bi = typeof b?.orderNo === "number" ? b.orderNo : Number.MAX_SAFE_INTEGER;
        return ai - bi;
      }),
    };
  });

  let rowLatex = "\\noindent\n";
  sortedCols.forEach((col, idx) => {
    rowLatex += "\\begin{minipage}[t]{0.48\\textwidth}\n";
    rowLatex += buildServiceColumn(col);
    rowLatex += "\\end{minipage}%\n";
    if (idx !== sortedCols.length - 1) rowLatex += "\\hfill\n";
  });
  rowLatex += "\n";
  return rowLatex;
}

function buildServiceRowSequence(cols = []) {
  if (!cols || !cols.length) return "";
  const trimmedCols = [];
  for (let i = 0; i < cols.length; i += 2) {
    const group = [];
    for (let j = i; j < i + 2 && j < cols.length; j++) {
      const col = cols[j];
      if (col && Array.isArray(col.rows) && col.rows.length > 0) {
        group.push(col);
      }
    }
    if (group.length) {
      trimmedCols.push(group);
    }
  }
  if (!trimmedCols.length) return "";
  return trimmedCols
    .map((group, index) => {
      const prefix = index > 0 ? "\\vspace{2.5em}\n" : "";
      return prefix + buildServicesRow(group);
    })
    .join("");
}

function shouldDisplayField(field) {
  if (!field || typeof field !== "object") return true;
  if (typeof field.isDisplay === "boolean") return field.isDisplay;
  return true;
}

function attachOrderNo(field, row) {
  if (!field || typeof field !== "object") return row;
  const candidate = field.orderNo;
  if (candidate === null || candidate === undefined) return row;
  const parsed = typeof candidate === "number" ? candidate : Number(candidate);
  if (!Number.isFinite(parsed)) return row;
  return { ...row, orderNo: parsed };
}

const FREQUENCY_CANONICALS = new Map([
  ["onetime", "oneTime"],
  ["1time", "oneTime"],
  ["weekly", "weekly"],
  ["biweekly", "biweekly"],
  ["twicepermonth", "twicePerMonth"],
  ["2permonth", "twicePerMonth"],
  ["2xmonth", "twicePerMonth"],
  ["2month", "twicePerMonth"],
  ["monthly", "monthly"],
  ["bimonthly", "bimonthly"],
  ["every2months", "bimonthly"],
  ["quarterly", "quarterly"],
  ["biannual", "biannual"],
  ["annual", "annual"],
]);

const MONTHLY_FREQUENCY_KEYS = new Set(["weekly", "biweekly", "twicePerMonth", "monthly"]);
const VISIT_FREQUENCY_KEYS = new Set(["oneTime", "bimonthly", "quarterly", "biannual", "annual"]);

function normalizeFrequencyKey(raw) {
  if (raw === undefined || raw === null) return undefined;
  const str = String(raw).trim();
  if (!str) return undefined;
  const cleaned = str.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!cleaned) return undefined;
  const canonical = FREQUENCY_CANONICALS.get(cleaned);
  if (canonical) return canonical;
  if (cleaned.includes("twicepermonth") || cleaned.includes("2permonth") || cleaned.includes("2xmonth") || cleaned.includes("2month")) {
    return "twicePerMonth";
  }
  if (cleaned.includes("bimonth")) {
    return "bimonthly";
  }
  if (cleaned.includes("quarter")) {
    return "quarterly";
  }
  if (cleaned.includes("biannual")) {
    return "biannual";
  }
  if (cleaned.includes("annual")) {
    return "annual";
  }
  if (cleaned.includes("biweekly")) {
    return "biweekly";
  }
  if (cleaned.includes("weekly")) {
    return "weekly";
  }
  if (cleaned.includes("monthly")) {
    return "monthly";
  }
  if (cleaned.includes("onetime") || cleaned.includes("1time")) {
    return "oneTime";
  }
  return undefined;
}

function detectServiceFrequencyKey(data) {
  if (!data) return undefined;
  const candidates = [
    data.frequency,
    data.serviceFrequency,
    data.mainServiceFrequency,
    data.frequencyKey,
    data.serviceFrequencyKey,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate === "string") {
      const normalized = normalizeFrequencyKey(candidate);
      if (normalized) return normalized;
      continue;
    }
    if (typeof candidate === "object") {
      const value = candidate.frequencyKey ?? candidate.value ?? candidate.label;
      if (!value) continue;
      const normalized = normalizeFrequencyKey(value);
      if (normalized) return normalized;
    }
  }
  return undefined;
}

function determineFrequencyGroup(key) {
  if (!key) return undefined;
  if (MONTHLY_FREQUENCY_KEYS.has(key)) return "monthly";
  if (VISIT_FREQUENCY_KEYS.has(key)) return "visit";
  return undefined;
}

/* ---------------- Service Transformation Helper ---------------- */
function transformServicesToPdfFormat(usedServices) {
  const topRow = [];
  const bottomRow = [];

  // ✅ FIX: Collect all services in order, then distribute 2 per row
  const allServices = [];

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
    greaseTrap: 'GREASE TRAP',
    electrostaticSpray: 'ELECTROSTATIC SPRAY',
    refreshPowerScrub: 'REFRESH POWER SCRUB'
  };

  // Transform each service into column format
  for (const [serviceKey, serviceData] of Object.entries(usedServices)) {
    if (serviceKey === 'customServices') continue; // Handle custom services separately
    if (serviceKey === 'refreshPowerScrub') continue; // Refresh is rendered as its own table

    const column = transformServiceToColumn(serviceKey, serviceData, serviceLabels[serviceKey]);
    if (column && column.rows && column.rows.length > 0) {
      allServices.push(column);
    }
  }

  // Handle custom services
  if (usedServices.customServices && Array.isArray(usedServices.customServices)) {
    for (const customService of usedServices.customServices) {
      const column = transformCustomServiceToColumn(customService);
      if (column && column.rows && column.rows.length > 0) {
        allServices.push(column);
      }
    }
  }

  // ✅ FIX: Distribute services 2 per row automatically
  // First 2 services go to topRow, next 2 to bottomRow, etc.
  for (let i = 0; i < allServices.length; i++) {
    if (i < 2) {
      topRow.push(allServices[i]);
    } else {
      bottomRow.push(allServices[i]);
    }
  }

  return { topRow, bottomRow };
}

function transformServiceToColumn(serviceKey, serviceData, label) {
  // Only log for refreshPowerScrub
  if (serviceKey === 'refreshPowerScrub') {
    // console.log('🔧 [REFRESH POWER SCRUB DEBUG] Transforming service to column:');
    // console.log('  └ Input serviceData keys:', Object.keys(serviceData));
  }

  const rows = [];
  const pushRow = (field, row) => rows.push(attachOrderNo(field, row));

  // Extract formData if present (newer format)
  const data = serviceData.formData || serviceData;

  if (serviceKey === 'refreshPowerScrub') {
    // console.log('  └ Resolved data keys:', Object.keys(data));
    // console.log('  └ isActive:', data.isActive);
  }

  // Handle NEW structured format (with label/type/qty/rate/total objects)
  // Check if this is the new structured format
  if (data.isActive && (data.fixtureBreakdown || data.drainBreakdown || data.serviceBreakdown || data.windows || data.service || data.restroomFixtures || data.nonBathroomArea ||
      // Refresh Power Scrub area keys
      data.dumpster || data.patio || data.walkway || data.foh || data.boh || data.other)) {
    if (serviceKey === 'refreshPowerScrub') {
      // console.log('  └ Using NEW structured format');
    }

    // Handle fixture breakdown (SaniClean)
    if (data.fixtureBreakdown && Array.isArray(data.fixtureBreakdown)) {
      for (const fixture of data.fixtureBreakdown) {
        if (!shouldDisplayField(fixture)) continue;
        if (fixture.qty > 0) {
          pushRow(fixture, {
            type: 'atCharge',
            label: fixture.label || '',
            v1: String(fixture.qty || ''),
            v2: typeof fixture.rate === 'number' ? `$${fixture.rate.toFixed(2)}` : String(fixture.rate || ''),
            v3: typeof fixture.total === 'number' ? `$${fixture.total.toFixed(2)}` : String(fixture.total || '')
          });
        }
      }
    }

    // Handle drain breakdown (Foaming Drain)
    if (data.drainBreakdown && Array.isArray(data.drainBreakdown)) {
      for (const drain of data.drainBreakdown) {
        if (!shouldDisplayField(drain)) continue;
        if (drain.qty > 0) {
          // Only add if we have meaningful data
          const hasRate = drain.rate != null && drain.rate !== '';
          const hasTotal = drain.total != null && drain.total !== '';

          if (hasRate || hasTotal) {
            rows.push({
              type: 'atCharge',
              orderNo: drain.orderNo,
              label: drain.label || '',
              v1: String(drain.qty || ''),
              v2: typeof drain.rate === 'number' ? `$${drain.rate.toFixed(2)}` : String(drain.rate || ''),
              v3: typeof drain.total === 'number' ? `$${drain.total.toFixed(2)}` : String(drain.total || '')
            });
          } else {
            // Just show quantity if no rate/total available
            rows.push({
              type: 'line',
              orderNo: drain.orderNo,
              label: drain.label || '',
              value: `${drain.qty} drain${drain.qty !== 1 ? 's' : ''}`
            });
          }
        }
      }
    }

    // Handle service breakdown (Microfiber Mopping, etc.)
    if (data.serviceBreakdown && Array.isArray(data.serviceBreakdown)) {
      for (const item of data.serviceBreakdown) {
        if (!shouldDisplayField(item)) continue;
        const hasRate = item.rate != null && item.rate !== '';
        const hasTotal = item.total != null && item.total !== '';

        if (hasRate || hasTotal) {
          pushRow(item, {
            type: 'atCharge',
            label: item.label || '',
            v1: String(item.qty || ''),
            v2: typeof item.rate === 'number' ? `$${item.rate.toFixed(2)}` : String(item.rate || ''),
            v3: typeof item.total === 'number' ? `$${item.total.toFixed(2)}` : String(item.total || '')
          });
        } else if (item.qty) {
          // Just show quantity if no rate/total available
          pushRow(item, {
            type: 'line',
            label: item.label || '',
            value: `${item.qty} ${item.unit || 'item'}${item.qty !== 1 ? 's' : ''}`
          });
        }
      }
    }

    // Handle windows (RPM Windows)
    if (data.windows && Array.isArray(data.windows)) {
      for (const window of data.windows) {
        if (!shouldDisplayField(window)) continue;
        if (window.qty > 0) {
          pushRow(window, {
            type: 'atCharge',
            label: window.label || '',
            v1: String(window.qty || ''),
            v2: typeof window.rate === 'number' ? `$${window.rate.toFixed(2)}` : String(window.rate || ''),
            v3: typeof window.total === 'number' ? `$${window.total.toFixed(2)}` : String(window.total || '')
          });
        }
      }
    }

    // Handle single service item (Carpet Clean, Strip & Wax, etc.)
    if (data.service && shouldDisplayField(data.service)) {
      const hasRate = data.service.rate != null && data.service.rate !== '';
      const hasTotal = data.service.total != null && data.service.total !== '';

      if (hasRate || hasTotal) {
        rows.push({
          type: 'atCharge',
          orderNo: data.service.orderNo,
          label: data.service.label || '',
          v1: String(data.service.qty || ''),
          v2: typeof data.service.rate === 'number' ? `$${data.service.rate.toFixed(2)}` : String(data.service.rate || ''),
          v3: typeof data.service.total === 'number' ? `$${data.service.total.toFixed(2)}` : String(data.service.total || '')
        });
      } else if (data.service.qty) {
        // Just show quantity if no rate/total available
        rows.push({
          type: 'line',
          orderNo: data.service.orderNo,
          label: data.service.label || '',
          value: `${data.service.qty} ${data.service.unit || 'item'}${data.service.qty !== 1 ? 's' : ''}`
        });
      }
    }

    // Handle restroom fixtures (Saniscrub)
    if (data.restroomFixtures && shouldDisplayField(data.restroomFixtures) && data.restroomFixtures.qty) {
      const hasRate = data.restroomFixtures.rate != null && data.restroomFixtures.rate !== '';
      const hasTotal = data.restroomFixtures.total != null && data.restroomFixtures.total !== '';

      if (hasRate || hasTotal) {
        rows.push({
          type: 'atCharge',
          orderNo: data.restroomFixtures.orderNo,
          label: data.restroomFixtures.label || 'Restroom Fixtures',
          v1: String(data.restroomFixtures.qty || ''),
          v2: typeof data.restroomFixtures.rate === 'number' ? `$${data.restroomFixtures.rate.toFixed(2)}` : String(data.restroomFixtures.rate || ''),
          v3: typeof data.restroomFixtures.total === 'number' ? `$${data.restroomFixtures.total.toFixed(2)}` : String(data.restroomFixtures.total || '')
        });
      } else {
        // Fallback: show quantity only
        rows.push({
          type: 'line',
          orderNo: data.restroomFixtures.orderNo,
          label: data.restroomFixtures.label || 'Restroom Fixtures',
          value: `${data.restroomFixtures.qty} fixture${data.restroomFixtures.qty !== 1 ? 's' : ''}`
        });
      }
    }

    // Handle non-bathroom area (Saniscrub)
    if (data.nonBathroomArea && shouldDisplayField(data.nonBathroomArea) && data.nonBathroomArea.qty) {
      const hasRate = data.nonBathroomArea.rate != null && data.nonBathroomArea.rate !== '';
      const hasTotal = data.nonBathroomArea.total != null && data.nonBathroomArea.total !== '';

      if (hasRate || hasTotal) {
        rows.push({
          type: 'atCharge',
          orderNo: data.nonBathroomArea.orderNo,
          label: data.nonBathroomArea.label || 'Non-Bathroom Area',
          v1: `${data.nonBathroomArea.qty || ''} ${data.nonBathroomArea.unit || ''}`,
          v2: typeof data.nonBathroomArea.rate === 'number' ? `$${data.nonBathroomArea.rate.toFixed(2)}` : String(data.nonBathroomArea.rate || ''),
          v3: typeof data.nonBathroomArea.total === 'number' ? `$${data.nonBathroomArea.total.toFixed(2)}` : String(data.nonBathroomArea.total || '')
        });
      } else {
        // Fallback: show quantity only
        rows.push({
          type: 'line',
          orderNo: data.nonBathroomArea.orderNo,
          label: data.nonBathroomArea.label || 'Non-Bathroom Area',
          value: `${data.nonBathroomArea.qty} ${data.nonBathroomArea.unit || 'sq ft'}`
        });
      }
    }

    // Handle Refresh Power Scrub area-based structure
    const refreshAreas = ['dumpster', 'patio', 'walkway', 'foh', 'boh', 'other'];
      for (const areaKey of refreshAreas) {
        if (data[areaKey] && typeof data[areaKey] === 'object') {
          const area = data[areaKey];
          if (!shouldDisplayField(area)) {
            continue;
          }

        if (serviceKey === 'refreshPowerScrub') {
          // console.log(`  └ Processing ${areaKey}:`, JSON.stringify(area, null, 2));
        }

        // Handle new calc-type format from frontend
        if (area.type === 'calc' && area.qty != null && area.rate != null && area.total != null) {
          rows.push({
            type: 'atCharge',
            label: area.label || areaKey.charAt(0).toUpperCase() + areaKey.slice(1),
            v1: String(area.qty || ''),
            v2: typeof area.rate === 'number' ? `$${area.rate.toFixed(2)}` : String(area.rate || ''),
            v3: typeof area.total === 'number' ? `$${area.total.toFixed(2)}` : String(area.total || '')
          });
        }
        // Handle legacy format
        else {
          const hasRate = area.rate != null && area.rate !== '';
          const hasTotal = area.total != null && area.total !== '';
          const hasQty = area.qty != null && area.qty !== '' && area.qty > 0;

          if (serviceKey === 'refreshPowerScrub') {
            // console.log(`  └ Processing ${areaKey}: qty=${area.qty}, rate=${area.rate}, total=${area.total}`);
          }

          if (hasQty && (hasRate || hasTotal)) {
            rows.push({
              type: 'atCharge',
              label: area.label || areaKey.charAt(0).toUpperCase() + areaKey.slice(1),
              v1: `${area.qty || ''} ${area.unit || ''}`.trim(),
              v2: typeof area.rate === 'number' ? `$${area.rate.toFixed(2)}` : String(area.rate || ''),
              v3: typeof area.total === 'number' ? `$${area.total.toFixed(2)}` : String(area.total || '')
            });
          } else if (hasQty) {
            // Just show quantity if no rate/total available
            rows.push({
              type: 'line',
              label: area.label || areaKey.charAt(0).toUpperCase() + areaKey.slice(1),
              value: `${area.qty} ${area.unit || 'service'}${area.qty !== 1 ? 's' : ''}`
            });
          }
        }
      }
    }

    // Add service info for Refresh Power Scrub
    if (data.serviceInfo && shouldDisplayField(data.serviceInfo) && data.serviceInfo.value) {
      pushRow(data.serviceInfo, {
        type: 'line',
        label: data.serviceInfo.label || 'Service Info',
        value: data.serviceInfo.value
      });
    }

    // Handle extra bags (SaniPod)
    if (data.extraBags && shouldDisplayField(data.extraBags) && data.extraBags.qty > 0) {
      const hasRate = data.extraBags.rate != null && data.extraBags.rate !== '';
      const hasTotal = data.extraBags.total != null && data.extraBags.total !== '';

      if (hasRate || hasTotal) {
        pushRow(data.extraBags, {
          type: 'atCharge',
          label: data.extraBags.label || 'Extra Bags',
          v1: String(data.extraBags.qty || ''),
          v2: typeof data.extraBags.rate === 'number' ? `$${data.extraBags.rate.toFixed(2)}` : String(data.extraBags.rate || ''),
          v3: typeof data.extraBags.total === 'number' ? `$${data.extraBags.total.toFixed(2)}` : String(data.extraBags.total || '')
        });
      } else {
        pushRow(data.extraBags, {
          type: 'line',
          label: data.extraBags.label || 'Extra Bags',
          value: `${data.extraBags.qty} bag${data.extraBags.qty !== 1 ? 's' : ''}`
        });
      }
    }

    // Handle installation (structured format with qty/rate/total)
    if (data.installation && shouldDisplayField(data.installation) && data.installation.qty > 0) {
      const hasRate = data.installation.rate != null && data.installation.rate !== '';
      const hasTotal = data.installation.total != null && data.installation.total !== '';

      if (hasRate || hasTotal) {
        pushRow(data.installation, {
          type: 'atCharge',
          label: data.installation.label || 'Installation',
          v1: String(data.installation.qty || ''),
          v2: typeof data.installation.rate === 'number' ? `$${data.installation.rate.toFixed(2)}` : String(data.installation.rate || ''),
          v3: typeof data.installation.total === 'number' ? `$${data.installation.total.toFixed(2)}` : String(data.installation.total || '')
        });
      } else {
        pushRow(data.installation, {
          type: 'line',
          label: data.installation.label || 'Installation',
          value: `${data.installation.qty} unit${data.installation.qty !== 1 ? 's' : ''}`
        });
      }
    }

    // Legacy installationFee format (for backward compatibility)
    if (data.installationFee && shouldDisplayField(data.installationFee) && data.installationFee.amount) {
      pushRow(data.installationFee, {
        type: 'line',
        label: data.installationFee.label || 'Installation Fee',
        value: typeof data.installationFee.amount === 'number' ? `$${data.installationFee.amount.toFixed(2)}` : String(data.installationFee.amount || '')
      });
    }

    // Handle trip charge (ElectrostaticSpray, Sani-Clean)
    if (data.tripCharge && shouldDisplayField(data.tripCharge) && data.tripCharge.amount != null && data.tripCharge.amount > 0) {
      pushRow(data.tripCharge, {
        type: 'line',
        label: data.tripCharge.label || 'Trip Charge',
        value: typeof data.tripCharge.amount === 'number' ? `$${data.tripCharge.amount.toFixed(2)}` : String(data.tripCharge.amount || '')
      });
    }

    // Add extras (warranty, luxury upgrades, etc.)
    if (data.warranty && shouldDisplayField(data.warranty) && data.warranty.qty) {
      const hasRate = data.warranty.rate != null && data.warranty.rate !== '';
      const hasTotal = data.warranty.total != null && data.warranty.total !== '';

      if (hasRate || hasTotal) {
        pushRow(data.warranty, {
          type: 'atCharge',
          label: data.warranty.label || 'Warranty',
          v1: String(data.warranty.qty || ''),
          v2: typeof data.warranty.rate === 'number' ? `$${data.warranty.rate.toFixed(2)}` : String(data.warranty.rate || ''),
          v3: typeof data.warranty.total === 'number' ? `$${data.warranty.total.toFixed(2)}` : String(data.warranty.total || '')
        });
      } else {
        // Fallback: show quantity only
        pushRow(data.warranty, {
          type: 'line',
          label: data.warranty.label || 'Warranty',
          value: `${data.warranty.qty} item${data.warranty.qty !== 1 ? 's' : ''}`
        });
      }
    }

    if (data.luxuryUpgrade && shouldDisplayField(data.luxuryUpgrade)) {
      pushRow(data.luxuryUpgrade, {
        type: 'line',
        label: data.luxuryUpgrade.label || 'Luxury Soap Upgrade',
        value: typeof data.luxuryUpgrade.total === 'number' ? `$${data.luxuryUpgrade.total.toFixed(2)}` : String(data.luxuryUpgrade.total || '')
      });
    }

    if (data.extraSoap && shouldDisplayField(data.extraSoap)) {
      pushRow(data.extraSoap, {
        type: 'line',
        label: data.extraSoap.label || 'Extra Soap',
        value: typeof data.extraSoap.total === 'number' ? `$${data.extraSoap.total.toFixed(2)}` : String(data.extraSoap.total || '')
      });
    }

    // Add pdfExtras (Saniclean additional rows)
    if (data.pdfExtras && Array.isArray(data.pdfExtras)) {
      for (const field of data.pdfExtras) {
        if (!shouldDisplayField(field)) continue;
        const rowType = field.type === 'atCharge'
          ? 'atCharge'
          : field.type === 'bold'
            ? 'bold'
            : 'line';
        let row = {
          type: rowType,
          label: field.label || '',
          value: field.value || '',
          gap: field.gap,
        };
        if (rowType === 'atCharge') {
          row.v1 = field.v1 ?? '';
          row.v2 = field.v2 ?? '';
          row.v3 = field.v3 ?? '';
        }
        pushRow(field, row);
      }
    }

    // Add metadata fields (pricing method, combined service, etc.)
    if (data.pricingMethod && shouldDisplayField(data.pricingMethod) && data.pricingMethod.value) {
      pushRow(data.pricingMethod, {
        type: 'line',
        label: data.pricingMethod.label || 'Pricing Method',
        value: data.pricingMethod.value
      });
    }

    if (data.pricingMode && shouldDisplayField(data.pricingMode) && data.pricingMode.value) {
      pushRow(data.pricingMode, {
        type: 'line',
        label: data.pricingMode.label || 'Pricing Mode',
        value: data.pricingMode.value
      });
    }

    if (data.soapType && shouldDisplayField(data.soapType) && data.soapType.value) {
      pushRow(data.soapType, {
        type: 'line',
        label: data.soapType.label || 'Soap Type',
        value: data.soapType.value
      });
    }

    if (data.combinedService && shouldDisplayField(data.combinedService) && data.combinedService.value) {
      pushRow(data.combinedService, {
        type: 'line',
        label: data.combinedService.label || 'Combined with',
        value: data.combinedService.value
      });
    }

    // Add frequency/location info
    if (data.frequency && shouldDisplayField(data.frequency) && data.frequency.value) {
      pushRow(data.frequency, {
        type: 'line',
        label: data.frequency.label || 'Frequency',
        value: data.frequency.value
      });
    }

    const pdfVisibility = serviceData.pdfFieldVisibility || {};
    const locationVisOverride = pdfVisibility.hasOwnProperty("location")
      ? pdfVisibility.location
      : undefined;
    const primaryLocationField = data.location && typeof data.location === "object"
      ? data.location
      : null;
    const fallbackLocationField = serviceData.location && typeof serviceData.location === "object"
      ? serviceData.location
      : null;
    const locationFieldForOrder = primaryLocationField || fallbackLocationField;
    const locationValue = primaryLocationField?.value ||
      (typeof data.location === "string" && data.location.trim() !== "" ? data.location : "") ||
      fallbackLocationField?.value ||
      "";
    const locationLabel = (locationFieldForOrder && (locationFieldForOrder.label || locationFieldForOrder.value)) ||
      fallbackLocationField?.label ||
      'Location';
    const shouldRenderLocation =
      Boolean(locationValue) &&
      (!locationFieldForOrder || shouldDisplayField(locationFieldForOrder)) &&
      (locationVisOverride !== false && locationVisOverride !== "false");

    if (shouldRenderLocation) {
      pushRow(locationFieldForOrder, {
        type: 'line',
        label: locationLabel,
        value: locationValue
      });
    }

    // Handle janitorial-specific text fields
    if (data.serviceType && shouldDisplayField(data.serviceType) && data.serviceType.type === 'text' && data.serviceType.value) {
      pushRow(data.serviceType, {
        type: 'line',
        label: data.serviceType.label || 'Service Type',
        value: data.serviceType.value
      });
    }

    if (data.otherTasks && shouldDisplayField(data.otherTasks) && data.otherTasks.type === 'text' && data.otherTasks.value) {
      pushRow(data.otherTasks, {
        type: 'line',
        label: data.otherTasks.label || 'Other Tasks',
        value: data.otherTasks.value
      });
    }

    if (data.vacuuming && shouldDisplayField(data.vacuuming) && data.vacuuming.type === 'text' && data.vacuuming.value) {
      pushRow(data.vacuuming, {
        type: 'line',
        label: data.vacuuming.label || 'Vacuuming',
        value: data.vacuuming.value
      });
    }

    if (data.dusting && shouldDisplayField(data.dusting) && data.dusting.type === 'text' && data.dusting.value) {
      pushRow(data.dusting, {
        type: 'line',
        label: data.dusting.label || 'Dusting',
        value: data.dusting.value
      });
    }

    if (data.visitsPerWeek && shouldDisplayField(data.visitsPerWeek) && data.visitsPerWeek.type === 'text' && data.visitsPerWeek.value) {
      pushRow(data.visitsPerWeek, {
        type: 'line',
        label: data.visitsPerWeek.label || 'Visits per Week',
        value: data.visitsPerWeek.value
      });
    }
    if (data.addonTime && shouldDisplayField(data.addonTime) && data.addonTime.type === 'text' && data.addonTime.value) {
      pushRow(data.addonTime, {
        type: 'line',
        label: data.addonTime.label || 'Add-on Time',
        value: data.addonTime.value
      });
    }

    // Add totals from new structured format
    if (data.totals) {
      const freqKey = detectServiceFrequencyKey(data);
      const freqGroup = determineFrequencyGroup(freqKey);
      const isMonthlyGroup = freqGroup === "monthly" || freqGroup === undefined;
      const isVisitGroup = freqGroup === "visit";

      const formatMoneyValue = (amount) => {
        if (typeof amount === "number") {
          return `$${amount.toFixed(2)}`;
        }
        if (amount === undefined || amount === null) {
          return "";
        }
        return String(amount);
      };

      const addBoldTotal = (field, options = {}) => {
        if (!field || !shouldDisplayField(field) || field.amount == null) return;
        const label = field.label || options.label || "Total";
        const value = options.value ?? formatMoneyValue(field.amount);
        const gap = field.gap ?? options.gap;
        pushRow(field, {
          type: "bold",
          label,
          value,
          gap,
        });
      };

      addBoldTotal(data.totals.perVisit);

      if (isMonthlyGroup) {
        addBoldTotal(data.totals.firstMonth || data.totals.monthly);
        addBoldTotal(data.totals.monthlyRecurring, { gap: "wide" });
      } else if (isVisitGroup) {
        addBoldTotal(data.totals.firstVisit || data.totals.firstMonth);
        addBoldTotal(data.totals.recurringVisit, { gap: "wide" });
      }

      addBoldTotal(data.totals.weekly);

      if (data.totals.contract && shouldDisplayField(data.totals.contract) && data.totals.contract.amount != null) {
        const formattedContract = formatMoneyValue(data.totals.contract.amount);
        const contractValue =
          typeof data.totals.contract.amount === "number"
            ? `$${data.totals.contract.amount.toFixed(2)} (${data.totals.contract.months || 12}mo)`
            : formattedContract;
        pushRow(data.totals.contract, {
          type: "bold",
          label: data.totals.contract.label || "Contract Total",
          value: contractValue,
        });
      }

      if (data.totals.annual && shouldDisplayField(data.totals.annual) && data.totals.annual.amount != null) {
        const formattedAnnual = formatMoneyValue(data.totals.annual.amount);
        const annualValue =
          typeof data.totals.annual.amount === "number"
            ? `$${data.totals.annual.amount.toFixed(2)} (${data.totals.annual.months || 12}mo)`
            : formattedAnnual;
        pushRow(data.totals.annual, {
          type: "bold",
          label: data.totals.annual.label || "Annual Total",
          value: annualValue,
        });
      }
    }

    // Add custom fields from new format
    if (data.customFields && Array.isArray(data.customFields)) {
      for (const field of data.customFields) {
        if (!shouldDisplayField(field)) continue;
        // Support both 'label' and 'name' properties
        const fieldLabel = field.label || field.name;

        if (field && fieldLabel) {
          // Handle different custom field types
          if (field.type === 'calc') {
            // Handle calc fields with calcValues structure (left @ middle = right)
            if (field.calcValues &&
                (field.calcValues.left || field.calcValues.middle || field.calcValues.right)) {
              pushRow(field, {
                type: 'atCharge',
                label: fieldLabel,
                v1: String(field.calcValues.left || ''),
                v2: String(field.calcValues.middle || ''),
                v3: String(field.calcValues.right || '')
              });
            }
            // Handle calc fields with legacy value structure (qty @ rate = total)
            else if (field.value && typeof field.value === 'object') {
              const calcValue = field.value;
              if (calcValue.qty != null && calcValue.rate != null && calcValue.total != null) {
                pushRow(field, {
                  type: 'atCharge',
                  label: fieldLabel,
                  v1: String(calcValue.qty || ''),
                  v2: typeof calcValue.rate === 'number' ? `$${calcValue.rate.toFixed(2)}` : String(calcValue.rate || ''),
                  v3: typeof calcValue.total === 'number' ? `$${calcValue.total.toFixed(2)}` : String(calcValue.total || '')
                });
              }
            }
          } else if (field.type === 'money' || field.type === 'dollar') {
            // Handle money/dollar fields
            if (field.value !== undefined && field.value !== '') {
              const amount = typeof field.value === 'number' ? field.value : parseFloat(field.value) || 0;
              pushRow(field, {
                type: 'line',
                label: fieldLabel,
                value: `$${amount.toFixed(2)}`
              });
            }
          } else if (field.value !== undefined && field.value !== '') {
            // Handle text and other field types
            let value = String(field.value);
            if (field.type === 'dollar' && typeof field.value === 'number') {
              value = `$${field.value.toFixed(2)}`;
            }
            rows.push({
              type: 'line',
              label: fieldLabel,
              value
            });
          }
        }
      }
    }

    // Add notes if present
    if (data.notes && data.notes.trim()) {
      rows.push({ type: 'line', label: 'Notes', value: data.notes });
    }

    if (serviceKey === 'refreshPowerScrub') {
      // console.log(`  └ Generated ${rows.length} rows for Refresh Power Scrub`);
      // console.log(`  └ Rows:`, rows);
    }

    return {
      heading: label || data.displayName || serviceKey.toUpperCase(),
      rows
    };
  }

  // OLD FORMAT handler (simplified logging)
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

  // Add custom fields if present (OLD format)
  if (data.customFields && Array.isArray(data.customFields)) {
    for (const field of data.customFields) {
      // Support both 'label' and 'name' properties for OLD format too
      const fieldLabel = field.label || field.name;

      if (field && fieldLabel) {
        // Handle calc fields with calcValues structure
        if (field.type === 'calc' && field.calcValues &&
            (field.calcValues.left || field.calcValues.middle || field.calcValues.right)) {
          rows.push({
            type: 'atCharge',
            label: fieldLabel,
            v1: String(field.calcValues.left || ''),
            v2: String(field.calcValues.middle || ''),
            v3: String(field.calcValues.right || '')
          });
        }
        // Handle other field types with value property
        else if (field.value !== undefined && field.value !== '') {
          let value = String(field.value);
          // Format based on field type
          if (field.type === 'dollar' && typeof field.value === 'number') {
            value = `$${field.value.toFixed(2)}`;
          }
          rows.push({ type: 'line', label: fieldLabel, value });
        }
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
    if (!shouldDisplayField(field)) continue;
    // Support both 'label' and 'name' properties
    const fieldLabel = field.label || field.name;

    if (field && fieldLabel) {
      // Handle calc fields with calcValues structure
      if (field.type === 'calc' && field.calcValues &&
          (field.calcValues.left || field.calcValues.middle || field.calcValues.right)) {
        rows.push({
          type: 'atCharge',
          label: fieldLabel,
          v1: String(field.calcValues.left || ''),
          v2: String(field.calcValues.middle || ''),
          v3: String(field.calcValues.right || '')
        });
      }
      // Handle other field types with value property
      else if (field.value !== undefined && field.value !== '') {
        let value = String(field.value);

        // Format based on field type
        if (field.type === 'dollar') {
          const numValue = parseFloat(field.value);
          if (!isNaN(numValue)) {
            value = `$${numValue.toFixed(2)}`;
          }
        }

        const rowType = field.type === 'calc' ? 'bold' : 'line';
        rows.push({ type: rowType, label: fieldLabel, value });
      }
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

    // Special debugging for refreshPowerScrub only
    if (data.serviceId === 'refreshPowerScrub') {
      // console.log('🔍 [REFRESH POWER SCRUB DEBUG] Service detection:');
      // console.log('  └ isActive:', data.isActive);
      // console.log('  └ totals.perVisit.amount:', data.totals?.perVisit?.amount);

      // Check individual areas
      const refreshAreas = ['dumpster', 'patio', 'walkway', 'foh', 'boh', 'other'];
      for (const area of refreshAreas) {
        if (data[area]) {
          // console.log(`  └ ${area}: qty=${data[area].qty}, total=${data[area].total}`);
        }
      }
    }

    // Respect isActive at wrapper or data level
    if (serviceData.isActive === false) return false;
    if (data.isActive === false) return false;

    // Core totals we care about - FIXED: Check for numeric values > 0
    // Check both old flat format and new structured format
    if (
      (data.weeklyTotal && (typeof data.weeklyTotal === 'number' ? data.weeklyTotal > 0 : parseFloat(data.weeklyTotal) > 0)) ||
      (data.monthlyTotal && (typeof data.monthlyTotal === 'number' ? data.monthlyTotal > 0 : parseFloat(data.monthlyTotal) > 0)) ||
      (data.contractTotal && (typeof data.contractTotal === 'number' ? data.contractTotal > 0 : parseFloat(data.contractTotal) > 0)) ||
      (data.firstVisit && (typeof data.firstVisit === 'number' ? data.firstVisit > 0 : parseFloat(data.firstVisit) > 0)) ||
      (data.ongoingMonthly && (typeof data.ongoingMonthly === 'number' ? data.ongoingMonthly > 0 : parseFloat(data.ongoingMonthly) > 0))
    ) {
      if (data.serviceId === 'refreshPowerScrub') {
        // console.log('  └ DETECTED via old format totals ✓');
      }
      return true;
    }

    // Check NEW structured totals format
    if (data.totals) {
      if (
        (data.totals.weekly && data.totals.weekly.amount) ||
        (data.totals.monthly && data.totals.monthly.amount) ||
        (data.totals.monthlyRecurring && data.totals.monthlyRecurring.amount) ||
        (data.totals.contract && data.totals.contract.amount) ||
        (data.totals.firstMonth && data.totals.firstMonth.amount) ||
        (data.totals.perVisit && data.totals.perVisit.amount) ||
        (data.totals.annual && data.totals.annual.amount)
      ) {
        if (data.serviceId === 'refreshPowerScrub') {
          // console.log('  └ DETECTED via new structured totals ✓');
        }
        return true;
      }
    }

    if (data.total || data.amount || data.charge) {
      if (data.serviceId === 'refreshPowerScrub') {
        // console.log('  └ DETECTED via data.total/amount/charge ✓');
      }
      return true;
    }

    // Additional specific field checks for various service types
    if (
      (data.fixtureCount && data.fixtureCount > 0) ||
      (data.drainCount && data.drainCount > 0) ||
      (data.squareFeet && data.squareFeet > 0) ||
      (data.quantity && data.quantity > 0) ||
      (data.trapCount && data.trapCount > 0) ||
      (data.hoursPerWeek && data.hoursPerWeek > 0) ||
      (data.windowCount && data.windowCount > 0)
    ) {
      if (data.serviceId === 'refreshPowerScrub') {
        // console.log('  └ DETECTED via specific field checks ✓');
      }
      return true;
    }

    // Check Refresh Power Scrub areas specifically
    if (data.serviceId === 'refreshPowerScrub') {
      const refreshAreas = ['dumpster', 'patio', 'walkway', 'foh', 'boh', 'other'];
      for (const area of refreshAreas) {
        if (data[area] && typeof data[area] === 'object') {
          const areaData = data[area];
          if (areaData.total && areaData.total > 0) {
            // console.log(`  └ DETECTED via ${area} total: ${areaData.total} ✓`);
            return true;
          }
          if (areaData.qty && areaData.qty > 0) {
            // console.log(`  └ DETECTED via ${area} qty: ${areaData.qty} ✓`);
            return true;
          }
        }
      }
    }

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
      if (hasCustomValue) {
        if (data.serviceId === 'refreshPowerScrub') {
          // console.log('  └ DETECTED via custom fields ✓');
        }
        return true;
      }
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
      if (typeof val === "number" && val > 0) {
        if (data.serviceId === 'refreshPowerScrub') {
          // console.log(`  └ DETECTED via numeric field ${key}: ${val} ✓`);
        }
        return true;
      }
      if (typeof val === "string" && val.trim() !== "" && val !== "0") {
        if (data.serviceId === 'refreshPowerScrub') {
          // console.log(`  └ DETECTED via string field ${key}: ${val} ✓`);
        }
        return true;
      }
    }

    if (data.serviceId === 'refreshPowerScrub') {
      // console.log('  └ NOT DETECTED - returning false ❌');
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

    servicesTopRowLatex = buildServiceRowSequence(filteredTopRowCols);
    servicesBottomRowLatex = buildServiceRowSequence(filteredBottomRowCols);

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
          refreshSectionLatex += `\\serviceSection{${heading}}\n`;
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
        serviceNotesLatex += `\\serviceSection{${latexEscape(
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
    "electrostaticSpray",
  ];

  for (const serviceKey of allServiceKeys) {
    const svc = services[serviceKey];
    const isUsed = svc && isServiceUsed(svc);

    // Debug logging only for refreshPowerScrub
    if (svc && serviceKey === 'refreshPowerScrub') {
      const data = svc.formData || svc;
      // console.log(`🔍 [REFRESH POWER SCRUB] Service detection:`)
      // console.log(`  └ isActive (wrapper): ${svc.isActive}`);
      // console.log(`  └ isActive (data): ${data.isActive}`);
      // console.log(`  └ weeklyTotal: ${data.weeklyTotal}`);
      // console.log(`  └ monthlyTotal: ${data.monthlyTotal}`);
      // console.log(`  └ contractTotal: ${data.contractTotal}`);
      // console.log(`  └ isUsed: ${isUsed}`);
    }

    if (isUsed) {
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

  // Debug logging only for Refresh Power Scrub
  const refreshPowerScrubUsed = Object.keys(usedServices).includes('refreshPowerScrub');
  if (refreshPowerScrubUsed || services.refreshPowerScrub) {
    // console.log(`🔍 [REFRESH POWER SCRUB] Services detected as used:`, Object.keys(usedServices));
    // console.log(`🔍 [REFRESH POWER SCRUB] Total used services count: ${Object.keys(usedServices).length}`);
    // console.log(`🔍 [REFRESH POWER SCRUB] Refresh Power Scrub in used services: ${refreshPowerScrubUsed}`);
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

  // Debug transformation results only for Refresh Power Scrub
  if (refreshPowerScrubUsed || services.refreshPowerScrub) {
    // console.log(`🔍 [REFRESH POWER SCRUB] Transformed services - topRow: ${topRowCols.length} columns, bottomRow: ${bottomRowCols.length} columns`);
  }

  const filteredTopRowCols = filterServiceColumns(topRowCols);
  const filteredBottomRowCols = filterServiceColumns(bottomRowCols);

  // Debug filtered results only for Refresh Power Scrub
  if (refreshPowerScrubUsed || services.refreshPowerScrub) {
    // console.log(`🔍 [REFRESH POWER SCRUB] After filtering - topRow: ${filteredTopRowCols.length} columns, bottomRow: ${filteredBottomRowCols.length} columns`);
  }

  // Generate LaTeX for the service rows
  servicesTopRowLatex = buildServiceRowSequence(filteredTopRowCols);
  servicesBottomRowLatex = buildServiceRowSequence(filteredBottomRowCols);

  // Debug generated LaTeX only for Refresh Power Scrub
  if (refreshPowerScrubUsed || services.refreshPowerScrub) {
    // console.log(`🔍 [REFRESH POWER SCRUB] Generated LaTeX - topRow length: ${servicesTopRowLatex.length}, bottomRow length: ${servicesBottomRowLatex.length}`);
  }


  // Refresh Power Scrub from frontend area-based format
  if (usedServices.refreshPowerScrub) {
    const refreshData = usedServices.refreshPowerScrub.formData || usedServices.refreshPowerScrub;

    if (refreshData && refreshData.isActive) {
      // console.log('🔍 [REFRESH POWER SCRUB] Building custom refresh section');
      // console.log('🔍 [REFRESH POWER SCRUB] Full refresh data:', JSON.stringify(refreshData, null, 2));

      // Check for new services structure vs old direct area structure
      let enabledAreas = [];

      const isVisibleArea = (area) => area?.isDisplay !== false;

      if (refreshData.services) {
        // New structure: services.dumpster, services.frontHouse, etc.
        // console.log('🔍 [REFRESH POWER SCRUB] Using NEW services structure');
        const serviceKeys = Object.keys(refreshData.services);

        for (const serviceKey of serviceKeys) {
          const serviceData = refreshData.services[serviceKey];
          if (
            serviceData &&
            serviceData.enabled &&
            isVisibleArea(serviceData) &&
            serviceData.total &&
            serviceData.total.value > 0
          ) {
            // Map service keys back to area names for display
            const displayName = serviceKey === 'frontHouse' ? 'FRONT HOUSE' :
                              serviceKey === 'backHouse' ? 'BACK HOUSE' :
                              serviceKey.toUpperCase();

            enabledAreas.push({
              key: serviceKey,
              originalKey: serviceKey,
              displayName: displayName,
              data: serviceData
            });
          }
        }
      } else {
        // Old structure: direct area keys (dumpster, patio, foh, boh, etc.)
        // console.log('🔍 [REFRESH POWER SCRUB] Using LEGACY area structure');
        const areas = ['dumpster', 'patio', 'walkway', 'foh', 'boh', 'other'];

        for (const areaKey of areas) {
          const legacyArea = refreshData[areaKey];
          if (
            legacyArea &&
            typeof legacyArea === 'object' &&
            legacyArea.isDisplay !== false &&
            legacyArea.type === 'calc' &&
            legacyArea.qty > 0
          ) {
            const displayName = areaKey === 'foh' ? 'FRONT HOUSE' :
                              areaKey === 'boh' ? 'BACK HOUSE' :
                              areaKey.toUpperCase();

            enabledAreas.push({
              key: areaKey,
              originalKey: areaKey,
              displayName: displayName,
              data: refreshData[areaKey]
            });
          }
        }
      }

      // console.log(`🔍 [REFRESH POWER SCRUB] Found ${enabledAreas.length} enabled areas:`, enabledAreas.map(a => a.key));

      if (enabledAreas.length > 0) {
        const maxAreas = Math.min(enabledAreas.length, 4); // Max 4 areas to fit on page
        const colCount = maxAreas + 1; // +1 for the label column
        const colSpec = "|l|" + Array(maxAreas).fill("Y").join("|") + "|"; // l for labels, Y for flexible areas

        // Build header row with area names (empty first cell for label column)
        const headerRow = "  & " +
          enabledAreas.slice(0, maxAreas)
            .map(area => `\\textbf{\\textcolor{serviceHeaderBlue}{${latexEscape(area.displayName)}}}`)
            .join(" & ") +
          " \\\\";

        // Helper function to get pricing method display for each area
        const getPricingMethodDisplay = (area) => {
          if (refreshData.services) {
            // New structure: get from pricingMethod field
            return area.data.pricingMethod ? area.data.pricingMethod.value : 'N/A';
          } else {
            // Legacy structure: infer from data properties
            if (area.data.unit === 'hours') return 'Per Hour';
            if (area.data.unit === 'workers') return 'Per Worker';
            if (area.data.unit === 'sq ft') return 'Square Feet';
            return 'Service';
          }
        };

        // Build pricing method row
        const pricingMethodRow = "  Method & " +
          enabledAreas.slice(0, maxAreas)
            .map(area => `\\scriptsize ${latexEscape(getPricingMethodDisplay(area))}`)
            .join(" & ") +
          " \\\\";

        // Helper function to detect if this is square footage pricing and get the breakdown (for legacy compatibility)
        const getAreaBreakdown = (area) => {
          // Check if this area has square footage breakdown data in the original service structure
          const originalArea = refreshData[area.originalKey];
          if (!originalArea) return null;

          // Look for square footage fields in the original data structure
          if (originalArea.insideSqFt !== undefined || originalArea.outsideSqFt !== undefined) {
            return {
              fixed: originalArea.sqFtFixedFee || 200,
              insideSqFt: originalArea.insideSqFt || 0,
              insideRate: originalArea.insideRate || 0.6,
              outsideSqFt: originalArea.outsideSqFt || 0,
              outsideRate: originalArea.outsideRate || 0.4
            };
          }
          return null;
        };

        // Helper function to get calculation details for each area
        const readFieldValue = (field) => {
          if (field === null || field === undefined) return undefined;
          return typeof field === "object" && "value" in field ? field.value : field;
        };

        const getCalculationDetails = (area) => {
          if (refreshData.services) {
            // New structure: detailed breakdown
            const serviceData = area.data;
            let details = [];

            // Handle different pricing methods
            if (serviceData.hours) {
              details.push(`${serviceData.hours.quantity} hrs @ \\$${serviceData.hours.priceRate}`);
            } else if (serviceData.workersCalc) {
              details.push(`${serviceData.workersCalc.quantity} workers @ \\$${serviceData.workersCalc.priceRate}`);
            } else if (serviceData.insideSqft || serviceData.outsideSqft) {
              // Square feet breakdown
              if (serviceData.fixedFee) {
                details.push(`Fixed: \\$${serviceData.fixedFee.value}`);
              }
              if (serviceData.insideSqft && serviceData.insideSqft.quantity > 0) {
                details.push(`In: ${serviceData.insideSqft.quantity} @ \\$${serviceData.insideSqft.priceRate}`);
              }
              if (serviceData.outsideSqft && serviceData.outsideSqft.quantity > 0) {
                details.push(`Out: ${serviceData.outsideSqft.quantity} @ \\$${serviceData.outsideSqft.priceRate}`);
              }
            } else if (serviceData.plan) {
              // Handle preset plans - special case for patio with add-on
              if (area.key === 'patio' && serviceData.includePatioAddon) {
                // Check if this is the new format with includePatioAddon field
                if (serviceData.includePatioAddon.value === true) {
                  details.push(`Patio: \\$800 + Add-on: \\$500`);
                } else {
                  details.push(`Plan: ${serviceData.plan.value}`);
                }
              } else if (area.key === 'patio') {
                // Patio without add-on or old format
                details.push(`Patio Service: \\$800`);
              } else {
                // Other preset areas (dumpster, foh, boh, etc.)
                details.push(`Plan: ${serviceData.plan.value}`);
              }
            }

            if (area.key === 'backHouse') {
              const smallQty = readFieldValue(serviceData.smallMediumQuantity);
              const smallRate = readFieldValue(serviceData.smallMediumRate);
              const smallTotal = readFieldValue(serviceData.smallMediumTotal);
              const largeQty = readFieldValue(serviceData.largeQuantity);
              const largeRate = readFieldValue(serviceData.largeRate);
              const largeTotal = readFieldValue(serviceData.largeTotal);

              if (smallQty && smallRate) {
                details.push(`Small/Med: ${smallQty} @ \\$${smallRate}${smallTotal ? ` = \\$${smallTotal}` : ""}`);
              }
              if (largeQty && largeRate) {
                details.push(`Large: ${largeQty} @ \\$${largeRate}${largeTotal ? ` = \\$${largeTotal}` : ""}`);
              }
            }

            if (!details.length) {
              const presetQty = readFieldValue(serviceData.presetQuantity ?? serviceData.savedPresetQuantity);
              const presetRate = readFieldValue(serviceData.presetRate ?? serviceData.savedPresetRate);
              const presetTotal = readFieldValue(serviceData.total);
              if (presetQty || presetRate) {
                const parts = [];
                if (presetQty) {
                  parts.push(`${presetQty} pkg${presetQty !== 1 ? "s" : ""}`);
                }
                if (presetRate) {
                  parts.push(`@ \\$${presetRate}`);
                }
                if (presetTotal) {
                  parts.push(`= \\$${Number(presetTotal).toFixed(2)}`);
                }
                details.push(`Preset: ${parts.join(" ")}`);
              }
            }

            return details.length > 0 ? details.join(", ") : "Service";
          } else {
            // Legacy structure: use old logic
            const breakdown = getAreaBreakdown(area);
            if (breakdown) {
              let details = [];
              if (breakdown.fixed > 0) {
                details.push(`Fixed: \\$${breakdown.fixed.toFixed(2)}`);
              }
              if (breakdown.insideSqFt > 0) {
                details.push(`Inside: ${breakdown.insideSqFt} @ \\$${breakdown.insideRate}`);
              }
              if (breakdown.outsideSqFt > 0) {
                details.push(`Outside: ${breakdown.outsideSqFt} @ \\$${breakdown.outsideRate}`);
              }
              return details.length > 0 ? details.join(", ") : `${area.data.qty} ${area.data.unit || 'service'}${area.data.qty !== 1 ? 's' : ''}`;
            } else {
              return `${area.data.qty} ${area.data.unit || 'service'}${area.data.qty !== 1 ? 's' : ''}`;
            }
          }
        };

        // Build calculation details row
        const detailsRow = "  Details & " +
          enabledAreas.slice(0, maxAreas)
            .map(area => `\\scriptsize ${getCalculationDetails(area)}`)
            .join(" & ") +
          " \\\\";

        // Build frequency row
        const frequencyRow = "  Frequency & " +
          enabledAreas.slice(0, maxAreas)
            .map(area => {
              if (refreshData.services) {
                return `\\scriptsize ${latexEscape(area.data.frequency ? area.data.frequency.value : 'TBD')}`;
              } else {
                return `\\scriptsize TBD`; // Legacy doesn't have frequency in this format
              }
            })
            .join(" & ") +
          " \\\\";

        // Build total row
        const totalRow = "  Total & " +
          enabledAreas.slice(0, maxAreas)
            .map(area => {
              if (refreshData.services) {
                return `\\textbf{\\textcolor{linegray}{\\$${area.data.total.value.toFixed(2)}}}`;
              } else {
                return `\\textbf{\\textcolor{linegray}{\\$${area.data.total.toFixed(2)}}}`;
              }
            })
            .join(" & ") +
          " \\\\";

        // ✅ NEW: Build contract row showing each area's contract total
        const contractRow = "  Contract & " +
          enabledAreas.slice(0, maxAreas)
            .map(area => {
              if (refreshData.services && area.data.contract) {
                const contractTotal = area.data.contract.total || 0;
                const contractMonths = area.data.contract.quantity || 12;
                return `\\textbf{\\textcolor{linegray}{\\$${contractTotal.toFixed(2)}}} \\scriptsize{(${contractMonths}mo)}`;
              } else {
                return "\\textbf{TBD}";
              }
            })
            .join(" & ") +
          " \\\\";

        refreshSectionLatex += "\\vspace{0.9em}\n";
        refreshSectionLatex += `\\serviceSection{REFRESH POWER SCRUB}\n`;
        refreshSectionLatex += "\\vspace{0.25em}\n";
        refreshSectionLatex += "\\noindent\n";
        refreshSectionLatex += `\\begin{tabularx}{\\textwidth}{${colSpec}}\n`;
        refreshSectionLatex += "  \\hline\n" + headerRow + "\n";
        refreshSectionLatex += "  \\hline\n" + pricingMethodRow + "\n";
        refreshSectionLatex += "  \\hline\n" + detailsRow + "\n";
        refreshSectionLatex += "  \\hline\n" + frequencyRow + "\n";
        refreshSectionLatex += "  \\hline\n" + totalRow + "\n";
        refreshSectionLatex += "  \\hline\n" + contractRow + "\n";
        refreshSectionLatex += "  \\hline\n";
        refreshSectionLatex += "\\end{tabularx}\n";

        // console.log(`🔍 [REFRESH POWER SCRUB] Generated enhanced table with ${maxAreas} areas (${colCount} total columns)`);
      }
    }
  }

  // Legacy Refresh Power Scrub from columns/freqLabels format (for backward compatibility)
  else if (services.refreshPowerScrub) {
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
          refreshSectionLatex += `\\serviceSection{${heading}}\n`;
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
      serviceNotesLatex += `\\serviceSection{${latexEscape(
        notes.heading || "SERVICE NOTES"
      )}}\n`;
      serviceNotesLatex += "\\vspace{0.35em}\n";
      for (let i = 0; i < lines; i++) {
        const content = textLines[i] ? latexEscape(textLines[i]) : "";
        serviceNotesLatex += `\\filledline{ ${content} }\\\\[0.6em]\n`;
      }
    }
  }

  // Final debug summary only for Refresh Power Scrub
  // if (refreshPowerScrubUsed || services.refreshPowerScrub) {
  //   console.log(`✅ [REFRESH POWER SCRUB] Services LaTeX generation complete:`);
  //   console.log(`  └ Top row LaTeX: ${servicesTopRowLatex ? 'Generated' : 'Empty'} (${servicesTopRowLatex.length} chars)`);
  //   console.log(`  └ Bottom row LaTeX: ${servicesBottomRowLatex ? 'Generated' : 'Empty'} (${servicesBottomRowLatex.length} chars)`);
  //   console.log(`  └ Refresh section LaTeX: ${refreshSectionLatex ? 'Generated' : 'Empty'} (${refreshSectionLatex.length} chars)`);
  //   console.log(`  └ Service notes LaTeX: ${serviceNotesLatex ? 'Generated' : 'Empty'} (${serviceNotesLatex.length} chars)`);
  // }

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
// ✅ NEW: Added watermark parameter for draft PDF generation
export async function compileCustomerHeader(body = {}, options = {}) {
  const { watermark = false } = options;

  console.log('🔍 [PDF COMPILE] Starting compilation with options:', {
    templatePath: PDF_HEADER_TEMPLATE_PATH,
    watermark,
    status: body.status,
  });

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
    ...buildProductsLatex(body.products || {}, body.products?.customColumns || { products: [], dispensers: [] }),
    ...buildServicesLatex(body.services || {}),
    // ✅ NEW: Add watermark flag to view for template
    includeWatermark: watermark,
  };

  // console.log('🔍 [TEMPLATE DEBUG] Template view data generated:', {
  //   headerTitle: view.headerTitle,
  //   headerRowsCount: view.headerRows?.length || 0,
  //   servicesTopRowLength: view.servicesTopRowLatex?.length || 0,
  //   servicesBottomRowLength: view.servicesBottomRowLatex?.length || 0,
  //   refreshSectionLength: view.refreshSectionLatex?.length || 0,
  // });

  const template = await fs.readFile(PDF_HEADER_TEMPLATE_PATH, "utf8");
  // console.log('🔍 [TEMPLATE DEBUG] Template file read successfully, length:', template.length);
  // console.log('🔍 [TEMPLATE DEBUG] Template contains servicesTopRowLatex placeholder:', template.includes('{{{servicesTopRowLatex}}}'));
  // console.log('🔍 [TEMPLATE DEBUG] Template contains servicesBottomRowLatex placeholder:', template.includes('{{{servicesBottomRowLatex}}}'));

  let tex = Mustache.render(template, view);
  console.log('🔍 [PDF COMPILE] After Mustache rendering, LaTeX length:', tex.length);

  // ✅ NEW: Add watermark overlay if requested
  if (watermark) {
    console.log('💧 [WATERMARK] Adding DRAFT watermark to PDF');
    const { preamble, command } = buildWatermarkLatex();

    // Insert packages in preamble (before \begin{document})
    tex = tex.replace(/\\begin\{document\}/, preamble + '\\begin{document}');

    // Insert watermark command after \begin{document}
    tex = tex.replace(/\\begin\{document\}/, '\\begin{document}\n' + command);
  }

  // ✅ NEW: Add Service Agreement if checkbox is checked
  if (body.serviceAgreement && body.serviceAgreement.includeInPdf) {
    console.log('📄 [SERVICE AGREEMENT] Including Service Agreement in PDF');
    const serviceAgreementLatex = buildServiceAgreementLatex(body.serviceAgreement);
    // Insert before \end{document}
    tex = tex.replace(/\\end\{document\}/, serviceAgreementLatex + '\n\\end{document}');
  } else {
    console.log('📄 [SERVICE AGREEMENT] Service Agreement not included (checkbox not checked or data missing)');
  }

  const headerDir = path.dirname(PDF_HEADER_TEMPLATE_PATH);
  const logoBuf = await fs.readFile(path.join(headerDir, "images", "Envimaster.png"));

  const files = [
    { field: "main", name: "doc.tex", data: Buffer.from(tex, "utf8"), type: "application/x-tex" },
    { field: "assets", name: "images/Envimaster.png", data: logoBuf, type: "image/png" },
  ];
  const manifest = { "Envimaster.png": "images/Envimaster.png" };

  const buffer = await remotePostMultipart("pdf/compile-bundle", files, { assetsManifest: manifest });

  // Extract customer name from body for dynamic filename
  const customerName = extractCustomerName(body.customerName, body.headerRows);
  const filename = `${customerName}.pdf`;

  return { buffer, filename };
}

// Helper function to extract customer name from headerRows or customerName field
function extractCustomerName(customerNameFromBody, headerRows = []) {
  // First, try to use customerName directly if provided
  if (customerNameFromBody && customerNameFromBody.trim()) {
    return sanitizeFilename(customerNameFromBody.trim());
  }

  // Fallback: search in headerRows for CUSTOMER NAME field
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
