import express from "express";
import PricingBackupController from "../controllers/pricingBackupController.js";
// Uncomment below if you want to add admin authentication to backup endpoints
// import adminAuth from "../middleware/adminAuth.js";

const router = express.Router();

/**
 * Pricing Backup Management Routes
 *
 * These routes provide comprehensive management of pricing data backups.
 * All routes require admin authentication (uncomment adminAuth middleware as needed).
 */

/**
 * POST /api/pricing-backup/create - Manually create a backup
 * Body: { changeDescription?: string }
 * Creates a backup immediately (useful for testing or manual backup creation)
 */
router.post(
  "/create",
  // adminAuth, // Uncomment to require admin authentication
  PricingBackupController.createManualBackup
);

/**
 * GET /api/pricing-backup/list?limit=10 - Get list of available backups
 * Query: limit (optional, default 10, max 50)
 * Returns summary information about all backup change-days
 */
router.get(
  "/list",
  // adminAuth, // Uncomment to require admin authentication
  PricingBackupController.getBackupList
);

/**
 * GET /api/pricing-backup/details/:changeDayId - Get detailed backup information
 * Path: changeDayId (the unique identifier for a backup)
 * Returns comprehensive information about a specific backup
 */
router.get(
  "/details/:changeDayId",
  // adminAuth, // Uncomment to require admin authentication
  PricingBackupController.getBackupDetails
);

/**
 * POST /api/pricing-backup/restore - Restore pricing data from a backup
 * Body: { changeDayId: string, restorationNotes?: string }
 * Restores all pricing data to the state stored in the specified backup
 * WARNING: This completely replaces current pricing data!
 */
router.post(
  "/restore",
  // adminAuth, // Uncomment to require admin authentication
  PricingBackupController.restoreFromBackup
);

/**
 * GET /api/pricing-backup/statistics - Get backup system statistics
 * Returns comprehensive statistics about the backup system including
 * storage usage, backup frequency, and system health metrics
 */
router.get(
  "/statistics",
  // adminAuth, // Uncomment to require admin authentication
  PricingBackupController.getBackupStatistics
);

/**
 * POST /api/pricing-backup/enforce-retention - Manually enforce retention policy
 * Forces the retention policy to run, removing old backups beyond the 10 change-day limit
 */
router.post(
  "/enforce-retention",
  // adminAuth, // Uncomment to require admin authentication
  PricingBackupController.enforceRetentionPolicy
);

/**
 * DELETE /api/pricing-backup/delete - Delete specific backups
 * Body: { changeDayIds: string[] }
 * Deletes the specified backups (use with caution!)
 */
router.delete(
  "/delete",
  // adminAuth, // Uncomment to require admin authentication
  PricingBackupController.deleteBackups
);

/**
 * GET /api/pricing-backup/snapshot/:changeDayId?preview=true - Get backup snapshot data
 * Path: changeDayId
 * Query: preview (optional, default true) - if true, returns summarized data; if false, returns full snapshot
 * Use for previewing backup contents before restoration
 */
router.get(
  "/snapshot/:changeDayId",
  // adminAuth, // Uncomment to require admin authentication
  PricingBackupController.getBackupSnapshot
);

/**
 * GET /api/pricing-backup/health - Health check for backup system
 * Returns health status and basic system checks
 */
router.get(
  "/health",
  PricingBackupController.getBackupSystemHealth
);

export default router;