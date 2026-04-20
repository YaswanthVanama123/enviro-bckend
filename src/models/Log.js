import mongoose from "mongoose";

const FieldChangeSchema = new mongoose.Schema({
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
    enum: ['product', 'dispenser', 'service', 'agreement_text'],
    required: [true, 'Product type is required']
  },

  fieldType: {
    type: String,
    required: [true, 'Field type is required']
  },

  fieldDisplayName: {
    type: String,
    required: [true, 'Field display name is required']
  },

  changeType: {
    type: String,
    enum: ['numeric', 'text'],
    default: 'numeric'
  },

  originalValue: {
    type: Number,
    required: false
  },

  newValue: {
    type: Number,
    required: false
  },

  changeAmount: {
    type: Number,
    default: 0
  },

  changePercentage: {
    type: Number,
    default: 0
  },

  originalText: {
    type: String,
    default: ''
  },

  newText: {
    type: String,
    default: ''
  },

  quantity: {
    type: Number,
    default: 0
  },

  frequency: {
    type: String,
    default: ''
  },

  timestamp: {
    type: String,
    default: () => new Date().toISOString()
  }
}, { _id: false });

const LogSchema = new mongoose.Schema(
  {
    agreementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CustomerHeaderDoc',
      required: [true, 'Agreement ID is required'],
      index: true
    },

    agreementTitle: {
      type: String,
      default: ''
    },

    versionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VersionPdf',
      required: [true, 'Version ID is required'],
      index: true
    },

    versionNumber: {
      type: Number,
      required: [true, 'Version number is required']
    },

    fileName: {
      type: String,
    },

    fileSize: {
      type: Number,
      default: 0
    },

    contentType: {
      type: String,
      default: 'text/plain'
    },

    salespersonId: {
      type: String,
      required: [true, 'Salesperson ID is required'],
      index: true
    },

    salespersonName: {
      type: String,
      required: [true, 'Salesperson name is required']
    },

    changes: {
      type: [FieldChangeSchema],
      default: []
    },

    currentChanges: {
      type: [FieldChangeSchema],
      default: []
    },

    allPreviousChanges: {
      type: [FieldChangeSchema],
      default: []
    },

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

    saveAction: {
      type: String,
      enum: ['save_draft', 'generate_pdf', 'manual_save'],
      required: [true, 'Save action is required']
    },

    documentTitle: {
      type: String,
      required: [true, 'Document title is required']
    },

    sessionId: {
      type: String,
      default: () => `session_${Date.now()}_${Math.random().toString(36).slice(2)}`
    },

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

LogSchema.pre('save', function(next) {
  const changesArray = this.currentChanges && this.currentChanges.length > 0
    ? this.currentChanges
    : this.changes;

  if (changesArray && changesArray.length > 0) {
    this.totalChanges = changesArray.length;

    this.totalPriceImpact = changesArray.reduce((total, change) => {
      return total + Math.abs(change.changeAmount);
    }, 0);

    this.hasSignificantChanges = changesArray.some(change => {
      return Math.abs(change.changePercentage) > 15 || Math.abs(change.changeAmount) > 50;
    });
  }

  if (!this.fileName) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    this.fileName = `Version_${this.versionNumber}_Changes_${timestamp}.txt`;
  }

  const textContent = this.generateTextContent();
  this.fileSize = Buffer.byteLength(textContent, 'utf8');

  next();
});

LogSchema.methods.generateTextContent = function() {
  const timestamp = new Date(this.createdAt || Date.now()).toISOString();
  const date = new Date(this.createdAt || Date.now()).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const currentChangesArray = this.currentChanges && this.currentChanges.length > 0
    ? this.currentChanges
    : this.changes;

  const previousChangesArray = this.allPreviousChanges || [];

  let content = '';
  content += '='.repeat(80) + '\n';
  content += '                    VERSION CHANGE LOG\n';
  content += '='.repeat(80) + '\n\n';

  if (this.agreementTitle) {
    content += `CUSTOMER/AGREEMENT: ${this.agreementTitle}\n`;
    content += '-'.repeat(80) + '\n\n';
  }

  content += `Document Title: ${this.documentTitle || 'Untitled Document'}\n`;
  content += `Agreement ID: ${this.agreementId}\n`;
  content += `Version ID: ${this.versionId}\n`;
  content += `Version Number: v${this.versionNumber}\n`;
  content += `Save Action: ${this.saveAction.toUpperCase().replace('_', ' ')}\n`;
  content += `Timestamp: ${date}\n`;
  content += `Salesperson: ${this.salespersonName} (${this.salespersonId})\n\n`;

  const totalCurrentChanges = currentChangesArray.length;
  const totalPriceImpact = this.totalPriceImpact || 0;
  const significantChanges = currentChangesArray.filter(change =>
    Math.abs(change.changeAmount || 0) >= 50 || Math.abs(change.changePercentage || 0) >= 15
  );

  content += '-'.repeat(80) + '\n';
  content += '                        SUMMARY\n';
  content += '-'.repeat(80) + '\n';
  content += `Total Changes Made: ${totalCurrentChanges}\n`;
  content += `Total Price Impact: $${totalPriceImpact.toFixed(2)}\n`;
  content += `Significant Changes: ${significantChanges.length} (≥$50 or ≥15%)\n`;
  content += `Review Status: ${significantChanges.length > 0 ? 'REQUIRES REVIEW' : 'AUTO-APPROVED'}\n\n`;

  if (currentChangesArray.length === 0) {
    content += '-'.repeat(80) + '\n';
    content += '                     NO CHANGES DETECTED\n';
    content += '-'.repeat(80) + '\n';
    content += 'No price overrides or modifications were made during this save.\n\n';
  } else {
    content += '-'.repeat(80) + '\n';
    content += '                    CURRENT CHANGES (This Version)\n';
    content += '-'.repeat(80) + '\n\n';

    content += this._formatChangesSection(currentChangesArray);

    if (significantChanges.length > 0) {
      content += '-'.repeat(80) + '\n';
      content += '                  WARNING: SIGNIFICANT CHANGES DETECTED\n';
      content += '-'.repeat(80) + '\n';
      content += 'The following changes exceed the significance threshold (≥$50 or ≥15%):\n\n';

      significantChanges.forEach((change, index) => {
        content += `${index + 1}. ${change.productName} - ${change.fieldDisplayName}\n`;
        content += `   Change: ${change.changeAmount >= 0 ? '+' : ''}$${(change.changeAmount || 0).toFixed(2)} `;
        content += `(${change.changeAmount >= 0 ? '+' : ''}${(change.changePercentage || 0).toFixed(1)}%)\n\n`;
      });

      content += 'These changes may require manager approval before finalizing.\n\n';
    }
  }

  if (previousChangesArray.length > 0) {
    content += '='.repeat(80) + '\n';
    content += '           ALL PREVIOUS CHANGES (Cumulative History)\n';
    content += '='.repeat(80) + '\n\n';

    content += `Total Historical Changes: ${previousChangesArray.length}\n`;
    content += `From Versions: v1 to v${this.versionNumber - 1}\n\n`;

    content += this._formatChangesSection(previousChangesArray);
  }

  content += '='.repeat(80) + '\n';
  content += '                      END OF LOG\n';
  content += '='.repeat(80) + '\n';
  content += `Generated on: ${timestamp}\n`;
  content += 'This log file contains a complete record of all pricing changes made during form editing.\n';

  return content;
};

LogSchema.methods._formatChangesSection = function(changesArray) {
  let content = '';

  const changesByProduct = {};
  changesArray.forEach(change => {
    if (!changesByProduct[change.productName]) {
      changesByProduct[change.productName] = [];
    }
    changesByProduct[change.productName].push(change);
  });

  let changeIndex = 1;
  Object.keys(changesByProduct).forEach(productName => {
    const productChanges = changesByProduct[productName];

    content += `${changeIndex}. ${productName}\n`;
    content += `   Type: ${productChanges[0].productType.toUpperCase()}\n`;
    if (productChanges[0].quantity) {
      content += `   Quantity: ${productChanges[0].quantity}\n`;
    }
    if (productChanges[0].frequency) {
      content += `   Frequency: ${productChanges[0].frequency}\n`;
    }
    content += '\n';

    productChanges.forEach(change => {
      if (change.changeType === 'text') {
        content += `   • ${change.fieldDisplayName}:\n`;
        content += `     Original Text:\n`;
        content += `     "${change.originalText || '(empty)'}"\n\n`;
        content += `     Changed To:\n`;
        content += `     "${change.newText || '(empty)'}"\n\n`;
        content += `     [TEXT CHANGE]\n\n`;
      } else {
        const isSignificant = Math.abs(change.changeAmount || 0) >= 50 || Math.abs(change.changePercentage || 0) >= 15;
        const indicator = isSignificant ? 'SIGNIFICANT' : 'Minor';

        content += `   • ${change.fieldDisplayName}:\n`;
        content += `     Original: $${(change.originalValue || 0).toFixed(2)}\n`;
        content += `     New: $${(change.newValue || 0).toFixed(2)}\n`;
        content += `     Change: ${change.changeAmount >= 0 ? '+' : ''}$${(change.changeAmount || 0).toFixed(2)} `;
        content += `(${change.changeAmount >= 0 ? '+' : ''}${(change.changePercentage || 0).toFixed(1)}%) ${indicator}\n\n`;
      }
    });

    changeIndex++;
  });

  return content;
};

LogSchema.index({ agreementId: 1, versionNumber: -1 });
LogSchema.index({ agreementId: 1, createdAt: -1 });
LogSchema.index({ versionId: 1 });
LogSchema.index({ salespersonId: 1, createdAt: -1 });
LogSchema.index({ isDeleted: 1 });

LogSchema.index({
  agreementId: 1,
  versionNumber: -1,
  createdAt: -1
});

LogSchema.statics.getLogsForAgreement = function(agreementId, options = {}) {
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

  return this.find(filter)
    .sort({ versionNumber: -1, createdAt: -1 })
    .limit(options.limit || 100)
    .lean();
};

const Log = mongoose.model("Log", LogSchema);

export default Log;
