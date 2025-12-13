import BackupPricing from '../models/BackupPricing.js';
import PriceFix from '../models/PriceFix.js';
import ProductCatalog from '../models/ProductCatalog.js';
import ServiceConfig from '../models/ServiceConfig.js';

class PricingBackupService {

  /**
   * Create a pricing backup if one doesn't already exist for today
   * @param {Object} options - Backup options
   * @param {string} options.trigger - What triggered this backup
   * @param {ObjectId} options.changedBy - Admin user who made the change
   * @param {Array} options.changedAreas - Which pricing areas were changed
   * @param {string} options.changeDescription - Description of the change
   * @param {number} options.changeCount - Number of changes made
   * @returns {Object} Backup result
   */
  static async createBackupIfNeeded(options = {}) {
    try {
      const {
        trigger = 'manual',
        changedBy = null,
        changedAreas = [],
        changeDescription = '',
        changeCount = 1
      } = options;

      // Check if backup already exists for today
      const hasBackupToday = await BackupPricing.hasBackupForToday();
      if (hasBackupToday) {
        return {
          success: true,
          skipped: true,
          message: 'Backup already exists for today',
          changeDay: BackupPricing.getCurrentDateString()
        };
      }

      // Collect all current pricing data
      const pricingSnapshot = await this.collectAllPricingData();

      // Compress the snapshot
      const compressionResult = BackupPricing.compressPricingData(pricingSnapshot);

      // Calculate metadata
      const metadata = this.calculateSnapshotMetadata(pricingSnapshot, compressionResult);

      // Create the backup record
      const changeDay = BackupPricing.getCurrentDateString();
      const changeDayId = BackupPricing.generateChangeDayId(changeDay);

      const backupRecord = new BackupPricing({
        changeDayId,
        changeDay,
        firstChangeTimestamp: new Date(),
        compressedSnapshot: compressionResult.compressedData,
        snapshotMetadata: metadata,
        backupTrigger: trigger,
        changedBy,
        changeContext: {
          changedAreas,
          changeDescription,
          changeCount
        }
      });

      await backupRecord.save();

      // Enforce retention policy (keep only last 10 change-days)
      const retentionResult = await BackupPricing.enforceRetentionPolicy();

      return {
        success: true,
        created: true,
        backup: {
          id: backupRecord._id,
          changeDayId: backupRecord.changeDayId,
          changeDay: backupRecord.changeDay,
          originalSize: compressionResult.originalSize,
          compressedSize: compressionResult.compressedSize,
          compressionRatio: compressionResult.compressionRatio
        },
        retentionPolicy: retentionResult,
        message: 'Backup created successfully'
      };

    } catch (error) {
      console.error('Backup creation failed:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to create pricing backup'
      };
    }
  }

  /**
   * Collect all current pricing data from all sources
   * @returns {Object} Complete pricing snapshot
   */
  static async collectAllPricingData() {
    try {
      // Get all PriceFix data (service pricing master)
      const priceFixes = await PriceFix.find({}).lean();

      // Get the active ProductCatalog
      const activeProductCatalog = await ProductCatalog.findOne({ isActive: true }).lean();

      // Get all ProductCatalogs for completeness (in case active flag fails)
      const allProductCatalogs = await ProductCatalog.find({}).lean();

      // Get all ServiceConfigs (both active and inactive for complete backup)
      const serviceConfigs = await ServiceConfig.find({}).lean();

      // Create comprehensive snapshot
      const snapshot = {
        timestamp: new Date().toISOString(),
        dataTypes: {
          priceFix: {
            documents: priceFixes,
            count: priceFixes.length
          },
          productCatalog: {
            active: activeProductCatalog,
            all: allProductCatalogs,
            activeCount: activeProductCatalog ? 1 : 0,
            totalCount: allProductCatalogs.length
          },
          serviceConfigs: {
            documents: serviceConfigs,
            count: serviceConfigs.length,
            activeCount: serviceConfigs.filter(config => config.isActive).length
          }
        },
        metadata: {
          backupVersion: '1.0',
          collectionTimestamp: new Date(),
          totalDocuments: priceFixes.length + allProductCatalogs.length + serviceConfigs.length
        }
      };

      return snapshot;

    } catch (error) {
      throw new Error(`Failed to collect pricing data: ${error.message}`);
    }
  }

  /**
   * Calculate metadata about the snapshot
   * @param {Object} snapshot - Pricing data snapshot
   * @param {Object} compressionResult - Compression results
   * @returns {Object} Metadata object
   */
  static calculateSnapshotMetadata(snapshot, compressionResult) {
    const { priceFix, productCatalog, serviceConfigs } = snapshot.dataTypes;

    // Calculate actual product count from all families
    let totalProductCount = 0;
    if (productCatalog.active && productCatalog.active.families) {
      totalProductCount = productCatalog.active.families.reduce((count, family) => {
        return count + (family.products ? family.products.length : 0);
      }, 0);
    }

    // Add products from all other catalogs if any
    if (productCatalog.all && Array.isArray(productCatalog.all)) {
      productCatalog.all.forEach(catalog => {
        if (catalog.families && catalog !== productCatalog.active) {
          totalProductCount += catalog.families.reduce((count, family) => {
            return count + (family.products ? family.products.length : 0);
          }, 0);
        }
      });
    }

    return {
      includedDataTypes: {
        // Always include all data types in backup, even if empty (represents current state)
        priceFix: true,
        productCatalog: true,
        serviceConfigs: true
      },
      documentCounts: {
        priceFixCount: priceFix.count,
        productCatalogCount: totalProductCount, // Now counts actual products, not catalogs
        serviceConfigCount: serviceConfigs.count
      },
      originalSize: compressionResult.originalSize,
      compressedSize: compressionResult.compressedSize,
      compressionRatio: compressionResult.compressionRatio
    };
  }

  /**
   * Restore pricing data from a backup
   * @param {string} changeDayId - ID of the backup to restore
   * @param {ObjectId} restoredBy - Admin user performing the restore
   * @param {string} restorationNotes - Notes about the restoration
   * @returns {Object} Restoration result
   */
  static async restoreFromBackup(changeDayId, restoredBy, restorationNotes = '') {
    try {
      // Find the backup
      const backup = await BackupPricing.findOne({ changeDayId });
      if (!backup) {
        throw new Error(`Backup not found: ${changeDayId}`);
      }

      // Decompress the snapshot
      const snapshot = backup.getSnapshot();

      // Validate snapshot structure
      if (!snapshot.dataTypes) {
        throw new Error('Invalid backup snapshot structure');
      }

      const restorationResults = {
        priceFix: { restored: 0, errors: [] },
        productCatalog: { restored: 0, errors: [] },
        serviceConfigs: { restored: 0, errors: [] }
      };

      // Restore PriceFix data
      if (snapshot.dataTypes.priceFix.documents.length > 0) {
        try {
          await PriceFix.deleteMany({}); // Clear existing
          const priceFixDocs = snapshot.dataTypes.priceFix.documents.map(doc => {
            delete doc._id; // Remove _id to create new documents
            return doc;
          });
          await PriceFix.insertMany(priceFixDocs);
          restorationResults.priceFix.restored = priceFixDocs.length;
        } catch (error) {
          restorationResults.priceFix.errors.push(error.message);
        }
      }

      // Restore ProductCatalog data
      if (snapshot.dataTypes.productCatalog.all.length > 0) {
        try {
          await ProductCatalog.deleteMany({}); // Clear existing
          const catalogDocs = snapshot.dataTypes.productCatalog.all.map(doc => {
            delete doc._id; // Remove _id to create new documents
            return doc;
          });
          await ProductCatalog.insertMany(catalogDocs);
          restorationResults.productCatalog.restored = catalogDocs.length;
        } catch (error) {
          restorationResults.productCatalog.errors.push(error.message);
        }
      }

      // Restore ServiceConfig data
      if (snapshot.dataTypes.serviceConfigs.documents.length > 0) {
        try {
          await ServiceConfig.deleteMany({}); // Clear existing
          const serviceConfigDocs = snapshot.dataTypes.serviceConfigs.documents.map(doc => {
            delete doc._id; // Remove _id to create new documents
            return doc;
          });
          await ServiceConfig.insertMany(serviceConfigDocs);
          restorationResults.serviceConfigs.restored = serviceConfigDocs.length;
        } catch (error) {
          restorationResults.serviceConfigs.errors.push(error.message);
        }
      }

      // Update backup record to mark as restored
      backup.restorationInfo = {
        hasBeenRestored: true,
        lastRestoredAt: new Date(),
        restoredBy,
        restorationNotes
      };
      await backup.save();

      // Calculate success metrics
      const totalRestored = restorationResults.priceFix.restored +
                           restorationResults.productCatalog.restored +
                           restorationResults.serviceConfigs.restored;

      const totalErrors = restorationResults.priceFix.errors.length +
                         restorationResults.productCatalog.errors.length +
                         restorationResults.serviceConfigs.errors.length;

      return {
        success: totalErrors === 0,
        changeDayId,
        changeDay: backup.changeDay,
        totalRestored,
        totalErrors,
        results: restorationResults,
        message: totalErrors === 0 ?
          `Successfully restored ${totalRestored} documents from ${backup.changeDay}` :
          `Restored ${totalRestored} documents with ${totalErrors} errors`
      };

    } catch (error) {
      console.error('Restoration failed:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to restore pricing backup'
      };
    }
  }

  /**
   * Get list of available backups with summary information
   * @param {number} limit - Maximum number of backups to return
   * @returns {Object} List of backups
   */
  static async getAvailableBackups(limit = 10) {
    try {
      const backups = await BackupPricing.getLastNChangeDays(limit);
      console.log(`[DEBUG] getAvailableBackups: Processing ${backups.length} backups`);

      const backupSummary = backups.map((item, index) => {
        const changeDayId = item.backup.changeDayId;
        console.log(`[DEBUG] Processing backup ${index + 1}/${backups.length}: ${changeDayId}`);

        let correctedProductCount = item.backup.snapshotMetadata?.documentCounts?.productCatalogCount || 0;
        console.log(`[DEBUG] ${changeDayId} - Stored productCatalogCount: ${correctedProductCount}`);

        // Recalculate product count from actual snapshot data
        try {
          console.log(`[DEBUG] ${changeDayId} - Attempting to decompress snapshot...`);

          // Convert MongoDB Binary to Buffer if needed
          let compressedData = item.backup.compressedSnapshot;
          if (compressedData && typeof compressedData === 'object' && compressedData.buffer) {
            // MongoDB Binary object - extract the buffer
            compressedData = compressedData.buffer;
          }
          console.log(`[DEBUG] ${changeDayId} - Compressed data type: ${typeof compressedData}, constructor: ${compressedData.constructor.name}`);

          // Use static decompression method since aggregation returns plain objects
          const snapshot = BackupPricing.decompressPricingData(compressedData);
          console.log(`[DEBUG] ${changeDayId} - Snapshot decompressed successfully`);

          if (snapshot.dataTypes?.productCatalog?.active?.families) {
            const families = snapshot.dataTypes.productCatalog.active.families;
            console.log(`[DEBUG] ${changeDayId} - Found ${families.length} families`);

            families.forEach((family, famIndex) => {
              const productCount = family.products ? family.products.length : 0;
              console.log(`[DEBUG] ${changeDayId} - Family ${famIndex + 1} (${family.familyName || family.name || 'unnamed'}): ${productCount} products`);
            });

            correctedProductCount = families.reduce((count, family) => {
              const familyProductCount = family.products ? family.products.length : 0;
              return count + familyProductCount;
            }, 0);

            console.log(`[DEBUG] ${changeDayId} - Recalculated productCount: ${correctedProductCount}`);
          } else {
            console.log(`[DEBUG] ${changeDayId} - No families found in snapshot`);
            console.log(`[DEBUG] ${changeDayId} - ProductCatalog structure:`, {
              hasProductCatalog: !!snapshot.dataTypes?.productCatalog,
              hasActive: !!snapshot.dataTypes?.productCatalog?.active,
              activeKeys: snapshot.dataTypes?.productCatalog?.active ? Object.keys(snapshot.dataTypes.productCatalog.active) : 'N/A'
            });
          }
        } catch (error) {
          console.error(`[DEBUG] ${changeDayId} - Error processing snapshot:`, error.message);
          console.warn(`Could not recalculate product count for backup ${changeDayId}, using stored metadata`);
        }

        // Create corrected document counts
        const correctedDocumentCounts = {
          ...item.backup.snapshotMetadata.documentCounts,
          productCatalogCount: correctedProductCount
        };

        console.log(`[DEBUG] ${changeDayId} - Final corrected counts:`, correctedDocumentCounts);

        return {
          changeDayId: item.backup.changeDayId,
          changeDay: item.backup.changeDay,
          firstChangeTimestamp: item.backup.firstChangeTimestamp,
          backupTrigger: item.backup.backupTrigger,
          changeContext: {
            changedAreas: item.backup.changeContext.changedAreas,
            changeDescription: item.backup.changeContext.changeDescription,
            changeCount: item.backup.changeContext.changeCount
          },
          snapshotMetadata: {
            documentCounts: correctedDocumentCounts, // Use corrected counts
            originalSize: item.backup.snapshotMetadata.originalSize,
            compressedSize: item.backup.snapshotMetadata.compressedSize,
            compressionRatio: item.backup.snapshotMetadata.compressionRatio,
            includedDataTypes: item.backup.snapshotMetadata.includedDataTypes
          },
          restorationInfo: {
            hasBeenRestored: item.backup.restorationInfo.hasBeenRestored,
            lastRestoredAt: item.backup.restorationInfo.lastRestoredAt
          },
          createdAt: item.backup.createdAt,
          updatedAt: item.backup.updatedAt,
          backupCount: item.backupCount
        };
      });

      console.log(`[DEBUG] getAvailableBackups: Returning ${backupSummary.length} processed backups`);

      return {
        success: true,
        backups: backupSummary,
        totalChangeDays: backups.length,
        message: `Found ${backups.length} backup change-days`
      };

    } catch (error) {
      console.error('Failed to get available backups:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to retrieve backup list'
      };
    }
  }

  /**
   * Get detailed information about a specific backup
   * @param {string} changeDayId - ID of the backup
   * @returns {Object} Detailed backup information
   */
  static async getBackupDetails(changeDayId) {
    try {
      const backup = await BackupPricing.findOne({ changeDayId })
        .populate('changedBy', 'username email')
        .populate('restorationInfo.restoredBy', 'username email');

      if (!backup) {
        return {
          success: false,
          message: 'Backup not found'
        };
      }

      console.log(`[DEBUG] Processing backup details for ${changeDayId}`);
      console.log(`[DEBUG] Stored metadata productCatalogCount:`, backup.snapshotMetadata?.documentCounts?.productCatalogCount);

      // Recalculate product count from actual snapshot data for accurate display
      let actualProductCount = backup.snapshotMetadata?.documentCounts?.productCatalogCount || 0;

      try {
        console.log(`[DEBUG] Attempting to decompress snapshot...`);

        // Convert MongoDB Binary to Buffer if needed (for consistency with aggregation results)
        let compressedData = backup.compressedSnapshot;
        if (compressedData && typeof compressedData === 'object' && compressedData.buffer) {
          // MongoDB Binary object - extract the buffer
          compressedData = compressedData.buffer;
        }
        console.log(`[DEBUG] Compressed data type: ${typeof compressedData}, constructor: ${compressedData.constructor.name}`);

        // Use static decompression method for consistency
        const snapshot = BackupPricing.decompressPricingData(compressedData);
        console.log(`[DEBUG] Snapshot decompressed successfully`);
        console.log(`[DEBUG] Snapshot structure:`, {
          hasDataTypes: !!snapshot.dataTypes,
          hasProductCatalog: !!snapshot.dataTypes?.productCatalog,
          hasActive: !!snapshot.dataTypes?.productCatalog?.active,
          hasFamilies: !!snapshot.dataTypes?.productCatalog?.active?.families
        });

        if (snapshot.dataTypes?.productCatalog?.active?.families) {
          const families = snapshot.dataTypes.productCatalog.active.families;
          console.log(`[DEBUG] Found ${families.length} families in active catalog`);

          families.forEach((family, index) => {
            const productCount = family.products ? family.products.length : 0;
            console.log(`[DEBUG] Family ${index + 1} (${family.familyName || family.name || 'unnamed'}): ${productCount} products`);
          });

          actualProductCount = families.reduce((count, family) => {
            const familyProductCount = family.products ? family.products.length : 0;
            return count + familyProductCount;
          }, 0);

          console.log(`[DEBUG] Calculated total product count: ${actualProductCount}`);
        } else {
          console.log(`[DEBUG] No families found in snapshot structure`);
          console.log(`[DEBUG] Full productCatalog structure:`, JSON.stringify(snapshot.dataTypes?.productCatalog, null, 2));
        }
      } catch (error) {
        console.error(`[DEBUG] Error decompressing or processing snapshot:`, error);
        console.warn('Could not recalculate product count from snapshot, using stored metadata');
      }

      // Create corrected metadata for response
      const correctedMetadata = {
        ...backup.snapshotMetadata,
        documentCounts: {
          ...backup.snapshotMetadata.documentCounts,
          productCatalogCount: actualProductCount
        }
      };

      console.log(`[DEBUG] Final product count being returned: ${actualProductCount}`);
      console.log(`[DEBUG] Corrected document counts:`, correctedMetadata.documentCounts);

      return {
        success: true,
        backup: {
          changeDayId: backup.changeDayId,
          changeDay: backup.changeDay,
          firstChangeTimestamp: backup.firstChangeTimestamp,
          backupTrigger: backup.backupTrigger,
          changedBy: backup.changedBy,
          changeContext: backup.changeContext,
          snapshotMetadata: correctedMetadata,
          restorationInfo: backup.restorationInfo,
          createdAt: backup.createdAt,
          updatedAt: backup.updatedAt
        },
        message: 'Backup details retrieved successfully'
      };

    } catch (error) {
      console.error('Failed to get backup details:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to retrieve backup details'
      };
    }
  }

  /**
   * Delete old backups manually (beyond retention policy)
   * @param {Array} changeDayIds - Array of backup IDs to delete
   * @param {ObjectId} deletedBy - Admin user performing the deletion
   * @returns {Object} Deletion result
   */
  static async deleteBackups(changeDayIds, deletedBy) {
    try {
      const deleteResult = await BackupPricing.deleteMany({
        changeDayId: { $in: changeDayIds }
      });

      return {
        success: true,
        deletedCount: deleteResult.deletedCount,
        deletedBackups: changeDayIds,
        deletedBy,
        message: `Successfully deleted ${deleteResult.deletedCount} backups`
      };

    } catch (error) {
      console.error('Failed to delete backups:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to delete backups'
      };
    }
  }

  /**
   * Get backup statistics and health information
   * @returns {Object} Backup system statistics
   */
  static async getBackupStatistics() {
    try {
      const totalBackups = await BackupPricing.countDocuments();
      const uniqueChangeDays = await BackupPricing.distinct('changeDay');

      const sizeStats = await BackupPricing.aggregate([
        {
          $group: {
            _id: null,
            totalOriginalSize: { $sum: '$snapshotMetadata.originalSize' },
            totalCompressedSize: { $sum: '$snapshotMetadata.compressedSize' },
            avgCompressionRatio: { $avg: '$snapshotMetadata.compressionRatio' },
            minCompressionRatio: { $min: '$snapshotMetadata.compressionRatio' },
            maxCompressionRatio: { $max: '$snapshotMetadata.compressionRatio' }
          }
        }
      ]);

      const triggerStats = await BackupPricing.aggregate([
        {
          $group: {
            _id: '$backupTrigger',
            count: { $sum: 1 }
          }
        }
      ]);

      const recentBackups = await BackupPricing.find({})
        .sort({ changeDay: -1 })
        .limit(5)
        .select('changeDayId changeDay backupTrigger snapshotMetadata.documentCounts');

      return {
        success: true,
        statistics: {
          totalBackups,
          uniqueChangeDays: uniqueChangeDays.length,
          retentionCompliance: uniqueChangeDays.length <= 10,
          sizeStatistics: sizeStats[0] || {},
          triggerStatistics: triggerStats,
          recentBackups: recentBackups,
          systemHealth: {
            isHealthy: uniqueChangeDays.length <= 10 && totalBackups > 0,
            warnings: uniqueChangeDays.length > 10 ?
              ['Retention policy may need enforcement'] : []
          }
        },
        message: 'Backup statistics retrieved successfully'
      };

    } catch (error) {
      console.error('Failed to get backup statistics:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to retrieve backup statistics'
      };
    }
  }
}

export default PricingBackupService;