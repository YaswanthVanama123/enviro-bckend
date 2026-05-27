import PricingBackupService from "../../services/pricingBackupService.js";
import { BackupPricing as PricingBackup } from "../../models/admin/index.js";

class PricingBackupController {
  static async createManualBackup(req, res) {
    try {
      const { reason, createdBy } = req.body;
      const backup = await PricingBackupService.createBackup({
        reason: reason || "Manual backup",
        createdBy: createdBy || "admin",
        isAutomatic: false,
      });
      res.status(201).json({
        success: true,
        message: "Backup created successfully",
        backup: {
          id: backup._id,
          version: backup.version,
          createdAt: backup.createdAt,
          reason: backup.reason,
        },
      });
    } catch (error) {
      console.error("Error creating manual backup:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  static async getBackupList(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        includeDeleted = false,
        startDate,
        endDate,
        createdBy,
        isAutomatic,
        isComplete,
      } = req.query;

      const filter = {};

      if (includeDeleted !== "true") {
        filter.isDeleted = { $ne: true };
      }

      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) {
          filter.createdAt.$gte = new Date(startDate);
        }
        if (endDate) {
          filter.createdAt.$lte = new Date(endDate);
        }
      }

      if (createdBy) {
        filter.createdBy = createdBy;
      }

      if (isAutomatic !== undefined) {
        filter.isAutomatic = isAutomatic === "true";
      }

      if (isComplete !== undefined) {
        filter.isComplete = isComplete === "true";
      }

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(Math.max(1, parseInt(limit)), 100);
      const skip = (pageNum - 1) * limitNum;

      const total = await PricingBackup.countDocuments(filter);
      const backups = await PricingBackup.find(filter)
        .select("-productPricingData -servicePricingData")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean();

      res.json({
        success: true,
        data: backups.map((b) => ({
          id: b._id,
          version: b.version,
          reason: b.reason,
          createdBy: b.createdBy,
          createdAt: b.createdAt,
          isAutomatic: b.isAutomatic,
          isComplete: b.isComplete,
          productCount: b.metadata?.productCount || 0,
          serviceCount: b.metadata?.serviceCount || 0,
          restoredAt: b.restoredAt,
          restoredBy: b.restoredBy,
        })),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
          hasNext: skip + backups.length < total,
          hasPrev: pageNum > 1,
        },
      });
    } catch (error) {
      console.error("Error getting backup list:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  static async getBackupDetails(req, res) {
    try {
      const { id } = req.params;

      const backup = await PricingBackup.findById(id).lean();

      if (!backup) {
        return res.status(404).json({
          success: false,
          error: "Backup not found",
        });
      }

      res.json({
        success: true,
        data: {
          id: backup._id,
          version: backup.version,
          reason: backup.reason,
          createdBy: backup.createdBy,
          createdAt: backup.createdAt,
          isAutomatic: backup.isAutomatic,
          isComplete: backup.isComplete,
          metadata: backup.metadata,
          productCount: backup.productPricingData?.length || 0,
          serviceCount: backup.servicePricingData?.length || 0,
          restoredAt: backup.restoredAt,
          restoredBy: backup.restoredBy,
        },
      });
    } catch (error) {
      console.error("Error getting backup details:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  static async restoreFromBackup(req, res) {
    try {
      const { id } = req.params;
      const { restoredBy, createBackupFirst = true } = req.body;

      const result = await PricingBackupService.restoreFromBackup(id, {
        restoredBy: restoredBy || "admin",
        createBackupFirst,
      });

      res.json({
        success: true,
        message: "Backup restored successfully",
        result,
      });
    } catch (error) {
      console.error("Error restoring from backup:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  static async getBackupStatistics(req, res) {
    try {
      const stats = await PricingBackupService.getBackupStatistics();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error("Error getting backup statistics:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  static async enforceRetentionPolicy(req, res) {
    try {
      const { maxBackups, maxAgeDays, dryRun = false } = req.body;

      const result = await PricingBackupService.enforceRetentionPolicy({
        maxBackups: maxBackups ? parseInt(maxBackups) : undefined,
        maxAgeDays: maxAgeDays ? parseInt(maxAgeDays) : undefined,
        dryRun: dryRun === true || dryRun === "true",
      });

      res.json({
        success: true,
        message: dryRun
          ? "Dry run completed - no backups were deleted"
          : "Retention policy enforced successfully",
        result,
      });
    } catch (error) {
      console.error("Error enforcing retention policy:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  static async deleteBackups(req, res) {
    try {
      const { ids, softDelete = true } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          success: false,
          error: "ids array is required",
        });
      }

      const results = [];

      for (const id of ids) {
        try {
          if (softDelete) {
            await PricingBackup.findByIdAndUpdate(id, {
              isDeleted: true,
              deletedAt: new Date(),
            });
          } else {
            await PricingBackup.findByIdAndDelete(id);
          }
          results.push({ id, success: true });
        } catch (err) {
          results.push({ id, success: false, error: err.message });
        }
      }

      res.json({
        success: true,
        message: `Deleted ${results.filter((r) => r.success).length} of ${ids.length} backups`,
        results,
      });
    } catch (error) {
      console.error("Error deleting backups:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  static async getBackupSnapshot(req, res) {
    try {
      const { id } = req.params;
      const { type = "all" } = req.query;

      const backup = await PricingBackup.findById(id).lean();

      if (!backup) {
        return res.status(404).json({
          success: false,
          error: "Backup not found",
        });
      }

      let data = {};

      if (type === "all" || type === "products") {
        data.products = backup.productPricingData || [];
      }

      if (type === "all" || type === "services") {
        data.services = backup.servicePricingData || [];
      }

      res.json({
        success: true,
        backupInfo: {
          id: backup._id,
          version: backup.version,
          createdAt: backup.createdAt,
        },
        data,
      });
    } catch (error) {
      console.error("Error getting backup snapshot:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  static async getBackupSystemHealth(req, res) {
    try {
      const latestBackup = await PricingBackup.findOne({ isDeleted: { $ne: true } })
        .sort({ createdAt: -1 })
        .select("createdAt version isComplete")
        .lean();

      const totalBackups = await PricingBackup.countDocuments({ isDeleted: { $ne: true } });
      const completeBackups = await PricingBackup.countDocuments({
        isDeleted: { $ne: true },
        isComplete: true,
      });

      const lastAutoBackup = await PricingBackup.findOne({
        isDeleted: { $ne: true },
        isAutomatic: true,
      })
        .sort({ createdAt: -1 })
        .select("createdAt")
        .lean();

      const health = {
        status: "healthy",
        issues: [],
      };

      if (!latestBackup) {
        health.status = "warning";
        health.issues.push("No backups found");
      } else {
        const daysSinceBackup = (Date.now() - new Date(latestBackup.createdAt)) / (1000 * 60 * 60 * 24);
        if (daysSinceBackup > 7) {
          health.status = "warning";
          health.issues.push(`Last backup is ${Math.floor(daysSinceBackup)} days old`);
        }
      }

      if (completeBackups < totalBackups) {
        health.issues.push(`${totalBackups - completeBackups} incomplete backups found`);
      }

      res.json({
        success: true,
        health,
        metrics: {
          totalBackups,
          completeBackups,
          incompleteBackups: totalBackups - completeBackups,
          latestBackup: latestBackup
            ? {
                createdAt: latestBackup.createdAt,
                version: latestBackup.version,
              }
            : null,
          lastAutoBackup: lastAutoBackup?.createdAt || null,
        },
      });
    } catch (error) {
      console.error("Error getting backup system health:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}

export default PricingBackupController;
