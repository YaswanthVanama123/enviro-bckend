// src/models/VersionPdf.js
import mongoose from "mongoose";

const ZohoVersionRefSchema = new mongoose.Schema(
  {
    dealId: { type: String, default: null },   // Zoho deal ID where this version is uploaded
    fileId: { type: String, default: null },   // Zoho file ID for this version
    noteId: { type: String, default: null },   // Zoho note ID for this version upload
    url: { type: String, default: null },      // Public/shared link if available
    uploadedAt: { type: Date, default: null }, // When uploaded to Zoho
    uploadedBy: { type: String, default: null }, // Who uploaded to Zoho
    mappingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ZohoMapping',
      default: null
    }, // Reference to ZohoMapping document
  },
  { _id: false }
);

const VersionPdfSchema = new mongoose.Schema(
  {
    // Reference to the parent agreement
    agreementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CustomerHeaderDoc',
      required: [true, 'Agreement ID is required']
    },

    // Version information
    versionNumber: {
      type: Number,
      required: [true, 'Version number is required'],
      min: [1, 'Version number must be at least 1']
    },

    versionLabel: {
      type: String,
      default: function() {
        return `Version ${this.versionNumber}`;
      }
    },

    // PDF storage (similar to CustomerHeaderDoc pdf_meta)
    pdf_meta: {
      sizeBytes: { type: Number, default: 0 },
      contentType: { type: String, default: "application/pdf" },
      storedAt: { type: Date, default: Date.now },
      pdfBuffer: { type: Buffer, required: [true, 'PDF buffer is required'] },
      externalUrl: { type: String, default: null },
    },

    // Snapshot of form data at the time this version was created
    payloadSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'Payload snapshot is required for version tracking']
    },

    // Version creation metadata
    createdBy: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    creationReason: {
      type: String,
      enum: ['initial', 'new_version', 'replace_recent'],
      default: 'new_version'
    },

    // Zoho integration data
    zoho: {
      bigin: { type: ZohoVersionRefSchema, default: () => ({}) },
      crm: { type: ZohoVersionRefSchema, default: () => ({}) },
    },

    // Status tracking
    status: {
      type: String,
      enum: ['draft', 'saved', 'pending_approval', 'approved_salesman', 'approved_admin'],
      default: 'saved'
    },

    // Notes about this version
    changeNotes: { type: String, default: "" },

    // File naming
    fileName: {
      type: String,
      default: function() {
        return `agreement_v${this.versionNumber}.pdf`;
      }
    },

    // ✅ NEW: Soft delete fields for version PDFs
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: null },
  },
  {
    timestamps: true,
    minimize: false
  }
);

// Compound index for agreement + version number (must be unique)
VersionPdfSchema.index({ agreementId: 1, versionNumber: 1 }, { unique: true });

// Index for querying versions by agreement
VersionPdfSchema.index({ agreementId: 1, createdAt: -1 });

// ⚡ OPTIMIZED: Index for getSavedFilesGrouped lookup performance
VersionPdfSchema.index({ agreementId: 1, status: 1, isDeleted: 1 });
VersionPdfSchema.index({ agreementId: 1, versionNumber: -1 });

// Static method to get next version number for an agreement
VersionPdfSchema.statics.getNextVersionNumber = async function(agreementId) {
  const latestVersion = await this.findOne(
    { agreementId },
    { versionNumber: 1 },
    { sort: { versionNumber: -1 } }
  );

  return latestVersion ? latestVersion.versionNumber + 1 : 1;
};

// Static method to get all versions for an agreement
VersionPdfSchema.statics.getVersionsByAgreement = async function(agreementId, options = {}) {
  const {
    includeArchived = false,
    sortOrder = -1, // -1 for newest first, 1 for oldest first
    limit = null
  } = options;

  let query = { agreementId };

  if (!includeArchived) {
    query.status = { $ne: 'archived' };
  }

  let queryBuilder = this.find(query).sort({ versionNumber: sortOrder });

  if (limit) {
    queryBuilder = queryBuilder.limit(limit);
  }

  return await queryBuilder;
};

// Instance method to mark version as superseded
VersionPdfSchema.methods.markAsSuperseded = async function() {
  this.status = 'superseded';
  return await this.save();
};

// Instance method to archive version
VersionPdfSchema.methods.archive = async function() {
  this.status = 'archived';
  return await this.save();
};

// Pre-save middleware to ensure version number uniqueness
VersionPdfSchema.pre('save', async function(next) {
  if (this.isNew) {
    // Check if this version number already exists for this agreement
    const existing = await this.constructor.findOne({
      agreementId: this.agreementId,
      versionNumber: this.versionNumber,
      _id: { $ne: this._id }
    });

    if (existing) {
      const error = new Error(`Version ${this.versionNumber} already exists for this agreement`);
      error.code = 'VERSION_ALREADY_EXISTS';
      return next(error);
    }
  }
  next();
});

export default mongoose.models.VersionPdf
  || mongoose.model("VersionPdf", VersionPdfSchema);