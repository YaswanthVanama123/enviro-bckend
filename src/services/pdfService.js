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

  // Filter: Only include products that are actually used (have qty > 0 or total > 0)
  const filterUsedProducts = (productsList) => {
    return (productsList || []).filter(product => {
      // Check if product has quantity or any price/total
      const hasQty = product.qty && product.qty > 0;
      const hasTotal = product.extPrice || product.totalOverride;
      const hasAnyPrice = product.unitPrice || product.unitPriceOverride || product.warrantyPriceOverride;

      return hasQty || hasTotal || hasAnyPrice;
    });
  };

  const usedSmallProducts = filterUsedProducts(smallProducts);
  const usedDispensers = filterUsedProducts(dispensers);
  const usedBigProducts = filterUsedProducts(bigProducts);

  // Combine all used products
  const allUsedProducts = [...usedSmallProducts, ...usedDispensers, ...usedBigProducts];

  // If no products are used, return empty
  if (allUsedProducts.length === 0) {
    return { productsColSpecLatex: "Y", productsHeaderRowLatex: "", productsBodyRowsLatex: "" };
  }

  // Build table with used products only
  const headers = ["Product", "Qty", "Unit Price", "Ext Price", "Warranty", "Replacement", "Total"];
  const colSpec = headers.map(() => "Y").join("|");
  const headerRowLatex = headers.map((h) => `\\textbf{${latexEscape(h)}}`).join(" & ") + " \\\\ \\hline\n";

  const bodyRowsLatex = allUsedProducts
    .map((p) => {
      const name = p.customName || p.productKey || "";
      const qty = p.qty || "";
      const unitPrice = p.unitPriceOverride || p.unitPrice || "";
      const extPrice = p.extPrice || "";
      const warranty = p.warrantyPriceOverride || "";
      const replacement = p.replacementPriceOverride || "";
      const total = p.totalOverride || (p.extPrice || 0) + (warranty || 0) + (replacement || 0);

      return [
        latexEscape(name),
        latexEscape(String(qty)),
        latexEscape(unitPrice ? `$${unitPrice}` : ""),
        latexEscape(extPrice ? `$${extPrice}` : ""),
        latexEscape(warranty ? `$${warranty}` : ""),
        latexEscape(replacement ? `$${replacement}` : ""),
        latexEscape(total ? `$${total}` : "")
      ].join(" & ") + " \\\\ \\hline\n";
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
  // Helper: Check if a service has actual data (is used)
  const isServiceUsed = (serviceData) => {
    if (!serviceData) return false;
    if (serviceData.isActive === false) return false;

    // Check for any meaningful data
    if (serviceData.weeklyTotal || serviceData.monthlyTotal || serviceData.contractTotal) return true;
    if (serviceData.total || serviceData.charge || serviceData.amount) return true;

    // Check for any custom fields
    if (serviceData.customFields && serviceData.customFields.length > 0) return true;

    // Check for any quantity/count fields
    const keys = Object.keys(serviceData);
    for (const key of keys) {
      const val = serviceData[key];
      if (typeof val === 'number' && val > 0) return true;
      if (typeof val === 'string' && val.trim() !== '' && val !== '0') {
        // Ignore internal fields
        if (!['isActive', 'pricingMode', 'location'].includes(key)) return true;
      }
    }

    return false;
  };

  // Check if services are in topRow/bottomRow format (PDF format)
  const hasTopBottomFormat = services.topRow || services.bottomRow;

  if (hasTopBottomFormat) {
    // Services are already in PDF format (topRow/bottomRow)
    // Filter columns to only include those with data
    const filterServiceColumns = (cols) => {
      if (!cols || !Array.isArray(cols)) return [];
      return cols.filter(col => {
        if (!col) return false;
        // If column has rows with data, keep it
        if (col.rows && col.rows.length > 0) {
          // Check if any row has a value
          return col.rows.some(row => row && (row.value || row.v1 || row.v2 || row.v3));
        }
        return false;
      });
    };

    const topRowCols = services.topRow || [];
    const bottomRowCols = services.bottomRow || services.secondRow || [];

    const filteredTopRowCols = filterServiceColumns(topRowCols);
    const filteredBottomRowCols = filterServiceColumns(bottomRowCols);

    const servicesTopRowLatex = buildServicesRow(filteredTopRowCols);
    const servicesBottomRowLatex = buildServicesRow(filteredBottomRowCols);

    let refreshSectionLatex = "";
    const sec = services.refreshPowerScrub;
    if (sec && Array.isArray(sec.columns) && sec.columns.length > 0) {
      // Check if refresh section has data
      const hasData = sec.columns.some(c => c && c.trim() !== '');
      if (hasData) {
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
    }

    let serviceNotesLatex = "";
    if (services.notes) {
      const notes = services.notes;
      const textLines = Array.isArray(notes.textLines) ? notes.textLines : [];
      const lines = textLines.length || notes.lines || 3;
      // Only show notes if there's actual content
      const hasContent = textLines.some(line => line && line.trim() !== '');
      if (hasContent || lines > 0) {
        serviceNotesLatex += "\\vspace{1.0em}\n";
        serviceNotesLatex += `\\serviceBigHeading{${latexEscape(notes.heading || "SERVICE NOTES")}}\n`;
        serviceNotesLatex += "\\vspace{0.35em}\n";
        for (let i = 0; i < lines; i++) {
          const content = textLines[i] ? latexEscape(textLines[i]) : "";
          serviceNotesLatex += `\\filledline{ ${content} }\\\\[0.6em]\n`;
        }
      }
    }

    return { servicesTopRowLatex, servicesBottomRowLatex, refreshSectionLatex, serviceNotesLatex };
  }

  // Services are in storage format (individual service objects)
  // Need to transform AND filter
  console.log('[PDF Service] Converting individual service objects to PDF format');

  // Filter services to only used ones
  const usedServices = {};
  const allServiceKeys = [
    'saniclean', 'foamingDrain', 'saniscrub', 'microfiberMopping',
    'rpmWindows', 'refreshPowerScrub', 'sanipod', 'carpetclean',
    'janitorial', 'stripwax', 'greaseTrap'
  ];

  for (const serviceKey of allServiceKeys) {
    if (services[serviceKey] && isServiceUsed(services[serviceKey])) {
      usedServices[serviceKey] = services[serviceKey];
    }
  }

  // Include custom services if they exist and have data
  if (services.customServices && Array.isArray(services.customServices)) {
    const usedCustomServices = services.customServices.filter(cs => {
      return cs && cs.fields && cs.fields.length > 0;
    });
    if (usedCustomServices.length > 0) {
      usedServices.customServices = usedCustomServices;
    }
  }

  // If no services are used, return empty
  if (Object.keys(usedServices).length === 0) {
    return {
      servicesTopRowLatex: "",
      servicesBottomRowLatex: "",
      refreshSectionLatex: "",
      serviceNotesLatex: ""
    };
  }

  // Transform individual service objects into topRow/bottomRow format
  const transformedServices = transformServicesToPdfFormat(usedServices);

  // Now use the existing logic to build LaTeX from topRow/bottomRow format
  const topRowCols = transformedServices.topRow || [];
  const bottomRowCols = transformedServices.bottomRow || [];

  const filteredTopRowCols = filterServiceColumns(topRowCols);
  const filteredBottomRowCols = filterServiceColumns(bottomRowCols);

  const servicesTopRowLatex = buildServicesRow(filteredTopRowCols);
  const servicesBottomRowLatex = buildServicesRow(filteredBottomRowCols);

  // Handle refresh power scrub if present
  let refreshSectionLatex = "";
  if (services.refreshPowerScrub && services.refreshPowerScrub.formData) {
    const sec = services.refreshPowerScrub.formData;
    if (sec && Array.isArray(sec.columns) && sec.columns.length > 0) {
      const hasData = sec.columns.some(c => c && c.trim() !== '');
      if (hasData) {
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
    }
  }

  // Handle service notes
  let serviceNotesLatex = "";
  if (services.notes) {
    const notes = services.notes;
    const textLines = Array.isArray(notes.textLines) ? notes.textLines : [];
    const lines = textLines.length || notes.lines || 3;
    const hasContent = textLines.some(line => line && line.trim() !== '');
    if (hasContent || lines > 0) {
      serviceNotesLatex += "\\vspace{1.0em}\n";
      serviceNotesLatex += `\\serviceBigHeading{${latexEscape(notes.heading || "SERVICE NOTES")}}\n`;
      serviceNotesLatex += "\\vspace{0.35em}\n";
      for (let i = 0; i < lines; i++) {
        const content = textLines[i] ? latexEscape(textLines[i]) : "";
        serviceNotesLatex += `\\filledline{ ${content} }\\\\[0.6em]\n`;
      }
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
