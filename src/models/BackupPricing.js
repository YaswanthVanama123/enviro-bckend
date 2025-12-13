import mongoose from 'mongoose';
import zlib from 'zlib';

const BackupPricingSchema = new mongoose.Schema({
  // Unique identifier for this change-day
  changeDayId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // Date when the first change occurred (YYYY-MM-DD format)
  changeDay: {
    type: String,
    required: true,
    index: true
  },

  // Timestamp of when the first change occurred that day
  firstChangeTimestamp: {
    type: Date,
    required: true
  },

  // Compressed snapshot of ALL pricing data at the time of backup
  compressedSnapshot: {
    type: Buffer,
    required: true
  },

  // Metadata about what was backed up
  snapshotMetadata: {
    // Summary of what pricing data types were included
    includedDataTypes: {
      priceFix: {
        type: Boolean,
        default: false
      },
      productCatalog: {
        type: Boolean,
        default: false
      },
      serviceConfigs: {
        type: Boolean,
        default: false
      }
    },

    // Document counts for verification
    documentCounts: {
      priceFixCount: {
        type: Number,
        default: 0
      },
      productCatalogCount: {
        type: Number,
        default: 0
      },
      serviceConfigCount: {
        type: Number,
        default: 0
      }
    },

    // Size information
    originalSize: {
      type: Number,
      required: true
    },
    compressedSize: {
      type: Number,
      required: true
    },
    compressionRatio: {
      type: Number,
      required: true
    }
  },

  // What triggered this backup
  backupTrigger: {
    type: String,
    enum: ['pricefix_update', 'product_catalog_update', 'service_config_update', 'manual', 'scheduled'],
    required: true
  },

  // Which admin user made the change that triggered this backup
  changedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AdminUser',
    required: false
  },

  // Additional context about the change
  changeContext: {
    // Which specific pricing area was changed
    changedAreas: [{
      type: String,
      enum: [
        'pricefix_services',
        'pricefix_tripcharge',
        'product_catalog_families',
        'product_catalog_products',
        'service_config_saniclean',
        'service_config_foamingdrain',
        'service_config_scrubservice',
        'service_config_handsanitizer',
        'service_config_micromaxfloor',
        'service_config_rpmwindow',
        'service_config_sanipod',
        'service_config_custom',
        'other'
      ]
    }],

    // Brief description of the change
    changeDescription: {
      type: String,
      maxlength: 500
    },

    // Number of individual changes made
    changeCount: {
      type: Number,
      default: 1
    }
  },

  // Restoration tracking
  restorationInfo: {
    hasBeenRestored: {
      type: Boolean,
      default: false
    },
    lastRestoredAt: {
      type: Date
    },
    restoredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser'
    },
    restorationNotes: {
      type: String,
      maxlength: 1000
    }
  }
}, {
  timestamps: true,
  collection: 'backuppricing'
});

// Compound index for efficient querying by changeDay (for retention policy)
BackupPricingSchema.index({ changeDay: -1, createdAt: -1 });

// Index for finding backups by trigger type
BackupPricingSchema.index({ backupTrigger: 1, changeDay: -1 });

// Index for admin user tracking
BackupPricingSchema.index({ changedBy: 1, changeDay: -1 });

// Static method to compress pricing data
BackupPricingSchema.statics.compressPricingData = function(pricingData) {
  try {
    const jsonString = JSON.stringify(pricingData);
    const compressed = zlib.gzipSync(jsonString);

    return {
      compressedData: compressed,
      originalSize: jsonString.length,
      compressedSize: compressed.length,
      compressionRatio: Math.round((compressed.length / jsonString.length) * 100) / 100
    };
  } catch (error) {
    throw new Error(`Compression failed: ${error.message}`);
  }
};

// Static method to decompress pricing data
BackupPricingSchema.statics.decompressPricingData = function(compressedBuffer) {
  try {
    const decompressed = zlib.gunzipSync(compressedBuffer);
    return JSON.parse(decompressed.toString());
  } catch (error) {
    throw new Error(`Decompression failed: ${error.message}`);
  }
};

// Instance method to get decompressed snapshot
BackupPricingSchema.methods.getSnapshot = function() {
  return this.constructor.decompressPricingData(this.compressedSnapshot);
};

// Static method to get current date string (YYYY-MM-DD)
BackupPricingSchema.statics.getCurrentDateString = function() {
  return new Date().toISOString().split('T')[0];
};

// Static method to generate change day ID
BackupPricingSchema.statics.generateChangeDayId = function(changeDay) {
  return `backup_${changeDay}_${Date.now()}`;
};

// Static method to enforce retention policy (keep only last 10 change-days)
BackupPricingSchema.statics.enforceRetentionPolicy = async function() {
  try {
    // Get all unique change days, sorted by date descending
    const changeDays = await this.distinct('changeDay');

    // Sort the change days in descending order (most recent first)
    changeDays.sort().reverse();

    if (changeDays.length <= 10) {
      return { deletedCount: 0, message: 'Retention policy not needed' };
    }

    // Get change days to delete (everything beyond the 10 most recent)
    const changeDaysToDelete = changeDays.slice(10);

    if (changeDaysToDelete.length === 0) {
      return { deletedCount: 0, message: 'No old change days to delete' };
    }

    // Delete backups for the oldest change days
    const deleteResult = await this.deleteMany({
      changeDay: { $in: changeDaysToDelete }
    });

    return {
      deletedCount: deleteResult.deletedCount,
      deletedChangeDays: changeDaysToDelete,
      message: `Deleted ${deleteResult.deletedCount} backups from ${changeDaysToDelete.length} old change days`
    };
  } catch (error) {
    throw new Error(`Retention policy enforcement failed: ${error.message}`);
  }
};

// Static method to check if backup already exists for today
BackupPricingSchema.statics.hasBackupForToday = async function() {
  const today = this.getCurrentDateString();
  const existingBackup = await this.findOne({ changeDay: today });
  return !!existingBackup;
};

// Static method to get last N change days (now returns ALL backups, not grouped)
BackupPricingSchema.statics.getLastNChangeDays = async function(n = 10) {
  // Get the last N unique change days first
  const uniqueChangeDays = await this.distinct('changeDay', {}, { sort: { changeDay: -1 } });
  const lastNChangeDays = uniqueChangeDays.sort().reverse().slice(0, n);

  if (lastNChangeDays.length === 0) {
    return [];
  }

  // Now get ALL backups from those change days (both auto and manual)
  const backups = await this.find({
    changeDay: { $in: lastNChangeDays }
  })
    .sort({ changeDay: -1, createdAt: -1 })
    .lean();

  // Transform to match the expected structure with individual backups
  return backups.map(backup => ({
    changeDay: backup.changeDay,
    backup: backup,
    backupCount: 1  // Each backup is counted individually now
  }));
};

// Pre-save middleware to validate change day format
BackupPricingSchema.pre('save', function(next) {
  // Validate changeDay format (YYYY-MM-DD)
  const changeDayRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!changeDayRegex.test(this.changeDay)) {
    return next(new Error('changeDay must be in YYYY-MM-DD format'));
  }

  // Ensure changeDayId is unique
  if (!this.changeDayId) {
    this.changeDayId = this.constructor.generateChangeDayId(this.changeDay);
  }

  next();
});

export default mongoose.model('BackupPricing', BackupPricingSchema);