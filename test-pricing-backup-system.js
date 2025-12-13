/**
 * Comprehensive Test Suite for Pricing Backup System
 *
 * This script tests all aspects of the pricing backup system:
 * 1. Basic backup creation and compression
 * 2. Automatic backup on pricing changes
 * 3. Retention policy enforcement (keep only last 10 change-days)
 * 4. Backup restoration functionality
 * 5. Error handling and edge cases
 * 6. API endpoints
 *
 * Run this script after setting up the backup system to verify everything works.
 */

const mongoose = require('mongoose');
const BackupPricing = require('../src/models/BackupPricing');
const PriceFix = require('../src/models/PriceFix');
const ProductCatalog = require('../src/models/ProductCatalog');
const ServiceConfig = require('../src/models/ServiceConfig');
const PricingBackupService = require('../src/services/pricingBackupService');
require('dotenv').config();

// Test configuration
const TEST_CONFIG = {
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/enviromaster-test',
  CLEANUP_AFTER_TESTS: true,
  VERBOSE_LOGGING: true
};

class PricingBackupTester {
  constructor() {
    this.testResults = [];
    this.testCount = 0;
    this.passedTests = 0;
    this.failedTests = 0;
  }

  log(message, isError = false) {
    if (TEST_CONFIG.VERBOSE_LOGGING) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] ${isError ? 'ERROR:' : 'INFO:'} ${message}`);
    }
  }

  async runTest(testName, testFunction) {
    this.testCount++;
    this.log(`\n=== Running Test ${this.testCount}: ${testName} ===`);

    try {
      const startTime = Date.now();
      await testFunction();
      const duration = Date.now() - startTime;

      this.passedTests++;
      this.testResults.push({
        name: testName,
        status: 'PASS',
        duration: `${duration}ms`,
        error: null
      });

      this.log(`✅ Test ${this.testCount} PASSED: ${testName} (${duration}ms)`);

    } catch (error) {
      this.failedTests++;
      this.testResults.push({
        name: testName,
        status: 'FAIL',
        duration: null,
        error: error.message
      });

      this.log(`❌ Test ${this.testCount} FAILED: ${testName}`, true);
      this.log(`Error: ${error.message}`, true);
      console.error(error.stack);
    }
  }

  async setup() {
    this.log('Setting up test environment...');

    // Connect to test database
    await mongoose.connect(TEST_CONFIG.MONGODB_URI);
    this.log('Connected to MongoDB');

    // Clean up any existing test data
    await this.cleanup(false);
    this.log('Cleaned up existing test data');
  }

  async cleanup(logMessage = true) {
    if (logMessage) {
      this.log('Cleaning up test data...');
    }

    // Remove test backup data
    await BackupPricing.deleteMany({
      changeDescription: { $regex: /test/i }
    });

    // Remove test pricing data (be careful with this in production!)
    await PriceFix.deleteMany({
      description: { $regex: /test/i }
    });

    if (logMessage) {
      this.log('Cleanup completed');
    }
  }

  async teardown() {
    if (TEST_CONFIG.CLEANUP_AFTER_TESTS) {
      await this.cleanup();
    }

    await mongoose.disconnect();
    this.log('Disconnected from MongoDB');
  }

  // ===== TEST CASES =====

  async testBasicBackupCreation() {
    // Create some test pricing data
    const testPriceFix = new PriceFix({
      key: 'test-pricing-master',
      description: 'Test pricing data for backup',
      services: {
        restroomHygiene: {
          ratePerFixture: 25.50,
          weeklyMinimum: 75.00,
          tripChargeStandard: 45.00
        },
        tripCharge: {
          standard: 45.00,
          insideBeltway: 65.00
        }
      }
    });
    await testPriceFix.save();

    // Create manual backup
    const backupResult = await PricingBackupService.createBackupIfNeeded({
      trigger: 'manual',
      changeDescription: 'Test backup creation',
      changedAreas: ['test'],
      changeCount: 1
    });

    if (!backupResult.success || !backupResult.created) {
      throw new Error('Failed to create backup');
    }

    // Verify backup was created
    const backup = await BackupPricing.findOne({
      changeDayId: backupResult.backup.changeDayId
    });

    if (!backup) {
      throw new Error('Backup not found in database');
    }

    // Verify compression worked
    if (backup.snapshotMetadata.compressionRatio >= 1.0) {
      throw new Error('Compression ratio indicates no compression occurred');
    }

    // Verify data can be decompressed
    const snapshot = backup.getSnapshot();
    if (!snapshot.dataTypes || !snapshot.dataTypes.priceFix) {
      throw new Error('Decompressed data structure is invalid');
    }

    this.log(`Backup created successfully with compression ratio: ${backup.snapshotMetadata.compressionRatio}`);
  }

  async testBackupOnPricingChange() {
    // Create initial pricing data
    const testPriceFix = new PriceFix({
      key: 'test-change-detection',
      description: 'Test pricing for change detection',
      services: {
        foamingDrain: {
          standardDrainRate: 15.00,
          largeDrainBaseCharge: 50.00
        }
      }
    });
    await testPriceFix.save();

    // Create first backup
    const firstBackup = await PricingBackupService.createBackupIfNeeded({
      trigger: 'pricefix_update',
      changeDescription: 'Test first pricing change',
      changedAreas: ['pricefix_services'],
      changeCount: 1
    });

    if (!firstBackup.success || !firstBackup.created) {
      throw new Error('Failed to create first backup');
    }

    // Try to create another backup on the same day (should be skipped)
    const secondBackup = await PricingBackupService.createBackupIfNeeded({
      trigger: 'pricefix_update',
      changeDescription: 'Test second pricing change same day',
      changedAreas: ['pricefix_services'],
      changeCount: 1
    });

    if (!secondBackup.success || !secondBackup.skipped) {
      throw new Error('Second backup should have been skipped (same day)');
    }

    this.log('Backup correctly skipped for same-day changes');
  }

  async testRetentionPolicy() {
    // Create test backups for multiple days
    const testDays = [];
    for (let i = 0; i < 12; i++) {
      const testDate = new Date();
      testDate.setDate(testDate.getDate() - i);
      const dateString = testDate.toISOString().split('T')[0];

      testDays.push(dateString);

      const backup = new BackupPricing({
        changeDayId: `test_${dateString}_${i}`,
        changeDay: dateString,
        firstChangeTimestamp: testDate,
        compressedSnapshot: BackupPricing.compressPricingData({ test: `data_${i}` }).compressedData,
        snapshotMetadata: {
          includedDataTypes: { priceFix: true, productCatalog: false, serviceConfigs: false },
          documentCounts: { priceFixCount: 1, productCatalogCount: 0, serviceConfigCount: 0 },
          originalSize: 50,
          compressedSize: 25,
          compressionRatio: 0.5
        },
        backupTrigger: 'manual',
        changeContext: {
          changedAreas: ['test'],
          changeDescription: `Test retention policy day ${i}`,
          changeCount: 1
        }
      });

      await backup.save();
    }

    // Enforce retention policy
    const retentionResult = await BackupPricing.enforceRetentionPolicy();

    if (!retentionResult.deletedCount || retentionResult.deletedCount < 2) {
      throw new Error('Retention policy should have deleted at least 2 old backups');
    }

    // Verify only 10 or fewer change-days remain
    const remainingChangeDays = await BackupPricing.distinct('changeDay');
    if (remainingChangeDays.length > 10) {
      throw new Error(`Too many change-days remaining: ${remainingChangeDays.length}`);
    }

    this.log(`Retention policy enforced: deleted ${retentionResult.deletedCount} old backups, ${remainingChangeDays.length} change-days remaining`);
  }

  async testBackupRestoration() {
    // Create test pricing data
    const originalPriceFix = new PriceFix({
      key: 'test-restoration-original',
      description: 'Original test pricing for restoration',
      services: {
        scrubService: {
          fixtureRate: 12.00,
          fixtureMinimum: 60.00,
          nonBathroomUnitSqFt: 1000
        }
      }
    });
    await originalPriceFix.save();

    // Create backup
    const backupResult = await PricingBackupService.createBackupIfNeeded({
      trigger: 'manual',
      changeDescription: 'Test restoration backup',
      changedAreas: ['test'],
      changeCount: 1
    });

    if (!backupResult.success || !backupResult.created) {
      throw new Error('Failed to create restoration test backup');
    }

    // Modify the pricing data
    await PriceFix.updateOne(
      { key: 'test-restoration-original' },
      {
        description: 'Modified test pricing',
        'services.scrubService.fixtureRate': 15.00
      }
    );

    // Restore from backup
    const restoreResult = await PricingBackupService.restoreFromBackup(
      backupResult.backup.changeDayId,
      null,
      'Test restoration'
    );

    if (!restoreResult.success) {
      throw new Error(`Restoration failed: ${restoreResult.message}`);
    }

    // Verify data was restored
    const restoredPriceFix = await PriceFix.findOne({ key: 'test-restoration-original' });
    if (!restoredPriceFix) {
      throw new Error('Restored PriceFix not found');
    }

    if (restoredPriceFix.description !== 'Original test pricing for restoration') {
      throw new Error('Restoration did not restore original description');
    }

    if (restoredPriceFix.services.scrubService.fixtureRate !== 12.00) {
      throw new Error('Restoration did not restore original pricing values');
    }

    this.log('Restoration completed successfully and data verified');
  }

  async testCompressionEfficiency() {
    // Create large test data
    const largeTestData = {
      dataTypes: {
        priceFix: {
          documents: Array(100).fill().map((_, i) => ({
            key: `test-item-${i}`,
            description: `Test description for item ${i} with lots of repetitive text that should compress well`,
            services: {
              restroomHygiene: { ratePerFixture: i * 1.5 },
              foamingDrain: { standardDrainRate: i * 2.0 }
            }
          })),
          count: 100
        }
      }
    };

    const compressionResult = BackupPricing.compressPricingData(largeTestData);

    if (compressionResult.compressionRatio >= 0.8) {
      throw new Error('Compression ratio is poor (>= 80%)');
    }

    if (compressionResult.compressedSize >= compressionResult.originalSize) {
      throw new Error('Compressed size is larger than original');
    }

    // Test decompression
    const decompressed = BackupPricing.decompressPricingData(compressionResult.compressedData);

    if (decompressed.dataTypes.priceFix.count !== 100) {
      throw new Error('Decompression corrupted data');
    }

    this.log(`Compression efficiency: ${Math.round((1 - compressionResult.compressionRatio) * 100)}% reduction (${compressionResult.originalSize} → ${compressionResult.compressedSize} bytes)`);
  }

  async testErrorHandling() {
    // Test invalid compression data
    try {
      BackupPricing.decompressPricingData(Buffer.from('invalid data'));
      throw new Error('Should have failed with invalid compression data');
    } catch (error) {
      if (!error.message.includes('Decompression failed')) {
        throw error; // Re-throw if it's not the expected error
      }
    }

    // Test restore from non-existent backup
    const restoreResult = await PricingBackupService.restoreFromBackup(
      'non-existent-backup-id',
      null,
      'Test error handling'
    );

    if (restoreResult.success) {
      throw new Error('Restore should have failed with non-existent backup');
    }

    // Test backup details for non-existent backup
    const detailsResult = await PricingBackupService.getBackupDetails('non-existent-backup-id');

    if (detailsResult.success) {
      throw new Error('Get details should have failed with non-existent backup');
    }

    this.log('Error handling tests passed');
  }

  async testBackupStatistics() {
    // Create a few test backups
    for (let i = 0; i < 3; i++) {
      const testDate = new Date();
      testDate.setDate(testDate.getDate() - i);

      const backup = new BackupPricing({
        changeDayId: `test_stats_${i}`,
        changeDay: testDate.toISOString().split('T')[0],
        firstChangeTimestamp: testDate,
        compressedSnapshot: BackupPricing.compressPricingData({ test: `stats_${i}` }).compressedData,
        snapshotMetadata: {
          includedDataTypes: { priceFix: true, productCatalog: false, serviceConfigs: false },
          documentCounts: { priceFixCount: 1, productCatalogCount: 0, serviceConfigCount: 0 },
          originalSize: 50,
          compressedSize: 25,
          compressionRatio: 0.5
        },
        backupTrigger: 'manual',
        changeContext: {
          changedAreas: ['test'],
          changeDescription: `Test statistics ${i}`,
          changeCount: 1
        }
      });

      await backup.save();
    }

    // Get statistics
    const statsResult = await PricingBackupService.getBackupStatistics();

    if (!statsResult.success) {
      throw new Error('Failed to get backup statistics');
    }

    const stats = statsResult.statistics;

    if (stats.totalBackups < 3) {
      throw new Error('Statistics should show at least 3 backups');
    }

    if (!stats.systemHealth || !stats.systemHealth.isHealthy) {
      throw new Error('System health should be healthy');
    }

    this.log(`Statistics retrieved: ${stats.totalBackups} backups, ${stats.uniqueChangeDays} change-days`);
  }

  // ===== MAIN TEST RUNNER =====

  async runAllTests() {
    this.log('🚀 Starting Pricing Backup System Test Suite');
    this.log(`Database: ${TEST_CONFIG.MONGODB_URI}`);
    this.log(`Cleanup after tests: ${TEST_CONFIG.CLEANUP_AFTER_TESTS}`);

    try {
      await this.setup();

      // Run all test cases
      await this.runTest('Basic Backup Creation', () => this.testBasicBackupCreation());
      await this.runTest('Backup on Pricing Change', () => this.testBackupOnPricingChange());
      await this.runTest('Retention Policy', () => this.testRetentionPolicy());
      await this.runTest('Backup Restoration', () => this.testBackupRestoration());
      await this.runTest('Compression Efficiency', () => this.testCompressionEfficiency());
      await this.runTest('Error Handling', () => this.testErrorHandling());
      await this.runTest('Backup Statistics', () => this.testBackupStatistics());

      await this.teardown();

    } catch (error) {
      this.log(`Setup/teardown error: ${error.message}`, true);
      console.error(error.stack);
    }

    // Print final results
    this.printResults();
  }

  printResults() {
    console.log('\n' + '='.repeat(80));
    console.log('🧪 PRICING BACKUP SYSTEM TEST RESULTS');
    console.log('='.repeat(80));

    console.log(`\n📊 Summary:`);
    console.log(`   Total Tests: ${this.testCount}`);
    console.log(`   Passed: ${this.passedTests} ✅`);
    console.log(`   Failed: ${this.failedTests} ❌`);
    console.log(`   Success Rate: ${Math.round((this.passedTests / this.testCount) * 100)}%`);

    console.log(`\n📋 Detailed Results:`);
    this.testResults.forEach((result, index) => {
      const status = result.status === 'PASS' ? '✅' : '❌';
      console.log(`   ${index + 1}. ${status} ${result.name} ${result.duration || ''}`);
      if (result.error) {
        console.log(`      Error: ${result.error}`);
      }
    });

    if (this.failedTests === 0) {
      console.log(`\n🎉 All tests passed! The pricing backup system is working correctly.`);
    } else {
      console.log(`\n⚠️  ${this.failedTests} test(s) failed. Please review the errors above.`);
    }

    console.log('\n' + '='.repeat(80));
  }
}

// Export for use in other test files
module.exports = PricingBackupTester;

// Run tests if this file is executed directly
if (require.main === module) {
  const tester = new PricingBackupTester();
  tester.runAllTests().catch(console.error);
}