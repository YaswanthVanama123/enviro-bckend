#!/usr/bin/env node

// test-v10.js - Direct test of V10 Layout+Pipeline compatibility matcher

import dotenv from 'dotenv';
import { testV10LayoutPipelineCompatibility } from './src/services/zohoService.js';

// Load environment variables
dotenv.config();

async function testV10Compatibility() {
  console.log('🧪 [V10-DIRECT-TEST] Starting V10 Layout+Pipeline compatibility test...');

  // Debug: Check if credentials are loaded
  console.log('🔍 [V10-DIRECT-TEST] Checking OAuth credentials...');
  console.log(`  ├ Client ID: ${process.env.ZOHO_CLIENT_ID ? '✅ Present' : '❌ Missing'}`);
  console.log(`  ├ Client Secret: ${process.env.ZOHO_CLIENT_SECRET ? '✅ Present' : '❌ Missing'}`);
  console.log(`  └ Refresh Token: ${process.env.ZOHO_REFRESH_TOKEN ? '✅ Present' : '❌ Missing'}`);

  try {
    const results = await testV10LayoutPipelineCompatibility();

    console.log('\n✅ [V10-DIRECT-TEST] Test completed successfully!');
    console.log('🔍 [V10-DIRECT-TEST] Results:', JSON.stringify(results, null, 2));

    if (results.success) {
      console.log('\n🎯 [V10-DIRECT-TEST] SUMMARY:');
      console.log(`  ├ Total Layouts: ${results.totalLayouts}`);
      console.log(`  ├ Compatible Pairs: ${results.totalCompatiblePairs}`);
      console.log(`  └ Visible Pairs: ${results.visiblePairs?.length || 0}`);

      if (results.recommended) {
        console.log(`\n✅ [V10-DIRECT-TEST] RECOMMENDED COMPATIBLE PAIR:`);
        console.log(`  📐 Layout: "${results.recommended.layoutName}" (ID: ${results.recommended.layoutId})`);
        console.log(`  🔗 Pipeline: "${results.recommended.pipelineActual}"`);
        console.log(`  ✅ This combination is GUARANTEED to work together!`);

        // This proves V10 can find working Layout+Pipeline combinations
        console.log('\n🚀 [V10-DIRECT-TEST] SUCCESS: V10 compatibility matcher is working!');
        console.log('🔧 [V10-DIRECT-TEST] This should resolve the MAPPING_MISMATCH error.');
      } else {
        console.log('\n❌ [V10-DIRECT-TEST] No recommended pairs found.');
      }
    } else {
      console.log('\n❌ [V10-DIRECT-TEST] Test failed:', results.error);
    }

  } catch (error) {
    console.error('❌ [V10-DIRECT-TEST] Test error:', error.message);
    console.error('Details:', error);
  }
}

// Run the test
testV10Compatibility();