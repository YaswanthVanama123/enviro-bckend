import PricingBackupService from '../services/pricingBackupService.js';
import BackupPricing from '../models/BackupPricing.js';

/**
 * Controller for managing pricing backups
 * Provides endpoints for creating, listing, restoring, and managing pricing backups
 */
class PricingBackupController {

  /**
   * Manually create a backup (for admin use)
   * POST /api/pricing-backup/create
   * Body: { changeDescription?: string, forceReplace?: boolean }
   */
  static async createManualBackup(req, res) {
    try {
      const { changeDescription = 'Manual backup created by admin', forceReplace = false } = req.body;
      const changedBy = req.user ? req.user._id : null;
      const adminUsername = req.user ? req.user.username : 'Unknown Admin';

      console.log(`[Backup Controller] Creating manual backup by ${adminUsername}, forceReplace: ${forceReplace}`);

      // Use the manual backup method
      const backupResult = await PricingBackupService.createManualBackup({
        changedBy,
        changedAreas: ['other'],
        changeDescription,
        changeCount: 1,
        forceReplace
      });

      if (backupResult.success) {
        console.log(`[Backup Controller] Manual backup created: ${backupResult.backup.changeDayId}`);
        return res.status(201).json({
          success: true,
          message: backupResult.message,
          data: backupResult,
          timestamp: new Date().toISOString()
        });
      } else if (backupResult.requiresConfirmation) {
        console.log(`[Backup Controller] Manual backup requires confirmation`);
        return res.status(409).json({
          success: false,
          requiresConfirmation: true,
          existingBackup: backupResult.existingBackup,
          message: backupResult.message,
          timestamp: new Date().toISOString()
        });
      } else {
        return res.status(500).json({
          success: false,
          message: backupResult.message,
          error: backupResult.error
        });
      }

    } catch (error) {
      console.error('[Backup Controller] Manual backup creation failed:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create manual backup',
        error: error.message
      });
    }
  }

  /**
   * Get list of available backups
   * GET /api/pricing-backup/list?limit=10
   */
  static async getBackupList(req, res) {
    try {
      const { limit = 10 } = req.query;
      const parsedLimit = Math.min(parseInt(limit) || 10, 50); // Cap at 50

      const backupsResult = await PricingBackupService.getAvailableBackups(parsedLimit);

      if (backupsResult.success) {
        return res.status(200).json({
          success: true,
          message: backupsResult.message,
          data: {
            backups: backupsResult.backups,
            totalChangeDays: backupsResult.totalChangeDays,
            requestedLimit: parsedLimit
          },
          timestamp: new Date().toISOString()
        });
      } else {
        return res.status(500).json({
          success: false,
          message: backupsResult.message,
          error: backupsResult.error
        });
      }

    } catch (error) {
      console.error('[Backup Controller] Get backup list failed:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve backup list',
        error: error.message
      });
    }
  }

  /**
   * Get detailed information about a specific backup
   * GET /api/pricing-backup/details/:changeDayId
   */
  static async getBackupDetails(req, res) {
    try {
      const { changeDayId } = req.params;

      if (!changeDayId) {
        return res.status(400).json({
          success: false,
          message: 'changeDayId parameter is required'
        });
      }

      const detailsResult = await PricingBackupService.getBackupDetails(changeDayId);

      if (detailsResult.success) {
        return res.status(200).json({
          success: true,
          message: detailsResult.message,
          data: detailsResult.backup,
          timestamp: new Date().toISOString()
        });
      } else {
        return res.status(404).json({
          success: false,
          message: detailsResult.message
        });
      }

    } catch (error) {
      console.error('[Backup Controller] Get backup details failed:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve backup details',
        error: error.message
      });
    }
  }

  /**
   * Restore pricing data from a backup
   * POST /api/pricing-backup/restore
   * Body: { changeDayId: string, restorationNotes?: string }
   */
  static async restoreFromBackup(req, res) {
    try {
      const { changeDayId, restorationNotes = '' } = req.body;
      const restoredBy = req.user ? req.user._id : null;
      const adminUsername = req.user ? req.user.username : 'Unknown Admin';

      if (!changeDayId) {
        return res.status(400).json({
          success: false,
          message: 'changeDayId is required in request body'
        });
      }

      console.log(`[Backup Controller] Starting restoration of backup ${changeDayId} by ${adminUsername}`);

      const restorationResult = await PricingBackupService.restoreFromBackup(
        changeDayId,
        restoredBy,
        `${restorationNotes} - Restored by ${adminUsername}`
      );

      if (restorationResult.success) {
        console.log(`[Backup Controller] Restoration completed successfully: ${restorationResult.message}`);
        return res.status(200).json({
          success: true,
          message: restorationResult.message,
          data: {
            changeDayId: restorationResult.changeDayId,
            changeDay: restorationResult.changeDay,
            totalRestored: restorationResult.totalRestored,
            results: restorationResult.results
          },
          timestamp: new Date().toISOString()
        });
      } else {
        console.error(`[Backup Controller] Restoration failed: ${restorationResult.message}`);
        return res.status(500).json({
          success: false,
          message: restorationResult.message,
          error: restorationResult.error
        });
      }

    } catch (error) {
      console.error('[Backup Controller] Restore from backup failed:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to restore from backup',
        error: error.message
      });
    }
  }

  /**
   * Get backup system statistics and health information
   * GET /api/pricing-backup/statistics
   */
  static async getBackupStatistics(req, res) {
    try {
      const statisticsResult = await PricingBackupService.getBackupStatistics();

      if (statisticsResult.success) {
        return res.status(200).json({
          success: true,
          message: statisticsResult.message,
          data: statisticsResult.statistics,
          timestamp: new Date().toISOString()
        });
      } else {
        return res.status(500).json({
          success: false,
          message: statisticsResult.message,
          error: statisticsResult.error
        });
      }

    } catch (error) {
      console.error('[Backup Controller] Get backup statistics failed:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve backup statistics',
        error: error.message
      });
    }
  }

  /**
   * Manually enforce retention policy
   * POST /api/pricing-backup/enforce-retention
   */
  static async enforceRetentionPolicy(req, res) {
    try {
      const adminUsername = req.user ? req.user.username : 'Unknown Admin';

      console.log(`[Backup Controller] Manually enforcing retention policy by ${adminUsername}`);

      const retentionResult = await BackupPricing.enforceRetentionPolicy();

      return res.status(200).json({
        success: true,
        message: `Retention policy enforced by ${adminUsername}`,
        data: retentionResult,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('[Backup Controller] Enforce retention policy failed:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to enforce retention policy',
        error: error.message
      });
    }
  }

  /**
   * Delete specific backups
   * DELETE /api/pricing-backup/delete
   * Body: { changeDayIds: string[] }
   */
  static async deleteBackups(req, res) {
    try {
      const { changeDayIds } = req.body;
      const deletedBy = req.user ? req.user._id : null;
      const adminUsername = req.user ? req.user.username : 'Unknown Admin';

      if (!Array.isArray(changeDayIds) || changeDayIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'changeDayIds array is required and must not be empty'
        });
      }

      console.log(`[Backup Controller] Deleting backups ${changeDayIds.join(', ')} by ${adminUsername}`);

      const deleteResult = await PricingBackupService.deleteBackups(changeDayIds, deletedBy);

      if (deleteResult.success) {
        return res.status(200).json({
          success: true,
          message: `${deleteResult.message} by ${adminUsername}`,
          data: {
            deletedCount: deleteResult.deletedCount,
            deletedBackups: deleteResult.deletedBackups,
            deletedBy: adminUsername
          },
          timestamp: new Date().toISOString()
        });
      } else {
        return res.status(500).json({
          success: false,
          message: deleteResult.message,
          error: deleteResult.error
        });
      }

    } catch (error) {
      console.error('[Backup Controller] Delete backups failed:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete backups',
        error: error.message
      });
    }
  }

  /**
   * Get backup snapshot data (for preview before restoration)
   * GET /api/pricing-backup/snapshot/:changeDayId
   */
  static async getBackupSnapshot(req, res) {
    try {
      const { changeDayId } = req.params;
      const { preview = 'true' } = req.query;

      if (!changeDayId) {
        return res.status(400).json({
          success: false,
          message: 'changeDayId parameter is required'
        });
      }

      const backup = await BackupPricing.findOne({ changeDayId });
      if (!backup) {
        return res.status(404).json({
          success: false,
          message: 'Backup not found'
        });
      }

      // Get the decompressed snapshot
      const snapshot = backup.getSnapshot();

      // If preview mode, return summarized version with sample documents
      if (preview === 'true') {
        const previewData = {
          timestamp: snapshot.timestamp,
          backupVersion: snapshot.metadata?.backupVersion,
          totalDocuments: snapshot.metadata?.totalDocuments,
          dataTypes: {
            priceFix: {
              count: snapshot.dataTypes?.priceFix?.count || 0,
              hasData: (snapshot.dataTypes?.priceFix?.count || 0) > 0,
              // Include ALL pricing documents for hierarchical view
              documents: snapshot.dataTypes?.priceFix?.documents || []
            },
            productCatalog: {
              activeCount: snapshot.dataTypes?.productCatalog?.activeCount || 0,
              totalCount: snapshot.dataTypes?.productCatalog?.totalCount || 0,
              hasData: (snapshot.dataTypes?.productCatalog?.totalCount || 0) > 0,
              // Include complete active catalog with ALL families and products
              active: snapshot.dataTypes?.productCatalog?.active || null,
              // Include ALL catalogs for complete view
              all: snapshot.dataTypes?.productCatalog?.all || []
            },
            serviceConfigs: {
              count: snapshot.dataTypes?.serviceConfigs?.count || 0,
              activeCount: snapshot.dataTypes?.serviceConfigs?.activeCount || 0,
              hasData: (snapshot.dataTypes?.serviceConfigs?.count || 0) > 0,
              // Include ALL service configs for hierarchical view
              documents: snapshot.dataTypes?.serviceConfigs?.documents || []
            }
          }
        };

        return res.status(200).json({
          success: true,
          message: 'Backup snapshot preview retrieved',
          data: {
            changeDayId,
            changeDay: backup.changeDay,
            preview: previewData,
            fullSnapshotAvailable: true
          },
          timestamp: new Date().toISOString()
        });
      } else {
        // Return full snapshot (be careful with large data)
        return res.status(200).json({
          success: true,
          message: 'Full backup snapshot retrieved',
          data: {
            changeDayId,
            changeDay: backup.changeDay,
            snapshot: snapshot
          },
          timestamp: new Date().toISOString()
        });
      }

    } catch (error) {
      console.error('[Backup Controller] Get backup snapshot failed:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve backup snapshot',
        error: error.message
      });
    }
  }

  /**
   * Health check endpoint for backup system
   * GET /api/pricing-backup/health
   *
   * ✅ OPTIMIZED: Single aggregation query instead of 4 separate queries
   */
  static async getBackupSystemHealth(req, res) {
    try {
      const startTime = Date.now();
      console.log('[BACKUP-HEALTH] Starting optimized health check...');

      // ⚡ OPTIMIZED: Single aggregation with $facet for all health checks
      const healthData = await BackupPricing.aggregate([
        {
          $facet: {
            // Total backups count
            totalCount: [{ $count: 'count' }],

            // Unique changeDays
            uniqueChangeDays: [
              { $group: { _id: '$changeDay' } },
              { $count: 'count' }
            ],

            // Check if backup exists for today
            todayBackup: [
              {
                $match: {
                  changeDay: BackupPricing.getCurrentDateString()
                }
              },
              { $limit: 1 },
              { $project: { _id: 1 } }
            ],

            // Most recent backup
            recentBackup: [
              { $sort: { changeDay: -1, createdAt: -1 } },
              { $limit: 1 },
              {
                $project: {
                  changeDay: 1,
                  createdAt: 1,
                  backupTrigger: 1
                }
              }
            ]
          }
        }
      ]);

      const queryTime = Date.now() - startTime;

      // Extract results from aggregation
      const result = healthData[0];
      const totalBackups = result.totalCount[0]?.count || 0;
      const uniqueChangeDaysCount = result.uniqueChangeDays[0]?.count || 0;
      const hasBackupToday = result.todayBackup.length > 0;
      const recentBackup = result.recentBackup[0] || null;

      const health = {
        status: 'healthy',
        checks: {
          backupModelAccessible: true,
          totalBackups: totalBackups,
          uniqueChangeDays: uniqueChangeDaysCount,
          retentionPolicyCompliant: uniqueChangeDaysCount <= 10,
          hasBackupToday: hasBackupToday,
          mostRecentBackup: recentBackup ? {
            changeDay: recentBackup.changeDay,
            createdAt: recentBackup.createdAt,
            trigger: recentBackup.backupTrigger
          } : null
        },
        warnings: []
      };

      // Add warnings if needed
      if (uniqueChangeDaysCount > 10) {
        health.warnings.push('Retention policy may need enforcement - more than 10 change-days stored');
        health.status = 'warning';
      }

      if (totalBackups === 0) {
        health.warnings.push('No backups exist in the system');
        health.status = 'warning';
      }

      console.log(`⚡ [BACKUP-HEALTH] Optimized health check completed in ${queryTime}ms`);

      return res.status(200).json({
        success: true,
        message: `Backup system health: ${health.status}`,
        data: health,
        timestamp: new Date().toISOString(),
        _metadata: {
          queryTime: `${queryTime}ms`,
          optimized: true,
          queryType: 'single_aggregation_with_facet'
        }
      });

    } catch (error) {
      console.error('[Backup Controller] Health check failed:', error);
      return res.status(500).json({
        success: false,
        message: 'Backup system health check failed',
        error: error.message,
        data: {
          status: 'unhealthy',
          checks: {
            backupModelAccessible: false
          },
          warnings: ['Database connection or model access failed']
        }
      });
    }
  }
}

export default PricingBackupController;