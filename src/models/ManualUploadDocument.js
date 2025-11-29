// src/models/ManualUploadDocument.js
import mongoose from "mongoose";

const ZohoRefSchema = new mongoose.Schema(
  {
    dealId: { type: String, default: null },
    fileId: { type: String, default: null },
    url: { type: String, default: null },
  },
  { _id: false }
);

const ManualUploadDocumentSchema = new mongoose.Schema(
  {
    fileName: {
      type: String,
      required: true,
    },
    originalFileName: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    mimeType: {
      type: String,
      default: "application/pdf",
    },
    description: {
      type: String,
      default: "",
    },
    uploadedBy: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["uploaded", "processing", "completed", "failed"],
      default: "uploaded",
    },
    pdfBuffer: {
      type: Buffer,
      required: true,
    },
    zoho: {
      bigin: { type: ZohoRefSchema, default: () => ({}) },
      crm: { type: ZohoRefSchema, default: () => ({}) },
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
ManualUploadDocumentSchema.index({ uploadedBy: 1, createdAt: -1 });
ManualUploadDocumentSchema.index({ status: 1 });

const ManualUploadDocument = mongoose.model(
  "ManualUploadDocument",
  ManualUploadDocumentSchema
);

export default ManualUploadDocument;
