import PricingBackupService from '../services/pricingBackupService.js';

/**
 * Middleware to create pricing backups before changes are applied
 * This middleware should be used before pricing update operations
 */
class PricingChangeDetector {

  /**
   * Middleware for PriceFix updates
   * Triggers backup before PriceFix changes are applied
   */
  static async beforePriceFixUpdate(req, res, next) {
    try {
      // Extract admin user from request (assuming authentication middleware sets req.user)
      const changedBy = req.user ? req.user._id : null;
      const adminUsername = req.user ? req.user.username : 'Unknown';

      // Determine which pricing areas are being changed based on request body
      const changedAreas = PricingChangeDetector.detectPriceFixChangedAreas(req.body);

      // Create change description
      const changeDescription = `PriceFix update by ${adminUsername}: ${changedAreas.join(', ')}`;

      console.log(`[Pricing Backup] Triggering backup before PriceFix update by ${adminUsername}`);

      // Create backup if needed (only once per day)
      const backupResult = await PricingBackupService.createBackupIfNeeded({
        trigger: 'pricefix_update',
        changedBy,
        changedAreas,
        changeDescription,
        changeCount: Object.keys(req.body).length
      });

      // Log the backup result
      if (backupResult.success) {
        if (backupResult.created) {
          console.log(`[Pricing Backup] Backup created: ${backupResult.backup.changeDayId}`);
          req.pricingBackupCreated = true;
          req.pricingBackupId = backupResult.backup.changeDayId;
        } else if (backupResult.skipped) {
          console.log(`[Pricing Backup] Backup skipped: ${backupResult.message}`);
          req.pricingBackupSkipped = true;
        }
      } else {
        console.error(`[Pricing Backup] Backup failed: ${backupResult.message}`);
        req.pricingBackupError = backupResult.error;
      }

      // Continue to the actual update operation
      next();

    } catch (error) {
      console.error('[Pricing Backup] Middleware error:', error);
      // Don't block the update operation if backup fails
      req.pricingBackupError = error.message;
      next();
    }
  }

  /**
   * Middleware for ProductCatalog updates
   * Triggers backup before ProductCatalog changes are applied
   */
  static async beforeProductCatalogUpdate(req, res, next) {
    try {
      const changedBy = req.user ? req.user._id : null;
      const adminUsername = req.user ? req.user.username : 'Unknown';

      // Determine update type (full replacement vs partial)
      const isPartialUpdate = req.route.path.includes('/partial');
      const changedAreas = PricingChangeDetector.detectProductCatalogChangedAreas(req.body, isPartialUpdate);

      const changeDescription = `ProductCatalog ${isPartialUpdate ? 'partial' : 'full'} update by ${adminUsername}: ${changedAreas.join(', ')}`;

      console.log(`[Pricing Backup] *** PRODUCT CATALOG UPDATE DETECTED ***`);
      console.log(`[Pricing Backup] Route: ${req.method} ${req.route.path}`);
      console.log(`[Pricing Backup] Admin: ${adminUsername}`);
      console.log(`[Pricing Backup] Request body keys: ${Object.keys(req.body).join(', ')}`);
      console.log(`[Pricing Backup] Triggering backup before ProductCatalog update by ${adminUsername}`);

      const backupResult = await PricingBackupService.createBackupIfNeeded({
        trigger: 'product_catalog_update',
        changedBy,
        changedAreas,
        changeDescription,
        changeCount: PricingChangeDetector.countProductCatalogChanges(req.body, isPartialUpdate)
      });

      // Log backup result
      if (backupResult.success) {
        if (backupResult.created) {
          console.log(`[Pricing Backup] Backup created: ${backupResult.backup.changeDayId}`);
          req.pricingBackupCreated = true;
          req.pricingBackupId = backupResult.backup.changeDayId;
        } else if (backupResult.skipped) {
          console.log(`[Pricing Backup] Backup skipped: ${backupResult.message}`);
          req.pricingBackupSkipped = true;
        }
      } else {
        console.error(`[Pricing Backup] Backup failed: ${backupResult.message}`);
        req.pricingBackupError = backupResult.error;
      }

      next();

    } catch (error) {
      console.error('[Pricing Backup] Middleware error:', error);
      req.pricingBackupError = error.message;
      next();
    }
  }

  /**
   * Middleware for ServiceConfig updates
   * Triggers backup before ServiceConfig changes are applied
   */
  static async beforeServiceConfigUpdate(req, res, next) {
    try {
      const changedBy = req.user ? req.user._id : null;
      const adminUsername = req.user ? req.user.username : 'Unknown';

      // Determine which service is being updated
      const serviceId = req.body.serviceId || req.params.serviceId || 'unknown';
      const isPartialUpdate = req.route.path.includes('/partial');
      const changedAreas = PricingChangeDetector.detectServiceConfigChangedAreas(serviceId, req.body, isPartialUpdate);

      const changeDescription = `ServiceConfig ${isPartialUpdate ? 'partial' : 'full'} update for ${serviceId} by ${adminUsername}`;

      console.log(`[Pricing Backup] Triggering backup before ServiceConfig update by ${adminUsername}`);

      const backupResult = await PricingBackupService.createBackupIfNeeded({
        trigger: 'service_config_update',
        changedBy,
        changedAreas,
        changeDescription,
        changeCount: Object.keys(req.body).length
      });

      // Log backup result
      if (backupResult.success) {
        if (backupResult.created) {
          console.log(`[Pricing Backup] Backup created: ${backupResult.backup.changeDayId}`);
          req.pricingBackupCreated = true;
          req.pricingBackupId = backupResult.backup.changeDayId;
        } else if (backupResult.skipped) {
          console.log(`[Pricing Backup] Backup skipped: ${backupResult.message}`);
          req.pricingBackupSkipped = true;
        }
      } else {
        console.error(`[Pricing Backup] Backup failed: ${backupResult.message}`);
        req.pricingBackupError = backupResult.error;
      }

      next();

    } catch (error) {
      console.error('[Pricing Backup] Middleware error:', error);
      req.pricingBackupError = error.message;
      next();
    }
  }

  /**
   * Detect which PriceFix areas are being changed
   * @param {Object} requestBody - The update request body
   * @returns {Array} Array of changed area identifiers
   */
  static detectPriceFixChangedAreas(requestBody) {
    const changedAreas = [];

    if (!requestBody.services) {
      return ['other']; // Use 'other' instead of 'pricefix_general' - it's a valid enum value
    }

    const services = requestBody.services;

    // Check each service type for changes
    if (services.restroomHygiene) changedAreas.push('pricefix_services');
    if (services.foamingDrain) changedAreas.push('pricefix_services');
    if (services.scrubService) changedAreas.push('pricefix_services');
    if (services.handSanitizer) changedAreas.push('pricefix_services');
    if (services.micromaxFloor) changedAreas.push('pricefix_services');
    if (services.rpmWindow) changedAreas.push('pricefix_services');
    if (services.saniPod) changedAreas.push('pricefix_services');
    if (services.tripCharge) changedAreas.push('pricefix_tripcharge');

    return changedAreas.length > 0 ? changedAreas : ['pricefix_services'];
  }

  /**
   * Detect which ProductCatalog areas are being changed
   * @param {Object} requestBody - The update request body
   * @param {boolean} isPartialUpdate - Whether this is a partial update
   * @returns {Array} Array of changed area identifiers
   */
  static detectProductCatalogChangedAreas(requestBody, isPartialUpdate) {
    const changedAreas = [];

    if (requestBody.families) {
      if (Array.isArray(requestBody.families)) {
        requestBody.families.forEach(family => {
          if (family.products) {
            changedAreas.push('product_catalog_products');
          }
        });
      }
      changedAreas.push('product_catalog_families');
    }

    // For partial updates, look for specific family changes
    if (isPartialUpdate) {
      Object.keys(requestBody).forEach(key => {
        if (key !== 'families' && key !== 'version' && key !== 'lastUpdated') {
          changedAreas.push('product_catalog_products');
        }
      });
    }

    return changedAreas.length > 0 ? changedAreas : ['product_catalog_families'];
  }

  /**
   * Detect which ServiceConfig areas are being changed
   * @param {string} serviceId - The service being updated
   * @param {Object} requestBody - The update request body
   * @param {boolean} isPartialUpdate - Whether this is a partial update
   * @returns {Array} Array of changed area identifiers
   */
  static detectServiceConfigChangedAreas(serviceId, requestBody, isPartialUpdate) {
    const serviceMapping = {
      'saniclean': 'service_config_saniclean',
      'foamingdrain': 'service_config_foamingdrain',
      'scrubservice': 'service_config_scrubservice',
      'saniscrub': 'service_config_scrubservice',
      'handsanitizer': 'service_config_handsanitizer',
      'micromaxfloor': 'service_config_micromaxfloor',
      'microfibermopping': 'service_config_micromaxfloor',
      'rpmwindow': 'service_config_rpmwindow',
      'rpmwindows': 'service_config_rpmwindow',
      'sanipod': 'service_config_sanipod'
    };

    const mappedService = serviceMapping[serviceId.toLowerCase()] || 'service_config_custom';
    return [mappedService];
  }

  /**
   * Count the number of changes in a ProductCatalog update
   * @param {Object} requestBody - The update request body
   * @param {boolean} isPartialUpdate - Whether this is a partial update
   * @returns {number} Number of changes
   */
  static countProductCatalogChanges(requestBody, isPartialUpdate) {
    let changeCount = 0;

    if (requestBody.families && Array.isArray(requestBody.families)) {
      requestBody.families.forEach(family => {
        if (family.products && Array.isArray(family.products)) {
          changeCount += family.products.length;
        } else {
          changeCount += 1; // Family-level change
        }
      });
    }

    // For partial updates, count top-level changes
    if (isPartialUpdate) {
      changeCount += Object.keys(requestBody).length;
    }

    return Math.max(changeCount, 1);
  }

  /**
   * Response middleware to add backup information to API responses
   * Use this after successful pricing updates to inform clients about backup status
   */
  static addBackupInfoToResponse(req, res, next) {
    // Store original json method
    const originalJson = res.json;

    // Override json method to add backup info
    res.json = function(body) {
      // Add backup information if available
      if (req.pricingBackupCreated || req.pricingBackupSkipped || req.pricingBackupError) {
        body.pricingBackup = {
          backupCreated: req.pricingBackupCreated || false,
          backupSkipped: req.pricingBackupSkipped || false,
          backupId: req.pricingBackupId || null,
          backupError: req.pricingBackupError || null
        };
      }

      // Call original json method
      originalJson.call(this, body);
    };

    next();
  }
}

export default PricingChangeDetector;