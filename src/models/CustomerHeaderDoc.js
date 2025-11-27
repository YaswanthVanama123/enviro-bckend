// src/models/CustomerHeaderDoc.js
import mongoose from "mongoose";

const ZohoRefSchema = new mongoose.Schema(
  {
    dealId: { type: String, default: null },   // for Bigin (if you use deals)
    fileId: { type: String, default: null },   // file/document id returned by Zoho
    url:    { type: String, default: null },   // public/shared link if available
  },
  { _id: false }
);

// Product row schema matching frontend ProductRow type
const ProductRowSchema = new mongoose.Schema(
  {
    id: String,
    productKey: String,
    qty: Number,
    unitPrice: Number,
    extPrice: Number,
    unitPriceOverride: Number,
    warrantyPriceOverride: Number,
    replacementPriceOverride: Number,
    totalOverride: Number,
    isCustom: Boolean,
    customName: String,
    isDefault: Boolean,
  },
  { _id: false }
);

// Products schema matching frontend structure
const ProductsSchema = new mongoose.Schema(
  {
    smallProducts: [ProductRowSchema],
    dispensers: [ProductRowSchema],
    bigProducts: [ProductRowSchema],
  },
  { _id: false }
);

// Services schema matching frontend structure
const ServicesSchema = new mongoose.Schema(
  {
    // SaniClean service (includes customFields array if added)
    saniclean: { type: mongoose.Schema.Types.Mixed, default: null },

    // Foaming Drain service (includes customFields array if added)
    foamingDrain: { type: mongoose.Schema.Types.Mixed, default: null },

    // SaniScrub service (includes customFields array if added)
    saniscrub: { type: mongoose.Schema.Types.Mixed, default: null },

    // Microfiber Mopping service (includes customFields array if added)
    microfiberMopping: { type: mongoose.Schema.Types.Mixed, default: null },

    // RPM Windows service (includes customFields array if added)
    rpmWindows: { type: mongoose.Schema.Types.Mixed, default: null },

    // Refresh Power Scrub service (includes customFields array if added)
    refreshPowerScrub: { type: mongoose.Schema.Types.Mixed, default: null },

    // SaniPod service (includes customFields array if added)
    sanipod: { type: mongoose.Schema.Types.Mixed, default: null },

    // Carpet Cleaning service (includes customFields array if added)
    carpetclean: { type: mongoose.Schema.Types.Mixed, default: null },

    // Janitorial service (includes customFields array if added)
    janitorial: { type: mongoose.Schema.Types.Mixed, default: null },

    // Strip & Wax service (includes customFields array if added)
    stripwax: { type: mongoose.Schema.Types.Mixed, default: null },

    // Grease Trap service (includes customFields array if added)
    greaseTrap: { type: mongoose.Schema.Types.Mixed, default: null },

    // User-created custom services with custom fields
    // Array of: { id, name, fields: [{ id, name, type, value }] }
    customServices: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { _id: false, strict: false }
);

// Agreement schema
const AgreementSchema = new mongoose.Schema(
  {
    enviroOf: { type: String, default: "" },
    customerExecutedOn: { type: String, default: "" },
    additionalMonths: { type: String, default: "" },
  },
  { _id: false }
);

// Header row schema
const HeaderRowSchema = new mongoose.Schema(
  {
    labelLeft: { type: String, default: "" },
    valueLeft: { type: String, default: "" },
    labelRight: { type: String, default: "" },
    valueRight: { type: String, default: "" },
  },
  { _id: false }
);

// Main payload schema matching current frontend structure
const PayloadSchema = new mongoose.Schema(
  {
    headerTitle: { type: String, default: "" },
    headerRows: [HeaderRowSchema],
    products: { type: ProductsSchema, default: () => ({ smallProducts: [], dispensers: [], bigProducts: [] }) },
    services: { type: ServicesSchema, default: () => ({}) },
    agreement: { type: AgreementSchema, default: () => ({}) },
  },
  { _id: false }
);

const CustomerHeaderDocSchema = new mongoose.Schema(
  {
    // Structured payload matching current frontend
    payload: { type: PayloadSchema, required: true },

    // PDF compile meta and storage
    pdf_meta: {
      sizeBytes: { type: Number, default: 0 },        // size of compiled PDF in bytes
      contentType: { type: String, default: "application/pdf" },
      storedAt: { type: Date, default: null },        // when PDF was compiled
      pdfBuffer: { type: Buffer, default: null },     // Store compiled PDF binary
      externalUrl: { type: String, default: null },   // external URL if hosted elsewhere
    },

    // optional internal tracking - updated status values to match frontend
    status: {
      type: String,
      enum: [
        "draft",
        "in_progress",
        "active",
        "completed",
        "pending_approval",
        "approved_salesman",
        "approved_admin"
      ],
      default: "draft",
      index: true,
    },

    // who/what produced this (optional)
    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },

    // Zoho destinations you'll fill later after upload
    zoho: {
      bigin: { type: ZohoRefSchema, default: () => ({}) },
      crm:   { type: ZohoRefSchema, default: () => ({}) },
    },
  },
  {
    timestamps: true, // adds createdAt, updatedAt
    minimize: false,  // keep empty objects so you can patch later
  }
);

// helpful index if you’ll query by creation time
CustomerHeaderDocSchema.index({ createdAt: -1 });

export default mongoose.models.CustomerHeaderDoc
  || mongoose.model("CustomerHeaderDoc", CustomerHeaderDocSchema);
