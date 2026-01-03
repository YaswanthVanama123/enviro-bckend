// src/models/VersionChangeLog.js
import mongoose from "mongoose";

// Individual change schema for a single field modification
const FieldChangeSchema = new mongoose.Schema({
  // Product/Service identification
  productKey: {
    type: String,
    required: [true, 'Product key is required']
  },

  productName: {
    type: String,
    required: [true, 'Product name is required']
  },

  productType: {
    type: String,
    enum: ['product', 'dispenser', 'service'],
    required: [true, 'Product type is required']
  },

  // Field change details
  fieldType: {
    type: String,
    enum: [
      // Product/Dispenser field types
      'unitPrice', 'amount', 'warrantyPrice', 'replacementPrice', 'total',
      // Service field types
      'hourlyRate', 'minimumVisit', 'customPerVisitTotal', 'workers', 'hours', 'customAmount',
      'insideSqFt', 'outsideSqFt', 'insideRate', 'outsideRate', 'sqFtFixedFee',
      // Custom override fields
      'customStandardBathroomTotal', 'customHugeBathroomTotal', 'customExtraAreaTotal',
      'customStandaloneTotal', 'customChemicalTotal', 'customPerVisitPrice',
      'customMonthlyRecurring', 'customFirstMonthPrice', 'customContractTotal'
    ],
    required: [true, 'Field type is required']
  },

  fieldDisplayName: {
    type: String,
    required: [true, 'Field display name is required']
  },

  // Value changes
  originalValue: {
    type: Number,
    required: [true, 'Original value is required']
  },

  newValue: {
    type: Number,
    required: [true, 'New value is required']
  },

  changeAmount: {
    type: Number,
    required: [true, 'Change amount is required']
  },

  changePercentage: {
    type: Number,
    required: [true, 'Change percentage is required']
  },

  // Context information
  quantity: {
    type: Number,
    default: 0
  },

  frequency: {
    type: String,
    default: ''
  }
}, { _id: false });

// Main version change log schema
const VersionChangeLogSchema = new mongoose.Schema(
  {
    // Document/Version association
    agreementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CustomerHeaderDoc',
      required: [true, 'Agreement ID is required']
      // Note: Index defined explicitly below with compound indexes
    },

    versionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VersionPdf',
      required: [true, 'Version ID is required']
      // Note: Index defined explicitly below with unique constraint
    },

    versionNumber: {
      type: Number,
      required: [true, 'Version number is required']
    },

    // User information
    salespersonId: {
      type: String,
      required: [true, 'Salesperson ID is required']
      // Note: Index defined explicitly below with compound index
    },

    salespersonName: {
      type: String,
      required: [true, 'Salesperson name is required']
    },

    // All changes made in this version
    changes: {
      type: [FieldChangeSchema],
      default: []
    },

    // Summary statistics
    totalChanges: {
      type: Number,
      default: 0
    },

    totalPriceImpact: {
      type: Number,
      default: 0
    },

    hasSignificantChanges: {
      type: Boolean,
      default: false
    },

    // Action context
    saveAction: {
      type: String,
      enum: ['save_draft', 'generate_pdf', 'manual_save'],
      required: [true, 'Save action is required']
    },

    documentTitle: {
      type: String,
      required: [true, 'Document title is required']
    },

    // Session information
    sessionId: {
      type: String,
      required: [true, 'Session ID is required']
    },

    // Approval workflow
    reviewStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'auto_approved'],
      default: 'pending'
    },

    reviewedBy: {
      type: String,
      default: null
    },

    reviewedAt: {
      type: Date,
      default: null
    },

    reviewNotes: {
      type: String,
      default: ''
    },

    // Metadata
    ipAddress: {
      type: String,
      default: null
    },

    userAgent: {
      type: String,
      default: null
    },

    // Soft delete
    isDeleted: {
      type: Boolean,
      default: false
    },

    deletedAt: {
      type: Date,
      default: null
    },

    deletedBy: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true,
    minimize: false
  }
);

// Pre-save middleware to calculate summary statistics
VersionChangeLogSchema.pre('save', function(next) {
  if (this.changes && this.changes.length > 0) {
    this.totalChanges = this.changes.length;

    // Calculate total price impact
    this.totalPriceImpact = this.changes.reduce((total, change) => {
      return total + Math.abs(change.changeAmount);
    }, 0);

    // Check for significant changes (>15% or >$50)
    this.hasSignificantChanges = this.changes.some(change => {
      return Math.abs(change.changePercentage) > 15 || Math.abs(change.changeAmount) > 50;
    });

    // Auto-approve small changes
    if (!this.hasSignificantChanges && this.totalPriceImpact < 100) {
      this.reviewStatus = 'auto_approved';
    }
  }

  next();
});

// Indexes for efficient querying
VersionChangeLogSchema.index({ agreementId: 1, versionNumber: -1 });
VersionChangeLogSchema.index({ agreementId: 1, createdAt: -1 });
VersionChangeLogSchema.index({ versionId: 1 }, { unique: true }); // One log per version
VersionChangeLogSchema.index({ salespersonId: 1, createdAt: -1 });
VersionChangeLogSchema.index({ reviewStatus: 1 });
VersionChangeLogSchema.index({ hasSignificantChanges: 1 });
VersionChangeLogSchema.index({ saveAction: 1 });

// ⚡ OPTIMIZED: Index for getSavedFilesGrouped lookup performance
VersionChangeLogSchema.index({ agreementId: 1, isDeleted: 1 });

// Compound index for grouped folder display
VersionChangeLogSchema.index({
  agreementId: 1,
  versionNumber: -1,
  createdAt: -1
});

// Static methods for querying
VersionChangeLogSchema.statics.getLogsForAgreement = function(agreementId, options = {}) {
  const filter = {
    agreementId: new mongoose.Types.ObjectId(agreementId),
    isDeleted: { $ne: true }
  };

  if (options.versionNumber) {
    filter.versionNumber = options.versionNumber;
  }

  if (options.salespersonId) {
    filter.salespersonId = options.salespersonId;
  }

  if (options.reviewStatus) {
    filter.reviewStatus = options.reviewStatus;
  }

  return this.find(filter)
    .sort({ versionNumber: -1, createdAt: -1 })
    .limit(options.limit || 50)
    .lean();
};

VersionChangeLogSchema.statics.getChangeStats = function(agreementId) {
  return this.aggregate([
    {
      $match: {
        agreementId: new mongoose.Types.ObjectId(agreementId),
        isDeleted: { $ne: true }
      }
    },
    {
      $group: {
        _id: null,
        totalVersions: { $sum: 1 },
        totalChanges: { $sum: '$totalChanges' },
        totalPriceImpact: { $sum: '$totalPriceImpact' },
        versionsWithSignificantChanges: {
          $sum: { $cond: ['$hasSignificantChanges', 1, 0] }
        },
        pendingApprovals: {
          $sum: { $cond: [{ $eq: ['$reviewStatus', 'pending'] }, 1, 0] }
        }
      }
    }
  ]);
};

const VersionChangeLog = mongoose.model("VersionChangeLog", VersionChangeLogSchema);

export default VersionChangeLog;