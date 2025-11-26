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

const CustomerHeaderDocSchema = new mongoose.Schema(
  {
    // raw request payload used to render the TeX (your big JSON)
    payload: { type: mongoose.Schema.Types.Mixed, required: true },

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
