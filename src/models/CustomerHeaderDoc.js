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
    displayName: String,  // Product display name (for PDF)
    customName: String,   // Custom product name
    qty: Number,

    // Small Products fields
    unitPrice: Number,
    unitPriceOverride: Number,

    // Dispensers fields
    warrantyRate: Number,
    warrantyPriceOverride: Number,
    replacementRate: Number,
    replacementPriceOverride: Number,

    // Big Products fields
    amount: Number,
    amountOverride: Number,

    // Frequency field (ADDED for all product types)
    frequency: { type: String, default: "" },

    // Totals
    total: Number,
    totalOverride: Number,
    extPrice: Number,

    // Custom rows
    isCustom: Boolean,
    isDefault: Boolean,

    // Product type identifier (for merged products array)
    _productType: { type: String, enum: ["small", "big", "dispenser"], default: null },

    // Custom columns
    customFields: mongoose.Schema.Types.Mixed,
  },
  { _id: false, strict: false }  // strict: false allows additional fields
);

// Products schema - UPDATED to support both old and new formats
const ProductsSchema = new mongoose.Schema(
  {
    // NEW FORMAT: 2-category structure (frontend sends this)
    products: [ProductRowSchema],     // Merged small + big products
    dispensers: [ProductRowSchema],   // Dispensers only

    // OLD FORMAT: 3-category structure (for backward compatibility)
    smallProducts: [ProductRowSchema],
    bigProducts: [ProductRowSchema],

    // Legacy format (for very old data)
    headers: [String],
    rows: [[String]],

    // Custom column definitions (added to support dynamic columns)
    customColumns: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({ products: [], dispensers: [] })
    },
  },
  { _id: false, strict: false }  // Allow additional fields for flexibility
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

// ✅ NEW: Service Agreement schema
const ServiceAgreementSchema = new mongoose.Schema(
  {
    includeInPdf: { type: Boolean, default: false },
    retainDispensers: { type: Boolean, default: false },
    disposeDispensers: { type: Boolean, default: false },
    customerContactName: { type: String, default: "" },
    customerSignature: { type: String, default: "" },
    customerSignatureDate: { type: String, default: "" },
    emFranchisee: { type: String, default: "" },
    emSignature: { type: String, default: "" },
    emSignatureDate: { type: String, default: "" },
    insideSalesRepresentative: { type: String, default: "" },
    emSalesRepresentative: { type: String, default: "" },
    // Terms
    term1: { type: String, default: "" },
    term2: { type: String, default: "" },
    term3: { type: String, default: "" },
    term4: { type: String, default: "" },
    term5: { type: String, default: "" },
    term6: { type: String, default: "" },
    term7: { type: String, default: "" },
    noteText: { type: String, default: "" },
    // Labels
    titleText: { type: String, default: "SERVICE AGREEMENT" },
    subtitleText: { type: String, default: "Terms and Conditions" },
    retainDispensersLabel: { type: String, default: "Customer desires to retain existing dispensers" },
    disposeDispensersLabel: { type: String, default: "Customer desires to dispose of existing dispensers" },
    emSalesRepLabel: { type: String, default: "EM Sales Representative" },
    insideSalesRepLabel: { type: String, default: "Inside Sales Representative" },
    authorityText: { type: String, default: "I HEREBY REPRESENT THAT I HAVE THE AUTHORITY TO SIGN THIS AGREEMENT:" },
    customerContactLabel: { type: String, default: "Customer Contact Name:" },
    customerSignatureLabel: { type: String, default: "Signature:" },
    customerDateLabel: { type: String, default: "Date:" },
    emFranchiseeLabel: { type: String, default: "EM Franchisee:" },
    emSignatureLabel: { type: String, default: "Signature:" },
    emDateLabel: { type: String, default: "Date:" },
    // pageNumberText: { type: String, default: "Page #2" },
  },
  { _id: false }
);

// Agreement schema
const AgreementSchema = new mongoose.Schema(
  {
    enviroOf: { type: String, default: "" },
    customerExecutedOn: { type: String, default: "" },
    additionalMonths: { type: String, default: "" },
    paymentOption: {
      type: String,
      enum: ["online", "cash", "others"],
      default: "online"
    },
    // ✅ NEW: Timeline tracking for agreement expiry
    startDate: { type: String, default: null }  // ISO date string for agreement start date
  },
  { _id: false }
);

// Global summary schema
const GlobalSummarySchema = new mongoose.Schema(
  {
    contractMonths: { type: Number, default: null },
    tripCharge: { type: Number, default: null },
    tripChargeFrequency: { type: Number, default: null },
    parkingCharge: { type: Number, default: null },
    parkingChargeFrequency: { type: Number, default: null },
    serviceAgreementTotal: { type: Number, default: null },
    productMonthlyTotal: { type: Number, default: null },
    productContractTotal: { type: Number, default: null },
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

// ✅ NEW: Version tracking for PDF history
const VersionRefSchema = new mongoose.Schema(
  {
    versionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VersionPdf',
      required: true
    },
    versionNumber: { type: Number, required: true },
    versionLabel: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: String, default: null },
    changeNotes: { type: String, default: "" },
    status: {
      type: String,
      enum: ['active', 'superseded', 'archived'],
      default: 'active'
    },
    // Zoho upload status for this version
    zohoUploadStatus: {
      uploaded: { type: Boolean, default: false },
      dealId: { type: String, default: null },
      fileId: { type: String, default: null },
      noteId: { type: String, default: null },
      uploadedAt: { type: Date, default: null }
    }
  },
  { _id: false }
);

// ✅ NEW: Attached file schema for additional uploads within same agreement
const AttachedFileSchema = new mongoose.Schema(
  {
    // Reference to ManualUploadDocument (where the actual PDF is stored)
    manualDocumentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ManualUploadDocument',
      required: [true, 'Manual document ID is required for attached files'],
      validate: {
        validator: function(value) {
          // Ensure the value is a valid ObjectId
          return value && mongoose.isValidObjectId(value);
        },
        message: 'Manual document ID must be a valid ObjectId'
      }
    },

    // Quick reference data (duplicated from ManualUploadDocument for performance)
    fileName: {
      type: String,
      required: [true, 'File name is required for attached files'],
      trim: true,
      minlength: [1, 'File name cannot be empty']
    },
    fileSize: { type: Number, default: 0, min: [0, 'File size cannot be negative'] },
    description: { type: String, default: "", trim: true },
    attachedAt: { type: Date, default: Date.now },
    attachedBy: { type: String, default: null, trim: true },

    // Display order within this agreement
    displayOrder: { type: Number, default: 0, min: [0, 'Display order cannot be negative'] },
  },
  { _id: true, timestamps: true }  // Each attachment reference gets its own _id
);

// Main payload schema matching current frontend structure
const PayloadSchema = new mongoose.Schema(
  {
    headerTitle: { type: String, default: "" },
    headerRows: [HeaderRowSchema],
    products: { type: ProductsSchema, default: () => ({ smallProducts: [], dispensers: [], bigProducts: [] }) },
    services: { type: ServicesSchema, default: () => ({}) },
    agreement: { type: AgreementSchema, default: () => ({}) },
    // ✅ NEW: Service Agreement data
    serviceAgreement: { type: ServiceAgreementSchema, default: null },
    summary: { type: GlobalSummarySchema, default: null },
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

    // ✅ NEW: Additional files attached to this agreement
    attachedFiles: {
      type: [AttachedFileSchema],
      default: [],
      validate: {
        validator: function(attachments) {
          // Validate that all attachments have valid manualDocumentId
          return attachments.every(attachment =>
            attachment.manualDocumentId &&
            mongoose.isValidObjectId(attachment.manualDocumentId) &&
            attachment.fileName &&
            attachment.fileName.trim().length > 0
          );
        },
        message: 'All attached files must have valid manualDocumentId and fileName'
      }
    },

    // ✅ NEW: Version history tracking for this agreement
    versions: {
      type: [VersionRefSchema],
      default: [],
      validate: {
        validator: function(versions) {
          // Ensure version numbers are unique
          const versionNumbers = versions.map(v => v.versionNumber);
          const uniqueVersions = new Set(versionNumbers);
          return versionNumbers.length === uniqueVersions.size;
        },
        message: 'Version numbers must be unique within an agreement'
      }
    },

    // Current/active version information
    currentVersionNumber: { type: Number, default: 0 }, // 0 means main/current PDF
    totalVersions: { type: Number, default: 0 },

    // optional internal tracking - updated status values to match frontend
    status: {
      type: String,
      enum: [
        "saved",
        "draft",
        "in_progress",
        "active",
        "completed",
        "pending_approval",
        "approved_salesman",
        "approved_admin"
      ],
      default: "saved",
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

    // ✅ NEW: Soft delete field for agreements
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: null },
  },
  {
    timestamps: true, // adds createdAt, updatedAt
    minimize: false,  // keep empty objects so you can patch later
  }
);

// helpful index if you'll query by creation time
CustomerHeaderDocSchema.index({ createdAt: -1 });

// ⚡ OPTIMIZED: Index for getSavedFilesGrouped query performance
CustomerHeaderDocSchema.index({ isDeleted: 1, createdAt: -1 });
CustomerHeaderDocSchema.index({ 'payload.headerTitle': 'text' });

export default mongoose.models.CustomerHeaderDoc
  || mongoose.model("CustomerHeaderDoc", CustomerHeaderDocSchema);
