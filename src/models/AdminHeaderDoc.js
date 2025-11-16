// src/models/AdminHeaderDoc.js
import mongoose from "mongoose";

const { Schema } = mongoose;

// --- sub-schemas ---

const HeaderRowSchema = new Schema(
  {
    labelLeft: { type: String, default: "" },
    valueLeft: { type: String, default: "" },
    labelRight: { type: String, default: "" },
    valueRight: { type: String, default: "" },
  },
  { _id: false }
);

const AgreementSchema = new Schema(
  {
    enviroOf: { type: String, default: "" },
    customerExecutedOn: { type: String, default: "" },
    additionalMonths: { type: String, default: "" },
  },
  { _id: false }
);

const PdfMetaSchema = new Schema(
  {
    sizeBytes: { type: Number },
    contentType: { type: String, default: "application/pdf" },
    storedAt: { type: Date, default: Date.now },
    externalUrl: { type: String }, // later when pushing PDF to Zoho/Bigin
  },
  { _id: false }
);

// Info specific to Zoho Bigin integration
const ZohoBiginInfoSchema = new Schema(
  {
    recordId: { type: String },      // e.g. Deal / Contact / custom record id
    module: { type: String },        // e.g. "Deals"
    fileId: { type: String },        // attachment/file id in Bigin
    downloadUrl: { type: String },   // direct download URL (if you store it)
    lastPushedAt: { type: Date },
    lastError: { type: String },
  },
  { _id: false }
);

const AdminHeaderDocSchema = new Schema(
  {
    headerTitle: { type: String, default: "" },

    headerRows: {
      type: [HeaderRowSchema],
      default: [],
    },

    products: {
      type: Schema.Types.Mixed,
      default: {},
    },

    services: {
      type: Schema.Types.Mixed,
      default: {},
    },

    agreement: {
      type: AgreementSchema,
      default: () => ({}),
    },

    pdfMeta: {
      type: PdfMetaSchema,
      default: null,
    },

    // Zoho / Bigin integration info
    zohoBigin: {
      type: ZohoBiginInfoSchema,
      default: () => ({}),
    },

    // Overall status for this PDF/template (for viewer)
    // e.g. "draft", "ready", "synced", "error"
    status: {
      type: String,
      default: "draft",
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "AdminUser",
      default: null,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "AdminUser",
      default: null,
    },

    label: {
      type: String,
      default: "",
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

const AdminHeaderDoc = mongoose.model("AdminHeaderDoc", AdminHeaderDocSchema);

export default AdminHeaderDoc;
