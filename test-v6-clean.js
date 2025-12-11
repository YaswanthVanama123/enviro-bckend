#!/usr/bin/env node

// test-v6-clean.js - Test V6 clean approach (no Pipeline field)

import dotenv from 'dotenv';
import { createBiginDeal } from './src/services/zohoService.js';

// Load environment variables
dotenv.config();

async function testV6CleanDeal() {
  console.log('🧪 [V6-CLEAN-TEST] Testing V6 clean deal creation (no Pipeline)...');

  // Debug: Check if credentials are loaded
  console.log('🔍 [V6-CLEAN-TEST] Checking OAuth credentials...');
  console.log(`  ├ Client ID: ${process.env.ZOHO_CLIENT_ID ? '✅ Present' : '❌ Missing'}`);
  console.log(`  ├ Client Secret: ${process.env.ZOHO_CLIENT_SECRET ? '✅ Present' : '❌ Missing'}`);
  console.log(`  └ Refresh Token: ${process.env.ZOHO_REFRESH_TOKEN ? '✅ Present' : '❌ Missing'}`);

  try {
    const testDealData = {
      dealName: 'V6-CLEAN-TEST - EnviroMaster Services',
      companyId: '1157694000000428610', // Use your company ID
      companyName: 'Sample Company',
      stage: 'Proposal/Price Quote', // Correct stage value
      amount: 1500,
      description: 'V6 Clean Test - No Pipeline field should be sent'
    };

    console.log('\n🚀 [V6-CLEAN-TEST] Creating deal with V6 clean approach...');
    console.log('🔍 [V6-CLEAN-TEST] Deal data:', testDealData);

    const result = await createBiginDeal(testDealData);

    console.log('\n📋 [V6-CLEAN-TEST] Result:', JSON.stringify(result, null, 2));

    if (result.success) {
      console.log('\n✅ [V6-CLEAN-TEST] SUCCESS! V6 clean approach works!');
      console.log('🎯 [V6-CLEAN-TEST] Deal created without Pipeline field');
      console.log('🔧 [V6-CLEAN-TEST] This should resolve the MAPPING_MISMATCH error');
      console.log(`📋 [V6-CLEAN-TEST] Deal ID: ${result.deal.id}`);
    } else {
      console.log('\n❌ [V6-CLEAN-TEST] Deal creation failed:', result.error);

      // Check if it's still a MAPPING_MISMATCH error
      if (result.error?.message?.includes('MAPPING_MISMATCH')) {
        console.log('🚨 [V6-CLEAN-TEST] Still getting MAPPING_MISMATCH - Pipeline might still be in payload!');
      } else {
        console.log('🔍 [V6-CLEAN-TEST] Different error - V6 approach may be working but hit other issue');
      }
    }

  } catch (error) {
    console.error('❌ [V6-CLEAN-TEST] Test error:', error.message);
    console.error('Details:', error);
  }
}

// Run the test
testV6CleanDeal();