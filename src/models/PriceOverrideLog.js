// src/models/PriceOverrideLog.js
import mongoose from "mongoose";

const PriceOverrideLogSchema = new mongoose.Schema(
  {
    // Document/Version association
    agreementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CustomerHeaderDoc',
      required: [true, 'Agreement ID is required']
    },

    versionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VersionPdf',
      default: null // null for initial version, populated for version PDFs
    },

    versionNumber: {
      type: Number,
      default: 1
    },

    // User information
    salespersonId: {
      type: String,
      required: [true, 'Salesperson ID is required']
    },

    salespersonName: {
      type: String,
      required: [true, 'Salesperson name is required']
    },

    // Product/Item information
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
      enum: ['product', 'dispenser', 'service'], // ✅ Added 'service' type for services pricing overrides
      required: [true, 'Product type is required']
    },

    // Price override details
    fieldType: {
      type: String,
      enum: [
        // Product/Dispenser field types
        'unitPrice', 'amount', 'warrantyPrice', 'replacementPrice', 'total',
        // ✅ Service field types
        'hourlyRate', 'minimumVisit', 'customPerVisitTotal', 'workers', 'hours', 'customAmount',
        'insideSqFt', 'outsideSqFt', 'insideRate', 'outsideRate', 'sqFtFixedFee'
      ],
      required: [true, 'Field type is required']
    },

    originalValue: {
      type: Number,
      required: [true, 'Original value is required']
    },

    overrideValue: {
      type: Number,
      required: [true, 'Override value is required']
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
    },

    // Approval/Review status
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

    // Threshold flags
    isSignificantChange: {
      type: Boolean,
      default: false
    },

    requiresApproval: {
      type: Boolean,
      default: false
    },

    // Session/Form information
    sessionId: {
      type: String,
      required: [true, 'Session ID is required']
    },

    documentTitle: {
      type: String,
      required: [true, 'Document title is required']
    },

    // Metadata
    source: {
      type: String,
      enum: ['form_filling', 'edit_mode', 'version_update'],
      default: 'form_filling'
    },

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

// Indexes for efficient querying
PriceOverrideLogSchema.index({ agreementId: 1, createdAt: -1 });
PriceOverrideLogSchema.index({ versionId: 1, createdAt: -1 });
PriceOverrideLogSchema.index({ salespersonId: 1, createdAt: -1 });
PriceOverrideLogSchema.index({ reviewStatus: 1 });
PriceOverrideLogSchema.index({ isSignificantChange: 1 });
PriceOverrideLogSchema.index({ requiresApproval: 1 });

// Compound index for efficient log retrieval
PriceOverrideLogSchema.index({
  agreementId: 1,
  versionNumber: 1,
  createdAt: -1
});

// Static method to get logs for an agreement
PriceOverrideLogSchema.statics.getLogsForAgreement = async function(agreementId, options = {}) {
  const {
    versionNumber = null,
    salespersonId = null,
    reviewStatus = null,
    limit = 50,
    sortOrder = -1 // -1 for newest first
  } = options;

  let query = {
    agreementId,
    isDeleted: { $ne: true }
  };

  if (versionNumber !== null) query.versionNumber = versionNumber;
  if (salespersonId) query.salespersonId = salespersonId;
  if (reviewStatus) query.reviewStatus = reviewStatus;

  return await this.find(query)
    .sort({ createdAt: sortOrder })
    .limit(limit)
    .lean();
};

// Static method to get summary stats
PriceOverrideLogSchema.statics.getOverrideStats = async function(agreementId) {
  const stats = await this.aggregate([
    {
      $match: {
        agreementId: new mongoose.Types.ObjectId(agreementId),
        isDeleted: { $ne: true }
      }
    },
    {
      $group: {
        _id: null,
        totalOverrides: { $sum: 1 },
        avgChangePercentage: { $avg: '$changePercentage' },
        maxChangePercentage: { $max: '$changePercentage' },
        minChangePercentage: { $min: '$changePercentage' },
        significantChanges: {
          $sum: { $cond: ['$isSignificantChange', 1, 0] }
        },
        pendingApprovals: {
          $sum: { $cond: [{ $eq: ['$reviewStatus', 'pending'] }, 1, 0] }
        }
      }
    }
  ]);

  return stats.length > 0 ? stats[0] : {
    totalOverrides: 0,
    avgChangePercentage: 0,
    maxChangePercentage: 0,
    minChangePercentage: 0,
    significantChanges: 0,
    pendingApprovals: 0
  };
};

// Instance method to calculate if change is significant
PriceOverrideLogSchema.methods.calculateSignificance = function() {
  const SIGNIFICANT_PERCENTAGE_THRESHOLD = 15; // 15% change
  const SIGNIFICANT_AMOUNT_THRESHOLD = 50;     // $50 change

  const absChangePercentage = Math.abs(this.changePercentage);
  const absChangeAmount = Math.abs(this.changeAmount);

  this.isSignificantChange = (
    absChangePercentage >= SIGNIFICANT_PERCENTAGE_THRESHOLD ||
    absChangeAmount >= SIGNIFICANT_AMOUNT_THRESHOLD
  );

  // Require approval for significant changes
  this.requiresApproval = this.isSignificantChange;

  return this.isSignificantChange;
};

// Pre-save middleware to calculate significance
PriceOverrideLogSchema.pre('save', function(next) {
  if (this.isNew) {
    // Calculate change amount and percentage
    this.changeAmount = this.overrideValue - this.originalValue;
    this.changePercentage = this.originalValue !== 0
      ? ((this.changeAmount / this.originalValue) * 100)
      : 0;

    // Calculate significance
    this.calculateSignificance();

    // Auto-approve small changes
    if (!this.requiresApproval) {
      this.reviewStatus = 'auto_approved';
    }
  }
  next();
});

export default mongoose.models.PriceOverrideLog
  || mongoose.model("PriceOverrideLog", PriceOverrideLogSchema);