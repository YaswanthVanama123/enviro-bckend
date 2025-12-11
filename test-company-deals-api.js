#!/usr/bin/env node

// test-company-deals-api.js - Test the new company deals API function

import dotenv from 'dotenv';
import { getBiginDealsByCompany } from './src/services/zohoService.js';

// Load environment variables
dotenv.config();

async function testCompanyDealsAPI() {
  console.log('🧪 [COMPANY-DEALS-TEST] Testing new company deals API...');

  // Debug: Check if credentials are loaded
  console.log('🔍 [COMPANY-DEALS-TEST] Checking OAuth credentials...');
  console.log(`  ├ Client ID: ${process.env.ZOHO_CLIENT_ID ? '✅ Present' : '❌ Missing'}`);
  console.log(`  ├ Client Secret: ${process.env.ZOHO_CLIENT_SECRET ? '✅ Present' : '❌ Missing'}`);
  console.log(`  └ Refresh Token: ${process.env.ZOHO_REFRESH_TOKEN ? '✅ Present' : '❌ Missing'}`);

  try {
    // Test with a sample company ID (use the one from your test files)
    const testCompanyId = '1157694000000428610';

    console.log('\n🚀 [COMPANY-DEALS-TEST] Fetching deals for company:', testCompanyId);

    const result = await getBiginDealsByCompany(testCompanyId, 1, 10);

    console.log('\n📋 [COMPANY-DEALS-TEST] Result:', JSON.stringify(result, null, 2));

    if (result.success) {
      console.log('\n✅ [COMPANY-DEALS-TEST] SUCCESS! Company deals API works!');
      console.log(`🎯 [COMPANY-DEALS-TEST] Found ${result.deals.length} deals for company ${testCompanyId}`);

      if (result.deals.length > 0) {
        console.log('📋 [COMPANY-DEALS-TEST] Sample deal:');
        console.log(`  ├ Name: ${result.deals[0].name}`);
        console.log(`  ├ Stage: ${result.deals[0].stage}`);
        console.log(`  ├ Amount: $${result.deals[0].amount}`);
        console.log(`  └ ID: ${result.deals[0].id}`);
      }
    } else {
      console.log('\n❌ [COMPANY-DEALS-TEST] API call failed:', result.error);

      // Check for specific OAuth errors
      if (result.error === 'ZOHO_AUTH_REQUIRED') {
        console.log('🔧 [COMPANY-DEALS-TEST] OAuth setup needed - regenerate refresh token');
      } else if (result.error?.includes('credentials') || result.error?.includes('token')) {
        console.log('🔧 [COMPANY-DEALS-TEST] OAuth authentication failed - check refresh token');
      }
    }

  } catch (error) {
    console.error('❌ [COMPANY-DEALS-TEST] Test error:', error.message);
    if (error.message === 'Zoho integration not configured. Administrator needs to set up OAuth credentials.') {
      console.log('🔧 [COMPANY-DEALS-TEST] OAuth needs to be configured first');
    }
  }
}

// Run the test
testCompanyDealsAPI();