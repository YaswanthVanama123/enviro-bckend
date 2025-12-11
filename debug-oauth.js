#!/usr/bin/env node

// debug-oauth.js - Debug OAuth refresh token issue

import dotenv from 'dotenv';
import axios from 'axios';

// Load environment variables
dotenv.config();

async function debugOAuthIssue() {
  console.log('🔍 [OAUTH-DEBUG] Debugging refresh token issue...');

  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
  const accountsUrl = process.env.ZOHO_ACCOUNTS_URL || "https://accounts.zoho.in";

  console.log('🔍 [OAUTH-DEBUG] Environment check:');
  console.log(`  ├ Client ID: ${clientId ? '✅ Present' : '❌ Missing'} (${clientId?.substring(0, 20)}...)`);
  console.log(`  ├ Client Secret: ${clientSecret ? '✅ Present' : '❌ Missing'} (${clientSecret?.substring(0, 20)}...)`);
  console.log(`  ├ Refresh Token: ${refreshToken ? '✅ Present' : '❌ Missing'} (${refreshToken?.substring(0, 30)}...)`);
  console.log(`  └ Accounts URL: ${accountsUrl}`);

  if (!clientId || !clientSecret || !refreshToken) {
    console.log('❌ [OAUTH-DEBUG] Missing credentials - OAuth setup needed');
    return;
  }

  console.log('\n🔄 [OAUTH-DEBUG] Attempting refresh token exchange...');

  try {
    const response = await axios.post(
      `${accountsUrl}/oauth/v2/token`,
      null,
      {
        params: {
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "refresh_token",
        },
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 10000
      }
    );

    console.log('✅ [OAUTH-DEBUG] Refresh token SUCCESS!');
    console.log('📋 [OAUTH-DEBUG] Response:', JSON.stringify(response.data, null, 2));
    console.log('\n🎯 [OAUTH-DEBUG] The refresh token WORKS! Issue must be elsewhere.');

  } catch (error) {
    console.log('❌ [OAUTH-DEBUG] Refresh token FAILED!');
    console.log('📋 [OAUTH-DEBUG] Error details:');

    if (error.response) {
      console.log(`  ├ Status: ${error.response.status}`);
      console.log(`  ├ Status Text: ${error.response.statusText}`);
      console.log(`  └ Error Data:`, JSON.stringify(error.response.data, null, 2));
    } else {
      console.log(`  └ Network Error:`, error.message);
    }

    // Common OAuth errors and solutions
    if (error.response?.data?.error === 'invalid_grant') {
      console.log('\n💡 [OAUTH-DEBUG] SOLUTION: invalid_grant error');
      console.log('  → Refresh token is expired or revoked');
      console.log('  → You need to generate a NEW refresh token via OAuth flow');
      console.log('  → Visit: http://localhost:5000/oauth/zoho/auth');
    } else if (error.response?.data?.error === 'invalid_client') {
      console.log('\n💡 [OAUTH-DEBUG] SOLUTION: invalid_client error');
      console.log('  → Client ID or Client Secret is wrong');
      console.log('  → Check your Zoho API Console settings');
    } else if (error.response?.status === 400) {
      console.log('\n💡 [OAUTH-DEBUG] SOLUTION: Bad request');
      console.log('  → Check if all OAuth parameters are correct');
    }
  }
}

// Run the debug
debugOAuthIssue();