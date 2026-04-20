import mongoose from "mongoose";

const ZohoVersionRefSchema = new mongoose.Schema(
  {
    dealId: { type: String, default: null },
    fileId: { type: String, default: null },
    noteId: { type: String, default: null },
    url: { type: String, default: null },
    uploadedAt: { type: Date, default: null },
    uploadedBy: { type: String, default: null },
    mappingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ZohoMapping',
      default: null
    },
  },
  { _id: false }
);

const VersionPdfSchema = new mongoose.Schema(
  {
    agreementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CustomerHeaderDoc',
      required: [true, 'Agreement ID is required']
    },

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

    pdf_meta: {
      sizeBytes: { type: Number, default: 0 },
      contentType: { type: String, default: "application/pdf" },
      storedAt: { type: Date, default: Date.now },
      pdfBuffer: { type: Buffer, required: [true, 'PDF buffer is required'] },
      externalUrl: { type: String, default: null },
    },

    payloadSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'Payload snapshot is required for version tracking']
    },

    createdBy: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    creationReason: {
      type: String,
      enum: ['initial', 'new_version', 'replace_recent'],
      default: 'new_version'
    },

    zoho: {
      bigin: { type: ZohoVersionRefSchema, default: () => ({}) },
      crm: { type: ZohoVersionRefSchema, default: () => ({}) },
    },

    status: {
      type: String,
      enum: ['draft', 'saved', 'pending_approval', 'approved_salesman', 'approved_admin'],
      default: 'saved'
    },

    changeNotes: { type: String, default: "" },

    fileName: {
      type: String,
      default: function() {
        return `agreement_v${this.versionNumber}.pdf`;
      }
    },

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: null },
  },
  {
    timestamps: true,
    minimize: false
  }
);

VersionPdfSchema.index({ agreementId: 1, versionNumber: 1 }, { unique: true });
VersionPdfSchema.index({ agreementId: 1, createdAt: -1 });
VersionPdfSchema.index({ agreementId: 1, status: 1, isDeleted: 1 });
VersionPdfSchema.index({ agreementId: 1, versionNumber: -1 });

VersionPdfSchema.statics.getNextVersionNumber = async function(agreementId) {
  const latestVersion = await this.findOne(
    { agreementId },
    { versionNumber: 1 },
    { sort: { versionNumber: -1 } }
  );

  return latestVersion ? latestVersion.versionNumber + 1 : 1;
};

VersionPdfSchema.statics.getVersionsByAgreement = async function(agreementId, options = {}) {
  const {
    includeArchived = false,
    sortOrder = -1,
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

VersionPdfSchema.methods.markAsSuperseded = async function() {
  this.status = 'superseded';
  return await this.save();
};

VersionPdfSchema.methods.archive = async function() {
  this.status = 'archived';
  return await this.save();
};

VersionPdfSchema.pre('save', async function(next) {
  if (this.isNew) {
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
