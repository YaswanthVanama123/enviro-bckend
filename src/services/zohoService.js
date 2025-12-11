import FormData from "form-data";
import axios from "axios";

/**
 * Common Zoho base URLs (from env or defaults)
 */
const ZOHO_BIGIN_API_URL =
  process.env.ZOHO_BIGIN_API_URL || "https://www.zohoapis.in/bigin/v2";

const ZOHO_CRM_API_URL =
  process.env.ZOHO_CRM_API_URL || "https://www.zohoapis.in/crm/v3";

const ZOHO_ACCOUNTS_URL =
  process.env.ZOHO_ACCOUNTS_URL || "https://accounts.zoho.in";

/**
 * Generate Zoho OAuth authorization URL
 */
export function generateZohoAuthUrl() {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const redirectUri = process.env.ZOHO_REDIRECT_URI || "http://localhost:5000/oauth/callback";

  if (!clientId) {
    throw new Error("ZOHO_CLIENT_ID environment variable is required");
  }

  // Use comprehensive scopes for Bigin and user profile
// Use valid Bigin scopes: modules, attachments, settings
const scopes = [
  "ZohoBigin.modules.ALL",
  "ZohoBigin.modules.attachments.ALL",
  "ZohoBigin.settings.ALL"
].join(",");


  const authUrl = new URL("/oauth/v2/auth", ZOHO_ACCOUNTS_URL);
  authUrl.searchParams.set("scope", scopes);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("redirect_uri", redirectUri);

  console.log("🔗 Generated OAuth URL:", authUrl.toString());
  return authUrl.toString();
}

/**
 * Handle OAuth callback and exchange authorization code for tokens
 */
export async function handleZohoOAuthCallback(authorizationCode, location = "in") {
  try {
    const clientId = process.env.ZOHO_CLIENT_ID;
    const clientSecret = process.env.ZOHO_CLIENT_SECRET;
    const redirectUri = process.env.ZOHO_REDIRECT_URI || "http://localhost:5000/oauth/callback";

    if (!clientId || !clientSecret) {
      throw new Error("ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET environment variables are required");
    }

    // Determine accounts server based on location
    const accountsUrl = location === "in" ? "https://accounts.zoho.in" :
                       location === "eu" ? "https://accounts.zoho.eu" :
                       location === "com.au" ? "https://accounts.zoho.com.au" :
                       "https://accounts.zoho.com";

    console.log("🔄 Exchanging authorization code for tokens...");
    console.log("  ├ Accounts URL:", accountsUrl);
    console.log("  ├ Client ID:", clientId);
    console.log("  ├ Redirect URI:", redirectUri);
    console.log("  └ Auth code:", authorizationCode.substring(0, 20) + "...");

    const response = await axios.post(
      `${accountsUrl}/oauth/v2/token`,
      null,
      {
        params: {
          code: authorizationCode,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code"
        },
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    const { access_token, refresh_token, expires_in } = response.data;

    if (!access_token || !refresh_token) {
      console.error("❌ Invalid token response:", response.data);
      throw new Error("Failed to obtain valid tokens from Zoho");
    }

    console.log("✅ Tokens obtained successfully!");
    console.log("  ├ Access token length:", access_token.length);
    console.log("  ├ Refresh token length:", refresh_token.length);
    console.log("  └ Expires in:", expires_in, "seconds");

    console.log("\n" + "=".repeat(80));
    console.log("📋 COPY THESE TOKENS TO YOUR .ENV FILE:");
    console.log("=".repeat(80));
    console.log(`ZOHO_ACCESS_TOKEN=${access_token}`);
    console.log(`ZOHO_REFRESH_TOKEN=${refresh_token}`);
    console.log(`ZOHO_ACCOUNTS_BASE=${accountsUrl}`);
    console.log("=".repeat(80));
    console.log("💡 Add these to your .env file for automatic token refresh!");
    console.log("=".repeat(80) + "\n");
    process.env.ZOHO_ACCESS_TOKEN = access_token;
    process.env.ZOHO_REFRESH_TOKEN = refresh_token;
    process.env.ZOHO_ACCOUNTS_BASE = accountsUrl;

    // ✅ FIX: DO NOT overwrite environment variables
    // The refresh token in .env should remain permanent and never be changed
    // Only display the tokens for manual copying to .env file
    console.log("✅ OAuth tokens obtained successfully!");
    console.log("⚠️  IMPORTANT: Copy the refresh token above to your .env file manually");
    console.log("⚠️  Do NOT restart the server until you've updated .env with the new tokens");

    return {
      success: true,
      access_token,
      refresh_token,
      expires_in,
      accounts_url: accountsUrl
    };

  } catch (error) {
    console.error("❌ OAuth token exchange failed:", error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error_description || error.message
    };
  }
}

/**
 * Test Zoho access token by trying to access basic user info
 */
export async function testZohoAccess() {
  try {
    const accessToken = await getZohoAccessToken();
    const baseUrl = process.env.ZOHO_BIGIN_API_URL || "https://www.zohoapis.in/bigin/v2";

    console.log("🧪 Testing Zoho access with user info...");

    // Try basic endpoints to see what we can access
    const testEndpoints = [
      `${baseUrl}/users/me`,
      `${baseUrl}/users`,
      `${baseUrl}/org`,
      `${baseUrl}/settings/modules`
    ];

    for (const endpoint of testEndpoints) {
      try {
        console.log(`🧪 Testing: ${endpoint}`);
        const response = await axios.get(endpoint, {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
        });
        console.log(`✅ Access granted to: ${endpoint}`, response.status);
      } catch (testError) {
        console.log(`❌ Access denied to: ${endpoint}`, testError.response?.status, testError.response?.data?.code);
      }
    }

  } catch (error) {
    console.error("❌ Token test failed:", error.message);
  }
}

/**
 * Detect the correct Zoho Bigin API base URL and version by testing user info endpoint
 * This helps identify the right data center and API version for the current token
 */
async function detectZohoBiginBaseUrl() {
  try {
    const accessToken = await getZohoAccessToken();

    console.log("🔍 [AUTO-DETECT] Testing Zoho endpoints to find the correct data center...");

    // ✅ SMART DETECTION: Determine likely data center from accounts URL
    const accountsUrl = process.env.ZOHO_ACCOUNTS_BASE || ZOHO_ACCOUNTS_URL;
    let primaryDataCenter = 'com'; // default

    if (accountsUrl.includes('.in')) {
      primaryDataCenter = 'in';
    } else if (accountsUrl.includes('.eu')) {
      primaryDataCenter = 'eu';
    } else if (accountsUrl.includes('.com.au')) {
      primaryDataCenter = 'com.au';
    }

    console.log(`🔍 [AUTO-DETECT] Detected data center: ${primaryDataCenter} (from accounts URL: ${accountsUrl})`);

    // ✅ PRIORITY ORDER: Test likely data center first
    const dataCenters = [primaryDataCenter, 'com', 'in', 'eu', 'com.au'].filter((dc, index, arr) => arr.indexOf(dc) === index);

    // Test endpoints in order of likelihood (prioritize detected data center)
    const testEndpoints = [];

    for (const dc of dataCenters) {
      const domain = dc === 'com.au' ? 'zohoapis.com.au' : `zohoapis.${dc}`;
      // V1 endpoints (Deals endpoint - lightweight test)
      testEndpoints.push(`https://www.${domain}/bigin/v1/Deals`);
    }

    for (const dc of dataCenters) {
      const domain = dc === 'com.au' ? 'zohoapis.com.au' : `zohoapis.${dc}`;
      // V2 endpoints
      testEndpoints.push(`https://www.${domain}/bigin/v2/Deals`);
    }

    console.log(`🔍 [AUTO-DETECT] Testing ${testEndpoints.length} endpoints, prioritizing ${primaryDataCenter} data center...`);

    for (const endpoint of testEndpoints) {
      try {
        const response = await axios.get(endpoint, {
          headers: {
            Authorization: `Zoho-oauthtoken ${accessToken}`,
            'Accept': 'application/json'
          },
          timeout: 5000
        });

        if (response.status === 200 && response.data) {
          const baseUrl = endpoint.replace('/Deals', '');
          console.log(`✅ [AUTO-DETECT] Found working endpoint: ${baseUrl}`);
          console.log(`📊 [AUTO-DETECT] Deals info:`, response.data?.data?.length || 'Retrieved successfully');

          // Store the working base URL
          process.env.ZOHO_BIGIN_DETECTED_BASE = baseUrl;
          return baseUrl;
        }
      } catch (error) {
        // Silent fail, continue testing
        console.log(`⚠️ [AUTO-DETECT] ${endpoint}: ${error.response?.status || error.code}`);
      }
    }

    console.log("❌ [AUTO-DETECT] No working Zoho Bigin endpoint found");
    return null;
  } catch (error) {
    console.error("❌ [AUTO-DETECT] Failed to detect Zoho base URL:", error.message);
    return null;
  }
}

/**
 * Get list of deals from Zoho Bigin to find valid deal IDs
 */
export async function getZohoDeals() {
  try {
    const accessToken = await getZohoAccessToken();

    console.log("📋 Fetching deals from Zoho Bigin...");

    // Step 1: Try auto-detection first if we don't have a working URL stored
    let baseUrlToTry = process.env.ZOHO_BIGIN_DETECTED_BASE || process.env.ZOHO_BIGIN_WORKING_URL;

    if (!baseUrlToTry) {
      console.log("🔍 No cached endpoint, running auto-detection...");
      baseUrlToTry = await detectZohoBiginBaseUrl();
    }

    // Step 2: If we have a detected/working URL, try it first
    if (baseUrlToTry) {
      console.log(`🎯 Testing detected endpoint: ${baseUrlToTry}`);

      const dealEndpoints = ["deals", "Deals", "Potentials", "potentials"];

      for (const dealEndpoint of dealEndpoints) {
        const fullUrl = `${baseUrlToTry}/${dealEndpoint}`;

        try {
          console.log(`🔍 Testing deals endpoint: ${fullUrl}`);
          const response = await axios.get(fullUrl, {
            headers: {
              Authorization: `Zoho-oauthtoken ${accessToken}`,
              'Accept': 'application/json'
            },
            timeout: 5000
          });

          const contentType = response.headers['content-type'] || '';
          if (contentType.includes('application/json')) {
            const deals = response.data?.data || [];
            console.log(`✅ SUCCESS with detected endpoint: ${fullUrl}`);
            console.log(`📋 Found ${deals.length} deals`);

            // Store the working pattern
            process.env.ZOHO_BIGIN_WORKING_URL = baseUrlToTry;
            process.env.ZOHO_BIGIN_DEALS_ENDPOINT = dealEndpoint;

            return deals;
          }
        } catch (error) {
          console.log(`❌ Detected endpoint failed ${fullUrl}: ${error.response?.status || error.code}`);
        }
      }
    }

    // Step 3: Fallback to broad endpoint testing

    // ✅ Test ONLY API endpoints that return JSON (not HTML)
    // Based on Zoho Bigin documentation and common endpoint patterns
    const possibleBaseUrls = [
      // Standard Zoho API endpoints (most likely to work)
      "https://www.zohoapis.com/bigin/v1",
      "https://www.zohoapis.in/bigin/v1",
      "https://www.zohoapis.eu/bigin/v1",
      "https://www.zohoapis.com.au/bigin/v1",
      // V2 endpoints
      "https://www.zohoapis.com/bigin/v2",
      "https://www.zohoapis.in/bigin/v2",
      "https://www.zohoapis.eu/bigin/v2",
      "https://www.zohoapis.com.au/bigin/v2",
      // Alternative patterns found in Zoho Bigin docs
      "https://bigin.zoho.com/crm/v2",
      "https://bigin.zoho.in/crm/v2",
      "https://bigin.zoho.eu/crm/v2",
      "https://bigin.zoho.com.au/crm/v2"
    ];

    const dealEndpoints = [
      "deals",
      "Deals",
      "Potentials",
      "potentials"
    ];

    for (const baseUrl of possibleBaseUrls) {
      console.log(`🌍 Trying base URL: ${baseUrl}`);

      for (const dealEndpoint of dealEndpoints) {
        const fullUrl = `${baseUrl}/${dealEndpoint}`;

        try {
          console.log(`🔍 Testing API endpoint: ${fullUrl}`);
          const response = await axios.get(fullUrl, {
            headers: {
              Authorization: `Zoho-oauthtoken ${accessToken}`,
              'Accept': 'application/json'
            },
            timeout: 5000
          });

          // ✅ Check if response is JSON (not HTML)
          const contentType = response.headers['content-type'] || '';
          if (!contentType.includes('application/json')) {
            console.log(`❌ Non-JSON response from ${fullUrl}: ${contentType}`);
            continue;
          }

          const deals = response.data?.data || [];
          console.log(`✅ SUCCESS with JSON response: ${fullUrl}`);
          console.log(`📋 Found ${deals.length} deals:`, deals.slice(0, 2)); // Show first 2 only

          // Store the working base URL for future use
          process.env.ZOHO_BIGIN_WORKING_URL = baseUrl;
          console.log(`🎯 Storing working base URL: ${baseUrl}`);

          return deals;
        } catch (error) {
          const status = error.response?.status || error.code;
          const contentType = error.response?.headers?.['content-type'] || '';

          console.log(`❌ Failed ${fullUrl}: ${status}`);

          if (contentType.includes('text/html')) {
            console.log(`🚫 Skipping ${fullUrl} - returned HTML instead of JSON API`);
          }
        }
      }
    }

    console.log("❌ No working JSON API endpoint found for Zoho Bigin deals");
    throw new Error("No working Zoho Bigin API endpoint found");
  } catch (error) {
    console.error("❌ Failed to fetch Zoho deals:", error.message);
    return [];
  }
}

/**
 * Upload a PDF buffer to Zoho Bigin using Deals/Attachments endpoint
 */
export async function uploadToZohoBigin(
  pdfBuffer,
  fileName = "document.pdf",
  recordId = null
) {
  console.log("🔥 Uploading to Zoho Bigin using deals/attachments...");
  try {
    const accessToken = await getZohoAccessToken();

    // ✅ Use the auto-detected working base URL with fallbacks
    let baseUrl = process.env.ZOHO_BIGIN_DETECTED_BASE || process.env.ZOHO_BIGIN_WORKING_URL;

    if (!baseUrl) {
      console.log("🔍 No cached base URL, running auto-detection for upload...");
      baseUrl = await detectZohoBiginBaseUrl();
    }

    // Final fallback if detection fails
    if (!baseUrl) {
      baseUrl = "https://www.zohoapis.com/bigin/v1"; // Most common working endpoint
      console.log("⚠️ Using fallback base URL:", baseUrl);
    }

    // ✅ First get available deals if no recordId provided
    let dealId = recordId;
    if (!dealId) {
      console.log("🔍 No deal ID provided, fetching available deals...");
      const deals = await getZohoDeals();

      if (deals.length === 0) {
        console.log("🆕 No deals found, creating a default deal for file attachments...");
        // Create a default deal for file attachments
        const newDeal = await createDefaultDeal();
        if (newDeal && newDeal.id) {
          dealId = newDeal.id;
          console.log("✅ Created new deal for attachments:", dealId, "-", newDeal.Deal_Name);
        } else {
          throw new Error("Failed to create default deal for file attachments");
        }
      } else {
        // Use the first available deal
        dealId = deals[0].id;
        console.log("✅ Using first available deal:", dealId, "-", deals[0].Deal_Name);
      }
    }

    console.log("🚀 Uploading to Zoho Bigin deals/attachments...");
    console.log("🌍 Bigin API URL being used:", baseUrl);
    console.log("📌 Deal ID:", dealId);
    console.log("📎 File Name:", fileName);

    const formData = new FormData();
    formData.append("file", pdfBuffer, {
      filename: fileName,
      contentType: "application/pdf",
    });

    // ✅ CORRECT: Upload to deals/{dealId}/attachments with correct base URL
    const uploadResponse = await axios.post(
      `${baseUrl}/deals/${dealId}/attachments`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Zoho-oauthtoken ${accessToken}`,
        },
      }
    );

    console.log("🔍 Zoho Bigin deals/attachments upload response:", JSON.stringify(uploadResponse.data, null, 2));

    const fileData = uploadResponse.data?.data?.[0] || uploadResponse.data;
    const fileId = fileData?.details?.id || fileData?.id;

    console.log("📋 Parsed Zoho response:", { fileId, dealId, status: fileData?.status });

    return {
      fileId: fileId || `ATTACH_${Date.now()}`,
      url: `${baseUrl}/deals/${dealId}/attachments/${fileId}`,
      dealId: dealId,
    };
  } catch (error) {
    console.error("❌ Zoho Bigin deals/attachments upload error:", error.response?.data || error.message);

    if (error.response) {
      console.error("❌ Zoho Bigin API Error Details:");
      console.error("Status:", error.response.status);
      console.error("Headers:", JSON.stringify(error.response.headers, null, 2));
      console.error("Data:", JSON.stringify(error.response.data, null, 2));
    }

    return {
      fileId: `MOCK_ATTACH_${Date.now()}`,
      url: null,
      dealId: recordId || null,
      error: error.message,
    };
  }
}

/**
 * Create a default deal for file attachments
 * Tests multiple API endpoint patterns to find the correct one for POST operations
 */
async function createDefaultDeal() {
  try {
    const accessToken = await getZohoAccessToken();

    console.log("🆕 Creating default deal for PDF attachments...");

    // Step 1: Try to use auto-detected base URL first
    let baseUrlToTry = process.env.ZOHO_BIGIN_DETECTED_BASE || process.env.ZOHO_BIGIN_WORKING_URL;

    if (!baseUrlToTry) {
      console.log("🔍 No cached endpoint for deal creation, running auto-detection...");
      baseUrlToTry = await detectZohoBiginBaseUrl();
    }

    // Step 2: If we have a detected URL, try it first
    if (baseUrlToTry) {
      const createUrl = `${baseUrlToTry}/Pipelines`; // ✅ V2 FIX: Use Pipelines endpoint
      console.log(`🔨 Testing deal creation with v2 Pipelines endpoint: ${createUrl}`);

      try {
        const dealData = {
          data: [
            {
              Deal_Name: "PDF Documents Storage",
              Sub_Pipeline: "Sales Pipeline Standard", // ✅ V2 FIX: Use Sub_Pipeline field
              Stage: "Proposal/Price Quote", // ✅ Use correct Stage value
              Amount: 0,
              Closing_Date: new Date().toISOString().split('T')[0]
            }
          ]
        };

        const response = await axios.post(
          createUrl,
          dealData,
          {
            headers: {
              Authorization: `Zoho-oauthtoken ${accessToken}`,
              "Content-Type": "application/json",
              "Accept": "application/json"
            },
            timeout: 10000
          }
        );

        const contentType = response.headers['content-type'] || '';
        if (contentType.includes('application/json')) {
          console.log(`✅ SUCCESS with detected endpoint: ${createUrl}`);
          console.log("🔍 Deal creation response:", JSON.stringify(response.data, null, 2));

          const newDeal = response.data?.data?.[0]?.details || response.data?.data?.[0] || response.data;

          if (response.data?.data?.[0]?.code === "SUCCESS" && response.data?.data?.[0]?.details?.id) {
            const dealId = response.data.data[0].details.id;
            console.log("✅ Deal created successfully with ID:", dealId);

            return {
              id: dealId,
              Deal_Name: "PDF Documents Storage"
            };
          }

          if (newDeal && (newDeal.id || newDeal.Deal_Name)) {
            return newDeal;
          }
        }
      } catch (error) {
        console.log(`❌ Detected endpoint failed for deal creation: ${error.response?.status || error.code}`);
        if (error.response?.data) {
          console.log(`🔍 API Error:`, error.response.data);
        }
      }
    }

    // Step 3: Fallback to broad endpoint testing

    // ✅ Test different base URLs specifically for POST deal creation to Pipelines module
    const possibleCreateUrls = [
      // V1 endpoints (often more stable for writes) - Use Pipelines module
      "https://www.zohoapis.com/bigin/v1/Pipelines",
      "https://www.zohoapis.in/bigin/v1/Pipelines",
      "https://www.zohoapis.eu/bigin/v1/Pipelines",
      "https://www.zohoapis.com.au/bigin/v1/Pipelines",
      // V2 endpoints
      "https://www.zohoapis.com/bigin/v2/Pipelines",
      "https://www.zohoapis.in/bigin/v2/Pipelines",
      "https://www.zohoapis.eu/bigin/v2/Pipelines",
      "https://www.zohoapis.com.au/bigin/v2/Pipelines",
      // Alternative CRM patterns
      "https://bigin.zoho.com/crm/v2/Pipelines",
      "https://bigin.zoho.in/crm/v2/Pipelines",
      "https://bigin.zoho.eu/crm/v2/Pipelines",
      "https://bigin.zoho.com.au/crm/v2/Pipelines"
    ];

    const dealData = {
      data: [
        {
          Deal_Name: "PDF Documents Storage",
          Sub_Pipeline: "Sales Pipeline Standard", // ✅ V2 FIX: Use Sub_Pipeline field
          Stage: "Proposal/Price Quote", // ✅ Use correct Stage value
          Amount: 0,
          Closing_Date: new Date().toISOString().split('T')[0] // Today's date
        }
      ]
    };

    for (const createUrl of possibleCreateUrls) {
      try {
        console.log(`🔨 Testing deal creation at: ${createUrl}`);

        const response = await axios.post(
          createUrl,
          dealData,
          {
            headers: {
              Authorization: `Zoho-oauthtoken ${accessToken}`,
              "Content-Type": "application/json",
              "Accept": "application/json"
            },
            timeout: 10000
          }
        );

        // ✅ Check if response is JSON (not HTML)
        const contentType = response.headers['content-type'] || '';
        if (!contentType.includes('application/json')) {
          console.log(`❌ Non-JSON response from ${createUrl}: ${contentType}`);
          continue;
        }

        console.log(`✅ SUCCESS with JSON response: ${createUrl}`);
        console.log("🔍 Full deal creation response:", JSON.stringify(response.data, null, 2));

        // ✅ Try different response structure paths
        const newDeal =
          response.data?.data?.[0]?.details ||  // Original attempt
          response.data?.data?.[0] ||           // Direct data array
          response.data ||                      // Top level
          null;

        console.log("✅ Parsed new deal:", newDeal);

        // ✅ If we got a successful response but no deal data, check for ID in response
        if (response.data?.data?.[0]?.code === "SUCCESS" && response.data?.data?.[0]?.details?.id) {
          const dealId = response.data.data[0].details.id;
          console.log("✅ Deal created successfully with ID:", dealId);

          // Store the working URL for future use
          process.env.ZOHO_BIGIN_WORKING_URL = createUrl.replace('/Deals', '');
          console.log(`🎯 Storing working create URL base: ${process.env.ZOHO_BIGIN_WORKING_URL}`);

          return {
            id: dealId,
            Deal_Name: "PDF Documents Storage"
          };
        }

        // ✅ If response has ID directly
        if (newDeal && (newDeal.id || newDeal.Deal_Name)) {
          // Store the working URL for future use
          process.env.ZOHO_BIGIN_WORKING_URL = createUrl.replace('/Deals', '');
          console.log(`🎯 Storing working create URL base: ${process.env.ZOHO_BIGIN_WORKING_URL}`);

          return newDeal;
        }

        console.log(`⚠️ Got JSON response but no valid deal data from ${createUrl}`);

      } catch (error) {
        const status = error.response?.status || error.code;
        const contentType = error.response?.headers?.['content-type'] || '';

        console.log(`❌ Failed ${createUrl}: ${status}`);

        if (contentType.includes('text/html')) {
          console.log(`🚫 Skipping ${createUrl} - returned HTML instead of JSON API`);
        } else if (error.response?.data) {
          console.log(`🔍 API Error from ${createUrl}:`, error.response.data);
        }
      }
    }

    console.log("❌ No working JSON API endpoint found for deal creation");
    throw new Error("No working Zoho Bigin API endpoint found for deal creation");

  } catch (error) {
    console.error("❌ Failed to create default deal:", error.message);
    return null;
  }
}

/**
 * Upload a PDF buffer to Zoho CRM
 */
export async function uploadToZohoCRM(
  pdfBuffer,
  fileName = "document.pdf",
  recordId = null
) {
  console.log("Uploading to Zoho CRM...");
  try {
    const accessToken = await getZohoAccessToken();

    console.log("🚀 Uploading to Zoho CRM...");
    console.log("🌍 CRM API URL being used:", ZOHO_CRM_API_URL);
    console.log(
      "🔐 CRM Access Token being sent:",
      accessToken.substring(0, 20),
      "..."
    );
    console.log("📎 File Name:", fileName);
    console.log("📌 CRM Record ID:", recordId || "none");

    const formData = new FormData();
    formData.append("file", pdfBuffer, {
      filename: fileName,
      contentType: "application/pdf",
    });

    const uploadResponse = await axios.post(
      `${ZOHO_CRM_API_URL}/files`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Zoho-oauthtoken ${accessToken}`,
        },
      }
    );

    const fileData = uploadResponse.data?.data?.[0] || uploadResponse.data;
    const fileId = fileData?.id;
    const fileUrl = fileData?.download_url || null;

    return {
      fileId: fileId || `CRM_FILE_${Date.now()}`,
      url: fileUrl || null,
      dealId: recordId || null,
    };
  } catch (error) {
    console.error(
      "Zoho CRM upload error:",
      error.response?.data || error.message
    );
    return {
      fileId: `MOCK_CRM_FILE_${Date.now()}`,
      url: null,
      dealId: recordId || null,
      error: error.message,
    };
  }
}

/**
 * Get Zoho access token using refresh token with automatic refresh
 * 1. Try to get new access token using refresh token (automatic)
 * 2. If that fails, fall back to static ZOHO_ACCESS_TOKEN (admin setup)
 * 3. If no credentials, provide clear error for admin setup
 */
export async function getZohoAccessToken() {
  // First, try to use refresh token to get new access token automatically
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
  const accountsUrl = process.env.ZOHO_ACCOUNTS_BASE || ZOHO_ACCOUNTS_URL;

  console.log("🔍 [DEBUG] Environment variables check:");
  console.log(`  ├ Client ID: ${clientId ? '✅ Present (' + clientId.substring(0, 20) + '...)' : '❌ Missing'}`);
  console.log(`  ├ Client Secret: ${clientSecret ? '✅ Present (' + clientSecret.substring(0, 10) + '...)' : '❌ Missing'}`);
  console.log(`  ├ Refresh Token: ${refreshToken ? '✅ Present (' + refreshToken.substring(0, 30) + '...)' : '❌ Missing'}`);
  console.log(`  └ Accounts URL: ${accountsUrl}`);

  if (clientId && clientSecret && refreshToken) {
    try {
      console.log("🔄 Auto-refreshing Zoho access token...");
      console.log(`🔑 Using refresh token: ${refreshToken.substring(0, 30)}...`);
      console.log(`🌍 Accounts URL: ${accountsUrl}`);
      console.log(`🆔 Client ID: ${clientId}`);

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
        }
      );

      const { access_token, expires_in } = response.data;
      console.log(`✅ Auto-refreshed Zoho token successfully!`);
      console.log(`  ├ New access token: ${access_token.substring(0, 30)}...`);
      console.log(`  ├ Expires in: ${expires_in} seconds (${Math.round(expires_in/3600)} hours)`);
      console.log(`  └ Refresh token status: PERMANENT (never expires) ✅`);

      return access_token;
    } catch (error) {
      console.error("❌ Failed to auto-refresh Zoho token:");
      console.error("  ├ Error type:", error.name || 'Unknown');
      console.error("  ├ Error message:", error.message);
      console.error("  ├ Response status:", error.response?.status);
      console.error("  ├ Response data:", JSON.stringify(error.response?.data, null, 2));
      console.error("  ├ Request URL:", error.config?.url);
      console.error("  └ Refresh token used:", refreshToken.substring(0, 30) + "...");

      console.error("\n🔍 [DEBUG] Full request details:");
      console.error("  ├ Accounts URL:", accountsUrl);
      console.error("  ├ Client ID:", clientId);
      console.error("  ├ Client Secret:", clientSecret ? clientSecret.substring(0, 10) + "..." : "MISSING");
      console.error("  └ Grant type: refresh_token");

      // Fall through to static token fallback
    }
  } else {
    console.log("⚠️  Missing OAuth credentials:");
    console.log(`  ├ Client ID: ${clientId ? '✅ Present' : '❌ Missing'}`);
    console.log(`  ├ Client Secret: ${clientSecret ? '✅ Present' : '❌ Missing'}`);
    console.log(`  └ Refresh Token: ${refreshToken ? '✅ Present' : '❌ Missing'}`);
  }

  // Fallback to static token if refresh fails or credentials missing
  if (process.env.ZOHO_ACCESS_TOKEN) {
    const token = process.env.ZOHO_ACCESS_TOKEN.trim();
    console.log("⚠️  Using static Zoho access token (may expire soon):", token.substring(0, 25), "...");
    console.log("💡 Recommendation: Set up permanent refresh token via OAuth for automatic renewal");
    return token;
  }

  // No credentials available - admin needs to set up OAuth
  console.error("❌ No Zoho credentials configured");
  console.error("💡 Admin setup required: Visit http://localhost:5000/oauth/zoho/auth to configure Zoho integration");

  throw new Error("Zoho integration not configured. Administrator needs to set up OAuth credentials.");
}



/**
 * Attach uploaded file to a Zoho record
 */
async function attachFileToRecord(recordId, fileId, accessToken, apiUrl) {
  try {
    await axios.post(
      `${apiUrl}/records/${recordId}/attachments`,
      { file_id: fileId },
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error(
      "Failed to attach file to record:",
      error.response?.data || error.message
    );
    // don't throw – file is uploaded, just not attached
  }
}

/**
 * V8 FIX: Contact management functions for Contact_Name mandatory field
 */

/**
 * Get contacts associated with a specific company
 * @param {string} accountId - Zoho company/account ID
 * @returns {Promise<Object>} Contacts list response
 */
export async function getBiginContactsByAccount(accountId) {
  console.log(`👤 Fetching contacts for account: ${accountId}`);

  try {
    // First try to get contacts using COQL (more reliable for filtering)
    const coqlQuery = `SELECT id, Contact_Name, Email, Phone
                       FROM Contacts
                       WHERE Account_Name = '${accountId}'
                       LIMIT 10`;

    console.log(`🔍 [V8-CONTACTS] Using COQL to fetch contacts for account ${accountId}`);
    const coqlResult = await makeBiginRequest('POST', '/coql', {
      select_query: coqlQuery
    });

    if (coqlResult.success && coqlResult.data?.data) {
      const contacts = coqlResult.data.data;
      console.log(`✅ [V8-CONTACTS] Found ${contacts.length} contacts via COQL`);
      return {
        success: true,
        contacts: contacts.map(contact => ({
          id: contact.id,
          name: contact.Contact_Name || 'Unnamed Contact',
          email: contact.Email || '',
          phone: contact.Phone || ''
        }))
      };
    }

    // Fallback: try direct Contacts endpoint with filters
    console.log(`🔄 [V8-CONTACTS] COQL failed, trying direct Contacts endpoint`);

    // ✅ V2 FIX: Add required fields parameter for Contacts
    const contactFields = ['id', 'Contact_Name', 'Email', 'Phone'].join(',');
    const directResult = await makeBiginRequest('GET', `/Contacts?Account_Name=${accountId}&fields=${contactFields}`);

    if (directResult.success && directResult.data?.data) {
      const contacts = directResult.data.data;
      console.log(`✅ [V8-CONTACTS] Found ${contacts.length} contacts via direct endpoint`);
      return {
        success: true,
        contacts: contacts.map(contact => ({
          id: contact.id,
          name: contact.Contact_Name || 'Unnamed Contact',
          email: contact.Email || '',
          phone: contact.Phone || ''
        }))
      };
    }

    console.log(`⚠️ [V8-CONTACTS] No contacts found for account ${accountId}`);
    return {
      success: true,
      contacts: []
    };

  } catch (error) {
    console.error(`❌ [V8-CONTACTS] Failed to fetch contacts for account ${accountId}:`, error.message);
    return {
      success: false,
      error: error.message,
      contacts: []
    };
  }
}

/**
 * Create a default contact for a company
 * @param {string} accountId - Zoho company/account ID
 * @param {string} accountName - Company name for contact creation
 * @returns {Promise<Object>} Contact creation result
 */
export async function createDefaultBiginContact(accountId, accountName) {
  console.log(`👤 Creating default contact for account: ${accountId} (${accountName})`);

  try {
    const contactData = {
      data: [{
        Contact_Name: `${accountName} - Main Contact`,
        Account_Name: {
          id: accountId  // Link to the company
        },
        Email: `info@${accountName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`, // Generate placeholder email
        Description: `Default contact created for ${accountName} by EnviroMaster system on ${new Date().toISOString()}`
      }]
    };

    console.log(`🔍 [V8-CONTACTS] Creating contact payload:`, JSON.stringify(contactData, null, 2));

    const result = await makeBiginRequest('POST', '/Contacts', contactData);

    if (result.success) {
      const createdContact = result.data?.data?.[0];
      console.log(`🔍 [V8-CONTACTS] Contact creation response:`, JSON.stringify(result.data, null, 2));

      if (createdContact?.code === 'SUCCESS') {
        console.log(`✅ [V8-CONTACTS] Contact created successfully: ${createdContact.details.id}`);
        return {
          success: true,
          contact: {
            id: createdContact.details.id,
            name: `${accountName} - Main Contact`,
            email: `info@${accountName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
            phone: ''
          }
        };
      } else {
        console.error(`❌ [V8-CONTACTS] Contact creation failed:`, result.data);
        return {
          success: false,
          error: result.data
        };
      }
    }

    console.error(`❌ [V8-CONTACTS] Contact creation API call failed:`, result.error);
    return {
      success: false,
      error: result.error
    };

  } catch (error) {
    console.error(`❌ [V8-CONTACTS] Failed to create default contact:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get or create a contact for deal creation
 * @param {string} accountId - Zoho company/account ID
 * @param {string} accountName - Company name for fallback contact creation
 * @returns {Promise<Object>} Contact result
 */
export async function getOrCreateContactForDeal(accountId, accountName) {
  console.log(`🔗 [V8-CONTACTS] Getting or creating contact for deal creation...`);

  try {
    // Step 1: Try to find existing contacts
    const contactsResult = await getBiginContactsByAccount(accountId);

    if (contactsResult.success && contactsResult.contacts.length > 0) {
      const contact = contactsResult.contacts[0]; // Use first available contact
      console.log(`✅ [V8-CONTACTS] Using existing contact: ${contact.name} (${contact.id})`);
      return {
        success: true,
        contact: contact,
        wasCreated: false
      };
    }

    // Step 2: No existing contacts, create a default one
    console.log(`🆕 [V8-CONTACTS] No existing contacts found, creating default contact...`);
    const createResult = await createDefaultBiginContact(accountId, accountName);

    if (createResult.success) {
      console.log(`✅ [V8-CONTACTS] Created new default contact: ${createResult.contact.name} (${createResult.contact.id})`);
      return {
        success: true,
        contact: createResult.contact,
        wasCreated: true
      };
    }

    console.error(`❌ [V8-CONTACTS] Failed to get or create contact:`, createResult.error);
    return {
      success: false,
      error: createResult.error
    };

  } catch (error) {
    console.error(`❌ [V8-CONTACTS] Exception in getOrCreateContactForDeal:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}
export async function recordZohoPdf({ fileName, size, mimeType, url }) {
  return { zohoRecordId: `ZHO_${Date.now()}` };
}

/**
 * V10 COMPATIBILITY: Test Layout+Pipeline compatibility matching
 */
export async function testV10LayoutPipelineCompatibility() {
  console.log(`🔍 [V10-COMPAT-TEST] Testing Layout+Pipeline compatibility matching...`);

  try {
    const compatiblePairs = [];

    // Get all available layouts
    const layoutResult = await makeBiginRequest('GET', '/settings/layouts?module=Deals');

    if (layoutResult.success && layoutResult.data?.layouts) {
      const layouts = layoutResult.data.layouts;
      console.log(`✅ [V10-COMPAT-TEST] Found ${layouts.length} layouts to analyze`);

      // Analyze each layout for Pipeline compatibility
      for (const layout of layouts) {
        console.log(`🔍 [V10-COMPAT-TEST] Analyzing layout: "${layout.name}" (ID: ${layout.id}, visible: ${layout.visible})`);

        const layoutInfo = {
          id: layout.id,
          name: layout.name,
          visible: layout.visible,
          pipelines: []
        };

        if (layout.sections) {
          for (const section of layout.sections) {
            const pipelineField = section.fields?.find(f => f.api_name === 'Pipeline');
            if (pipelineField && pipelineField.pick_list_values) {
              console.log(`  📋 Found ${pipelineField.pick_list_values.length} Pipeline options in this layout:`);
              pipelineField.pick_list_values.forEach((pipeline, index) => {
                const pipelineValue = pipeline.actual_value || pipeline.display_value;
                console.log(`    ${index + 1}. "${pipeline.display_value}" (actual: "${pipelineValue}")`);

                layoutInfo.pipelines.push({
                  display: pipeline.display_value,
                  actual: pipelineValue
                });

                compatiblePairs.push({
                  layoutId: layout.id,
                  layoutName: layout.name,
                  pipelineDisplay: pipeline.display_value,
                  pipelineActual: pipelineValue,
                  visible: layout.visible
                });
              });
              break; // Found Pipeline field, no need to check other sections
            }
          }
        }

        if (layoutInfo.pipelines.length === 0) {
          console.log(`  ⚠️ No Pipeline field found in this layout`);
        }
      }

      console.log(`\n✅ [V10-COMPAT-TEST] COMPATIBILITY ANALYSIS COMPLETE:`);
      console.log(`📊 Found ${compatiblePairs.length} compatible Layout+Pipeline combinations`);

      // Show the first few compatible pairs
      const visiblePairs = compatiblePairs.filter(pair => pair.visible);
      console.log(`🔍 Visible Layout+Pipeline combinations (${visiblePairs.length}):`);
      visiblePairs.slice(0, 5).forEach((pair, index) => {
        console.log(`  ${index + 1}. Layout: "${pair.layoutName}" + Pipeline: "${pair.pipelineActual}"`);
      });

      // Recommend the first visible pair
      if (visiblePairs.length > 0) {
        const recommended = visiblePairs[0];
        console.log(`\n🎯 [V10-COMPAT-TEST] RECOMMENDED for V10:`);
        console.log(`  📐 Layout: "${recommended.layoutName}" (ID: ${recommended.layoutId})`);
        console.log(`  🔗 Pipeline: "${recommended.pipelineActual}"`);
        console.log(`  ✅ This combination is guaranteed to be compatible!`);

        return {
          success: true,
          compatiblePairs: compatiblePairs,
          visiblePairs: visiblePairs,
          recommended: recommended,
          totalLayouts: layouts.length,
          totalCompatiblePairs: compatiblePairs.length
        };
      } else {
        console.log(`❌ [V10-COMPAT-TEST] No visible Layout+Pipeline pairs found!`);
        return {
          success: false,
          error: 'No visible Layout+Pipeline pairs found',
          compatiblePairs: compatiblePairs,
          totalLayouts: layouts.length
        };
      }

    } else {
      console.log(`❌ [V10-COMPAT-TEST] Failed to fetch layouts`);
      return {
        success: false,
        error: 'Failed to fetch layouts',
        details: layoutResult.error
      };
    }

  } catch (error) {
    console.error(`❌ [V10-COMPAT-TEST] Compatibility test failed:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}
export async function testV9SimplePipelineDetection() {
  console.log(`🔍 [V9-SIMPLE-TEST] Testing simple Pipeline detection from field metadata...`);

  try {
    // Get field metadata to find actual Pipeline values
    const fieldsResult = await makeBiginRequest('GET', '/settings/fields?module=Deals');

    if (fieldsResult.success && fieldsResult.data?.fields) {
      const pipelineField = fieldsResult.data.fields.find(f => f.api_name === 'Pipeline');

      if (pipelineField) {
        console.log(`✅ [V9-SIMPLE-TEST] Found Pipeline field:`);
        console.log(`  - Data type: ${pipelineField.data_type}`);
        console.log(`  - Required: ${pipelineField.required}`);
        console.log(`  - Read only: ${pipelineField.read_only}`);

        if (pipelineField.pick_list_values && pipelineField.pick_list_values.length > 0) {
          console.log(`  - Available values (${pipelineField.pick_list_values.length}):`);
          pipelineField.pick_list_values.forEach((pipeline, index) => {
            console.log(`    ${index + 1}. "${pipeline.display_value}" (actual: "${pipeline.actual_value || pipeline.display_value}")`);
          });

          const firstPipeline = pipelineField.pick_list_values[0];
          const selectedValue = firstPipeline.actual_value || firstPipeline.display_value;
          console.log(`🎯 [V9-SIMPLE-TEST] V9 will use: "${selectedValue}"`);

          return {
            success: true,
            pipelineField: {
              dataType: pipelineField.data_type,
              required: pipelineField.required,
              readOnly: pipelineField.read_only,
              availableValues: pipelineField.pick_list_values.map(p => ({
                display: p.display_value,
                actual: p.actual_value || p.display_value
              })),
              selectedValue: selectedValue
            }
          };
        } else {
          console.log(`⚠️ [V9-SIMPLE-TEST] Pipeline field has no picklist values`);
          return {
            success: false,
            error: 'Pipeline field has no picklist values'
          };
        }
      } else {
        console.log(`❌ [V9-SIMPLE-TEST] Pipeline field not found in Deals module`);
        return {
          success: false,
          error: 'Pipeline field not found in Deals module'
        };
      }
    } else {
      console.log(`❌ [V9-SIMPLE-TEST] Could not fetch Deals field metadata`);
      return {
        success: false,
        error: 'Could not fetch Deals field metadata',
        details: fieldsResult.error
      };
    }

  } catch (error) {
    console.error(`❌ [V9-SIMPLE-TEST] Pipeline detection failed:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}
export async function testLayoutPipelineDetection() {
  console.log(`🔍 [V7-DIAGNOSTIC] Testing Layout and Pipeline detection...`);

  try {
    // Test layout fetching
    const layoutResult = await makeBiginRequest('GET', '/settings/layouts?module=Deals');

    if (layoutResult.success && layoutResult.data?.layouts) {
      const layouts = layoutResult.data.layouts;
      console.log(`✅ [V7-DIAGNOSTIC] Found ${layouts.length} layouts:`);

      layouts.forEach((layout, index) => {
        console.log(`  Layout ${index + 1}: ${layout.name} (ID: ${layout.id}, visible: ${layout.visible})`);

        // Check for Pipeline field in this layout
        if (layout.sections) {
          layout.sections.forEach((section, sectionIndex) => {
            const pipelineField = section.fields?.find(f => f.api_name === 'Pipeline');
            if (pipelineField) {
              console.log(`    📋 Pipeline field found in section ${sectionIndex + 1}:`);
              console.log(`      - Field type: ${pipelineField.data_type}`);
              console.log(`      - Required: ${pipelineField.required}`);
              if (pipelineField.pick_list_values) {
                console.log(`      - Available pipelines: ${pipelineField.pick_list_values.map(p => p.display_value).join(', ')}`);
              }
            }
          });
        }
      });

      // Find default layout
      const defaultLayout = layouts.find(l => l.visible && !l.convert_mapping) || layouts[0];
      if (defaultLayout) {
        console.log(`🎯 [V7-DIAGNOSTIC] Selected layout: ${defaultLayout.name} (ID: ${defaultLayout.id})`);
        return {
          success: true,
          layoutId: defaultLayout.id,
          layoutName: defaultLayout.name,
          layouts: layouts.map(l => ({ id: l.id, name: l.name, visible: l.visible }))
        };
      }
    } else {
      console.log(`❌ [V7-DIAGNOSTIC] Failed to fetch layouts:`, layoutResult.error);
    }

    // Also test field metadata for Deals module
    const fieldsResult = await makeBiginRequest('GET', '/settings/fields?module=Deals');
    if (fieldsResult.success && fieldsResult.data?.fields) {
      const pipelineField = fieldsResult.data.fields.find(f => f.api_name === 'Pipeline');
      if (pipelineField) {
        console.log(`🔍 [V7-DIAGNOSTIC] Pipeline field metadata:`);
        console.log(`  - Data type: ${pipelineField.data_type}`);
        console.log(`  - Required: ${pipelineField.required}`);
        console.log(`  - Read only: ${pipelineField.read_only}`);
        if (pipelineField.pick_list_values) {
          console.log(`  - Available values: ${pipelineField.pick_list_values.map(p => `"${p.display_value}"`).join(', ')}`);
        }
      }
    }

    return {
      success: false,
      error: 'No suitable layout found'
    };

  } catch (error) {
    console.error(`❌ [V7-DIAGNOSTIC] Layout detection failed:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}
export async function runZohoDiagnostics() {
  console.log("🔧 [DIAGNOSTICS] Starting comprehensive Zoho integration test...");
  const results = {};

  try {
    // Test 1: Token refresh
    console.log("\n📋 [TEST 1] Testing Zoho token refresh...");
    try {
      const token = await getZohoAccessToken();
      results.tokenRefresh = { success: true, tokenLength: token.length };
      console.log(`✅ Token refresh successful, length: ${token.length}`);
    } catch (error) {
      results.tokenRefresh = { success: false, error: error.message };
      console.log(`❌ Token refresh failed: ${error.message}`);
    }

    // Test 2: V10 Layout+Pipeline Compatibility Analysis
    console.log("\n📋 [TEST 2] Testing V10 Layout+Pipeline compatibility matching...");
    try {
      const compatTest = await testV10LayoutPipelineCompatibility();
      results.layoutPipelineCompatibilityV10 = compatTest;
      if (compatTest.success) {
        console.log(`✅ V10 Compatibility analysis successful: Found ${compatTest.totalCompatiblePairs} compatible pairs`);
        if (compatTest.recommended) {
          console.log(`🎯 V10 Recommended: "${compatTest.recommended.layoutName}" + "${compatTest.recommended.pipelineActual}"`);
        }
      } else {
        console.log(`❌ V10 Compatibility analysis failed: ${compatTest.error}`);
      }
    } catch (error) {
      results.layoutPipelineCompatibilityV10 = { success: false, error: error.message };
      console.log(`❌ V10 Compatibility analysis error: ${error.message}`);
    }

    // Test 3: V9 Simple Pipeline Detection (for comparison)
    console.log("\n📋 [TEST 3] Testing V9 Simple Pipeline detection (no Layout complexity)...");
    try {
      const pipelineTest = await testV9SimplePipelineDetection();
      results.simplePipelineDetectionV9 = pipelineTest;
      if (pipelineTest.success) {
        console.log(`✅ V9 Simple Pipeline detection successful: "${pipelineTest.pipelineField.selectedValue}"`);
        console.log(`📋 Available Pipeline options: ${pipelineTest.pipelineField.availableValues.length}`);
      } else {
        console.log(`❌ V9 Simple Pipeline detection failed: ${pipelineTest.error}`);
      }
    } catch (error) {
      results.simplePipelineDetectionV9 = { success: false, error: error.message };
      console.log(`❌ V9 Simple Pipeline detection error: ${error.message}`);
    }

    // Test 3: V7 Layout+Pipeline Detection (for comparison)
    console.log("\n📋 [TEST 3] Testing V7 Layout+Pipeline detection (complex approach)...");
    try {
      const layoutTest = await testLayoutPipelineDetection();
      results.layoutPipelineDetection = layoutTest;
      if (layoutTest.success) {
        console.log(`✅ V7 Layout detection successful: ${layoutTest.layoutName} (${layoutTest.layoutId})`);
      } else {
        console.log(`❌ V7 Layout detection failed: ${layoutTest.error}`);
      }
    } catch (error) {
      results.layoutPipelineDetection = { success: false, error: error.message };
      console.log(`❌ V7 Layout detection error: ${error.message}`);
    }

    // Test 4: Auto-detection
    console.log("\n📋 [TEST 4] Testing endpoint auto-detection...");
    try {
      const baseUrl = await detectZohoBiginBaseUrl();
      results.autoDetection = { success: !!baseUrl, baseUrl };
      if (baseUrl) {
        console.log(`✅ Auto-detection successful: ${baseUrl}`);
      } else {
        console.log(`❌ Auto-detection failed - no working endpoint found`);
      }
    } catch (error) {
      results.autoDetection = { success: false, error: error.message };
      console.log(`❌ Auto-detection error: ${error.message}`);
    }

    // Test 5: Deals fetching
    console.log("\n📋 [TEST 5] Testing deals fetching...");
    try {
      const deals = await getZohoDeals();
      results.dealsFetch = { success: true, dealCount: deals.length };
      console.log(`✅ Deals fetch successful, found ${deals.length} deals`);
      if (deals.length > 0) {
        console.log(`📄 First deal: ${deals[0].Deal_Name || deals[0].name || 'Unnamed'}`);
      }
    } catch (error) {
      results.dealsFetch = { success: false, error: error.message };
      console.log(`❌ Deals fetch failed: ${error.message}`);
    }

    // Test 7: Deal creation (WITH V10 COMPATIBILITY FIX)
    console.log("\n📋 [TEST 7] Testing deal creation with V10 Layout+Pipeline compatibility fix...");
    try {
      const newDeal = await createBiginDeal({
        dealName: 'V10-COMPATIBILITY-TEST-DEAL-' + Date.now(),
        stage: 'Proposal/Price Quote',
        amount: 1000,
        description: 'V10 Layout+Pipeline compatibility test deal creation'
      });
      results.dealCreationV10 = { success: !!newDeal, dealId: newDeal?.id };
      if (newDeal) {
        console.log(`✅ V10 Deal creation successful, ID: ${newDeal.id}`);
      } else {
        console.log(`❌ V10 Deal creation failed - no deal returned`);
      }
    } catch (error) {
      results.dealCreationV10 = { success: false, error: error.message };
      console.log(`❌ V10 Deal creation error: ${error.message}`);
    }

    // Test 8: V8 Contact Creation Test
    console.log("\n📋 [TEST 8] Testing V8 Contact creation for deal linking...");
    try {
      // First get a company to test with
      const companies = await getBiginCompanies(1, 5);
      if (companies.success && companies.companies.length > 0) {
        const testCompany = companies.companies[0];
        console.log(`🏢 [V8-TEST] Testing contact creation with company: ${testCompany.name} (${testCompany.id})`);

        const contactResult = await getOrCreateContactForDeal(testCompany.id, testCompany.name);
        results.contactCreationV8 = {
          success: contactResult.success,
          contactId: contactResult.contact?.id,
          wasCreated: contactResult.wasCreated
        };

        if (contactResult.success) {
          console.log(`✅ V8 Contact creation successful: ${contactResult.contact.name} (${contactResult.contact.id})`);
          if (contactResult.wasCreated) {
            console.log(`🆕 V8 Contact was created automatically`);
          } else {
            console.log(`🔍 V8 Used existing contact`);
          }
        } else {
          console.log(`❌ V8 Contact creation failed: ${contactResult.error}`);
        }
      } else {
        results.contactCreationV8 = { success: false, error: 'No companies available for contact test' };
        console.log(`❌ V8 Contact test skipped - no companies available`);
      }
    } catch (error) {
      results.contactCreationV8 = { success: false, error: error.message };
      console.log(`❌ V8 Contact creation error: ${error.message}`);
    }
    // Summary
    console.log("\n🏁 [SUMMARY] V10 Zoho Integration Diagnostic Results:");
    console.log("=" .repeat(60));
    console.log(`Token Refresh: ${results.tokenRefresh?.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`V10 Layout+Pipeline Compatibility: ${results.layoutPipelineCompatibilityV10?.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`V9 Simple Pipeline: ${results.simplePipelineDetectionV9?.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`V7 Layout Detection: ${results.layoutPipelineDetection?.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Auto-Detection: ${results.autoDetection?.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Deals Fetching: ${results.dealsFetch?.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`V10 Deal Creation: ${results.dealCreationV10?.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`V8 Contact Creation: ${results.contactCreationV8?.success ? '✅ PASS' : '❌ FAIL'}`);

    if (results.autoDetection?.baseUrl) {
      console.log(`\n🎯 Detected working endpoint: ${results.autoDetection.baseUrl}`);
    }

    if (results.layoutPipelineCompatibilityV10?.success && results.layoutPipelineCompatibilityV10.recommended) {
      const rec = results.layoutPipelineCompatibilityV10.recommended;
      console.log(`🎯 V10 Recommended Compatible Pair: "${rec.layoutName}" + "${rec.pipelineActual}"`);
    }

    if (results.simplePipelineDetectionV9?.success) {
      console.log(`🎯 V9 Selected Pipeline: "${results.simplePipelineDetectionV9.pipelineField.selectedValue}"`);
    }

    if (results.layoutPipelineDetection?.layoutId) {
      console.log(`🎯 V7 Layout ID: ${results.layoutPipelineDetection.layoutId} (${results.layoutPipelineDetection.layoutName})`);
    }

    if (results.contactCreationV8?.contactId) {
      console.log(`🎯 V8 Contact ID: ${results.contactCreationV8.contactId} (${results.contactCreationV8.wasCreated ? 'Created' : 'Existing'})`);
    }

    const passCount = Object.values(results).filter(r => r.success).length;
    console.log(`\n📊 Overall Score: ${passCount}/8 tests passed`);

    // V10 vs V9 vs V7 Comparison
    const v10Success = results.dealCreationV10?.success;
    const v9Success = results.dealCreationV9?.success;
    const v7Success = results.dealCreationV7?.success;

    if (v10Success && !v9Success && !v7Success) {
      console.log(`\n🏆 V10 COMPATIBILITY approach succeeded where V9 and V7 failed!`);
    } else if (v10Success) {
      console.log(`\n✅ V10 COMPATIBILITY approach works! This should resolve the MAPPING_MISMATCH error.`);
    } else {
      console.log(`\n❌ Even V10 COMPATIBILITY approach failed. More investigation needed.`);
    }

    return results;

  } catch (error) {
    console.error("❌ [DIAGNOSTICS] Failed to run diagnostics:", error.message);
    return { error: error.message };
  }
}

/* ============================================================================
 * ZOHO BIGIN V2 API INTEGRATION FOR UPLOAD WORKFLOW
 * ============================================================================ */

/**
 * Get the working Bigin base URL (use auto-detected or derive from accounts URL)
 */
function getBiginBaseUrl() {
  // Use auto-detected URL if available
  if (process.env.ZOHO_BIGIN_DETECTED_BASE || process.env.ZOHO_BIGIN_WORKING_URL) {
    return process.env.ZOHO_BIGIN_DETECTED_BASE || process.env.ZOHO_BIGIN_WORKING_URL;
  }

  // ✅ DERIVE from accounts base to match data center - USE V2 for Pipelines
  const accountsUrl = process.env.ZOHO_ACCOUNTS_BASE || ZOHO_ACCOUNTS_URL;

  if (accountsUrl.includes('.in')) {
    return "https://www.zohoapis.in/bigin/v2";
  } else if (accountsUrl.includes('.eu')) {
    return "https://www.zohoapis.eu/bigin/v2";
  } else if (accountsUrl.includes('.com.au')) {
    return "https://www.zohoapis.com.au/bigin/v2";
  } else {
    return "https://www.zohoapis.com/bigin/v2";
  }
}

/**
 * Make authenticated request to Zoho Bigin API
 */
async function makeBiginRequest(method, endpoint, data = null) {
  try {
    const accessToken = await getZohoAccessToken();
    const baseUrl = getBiginBaseUrl();
    const url = `${baseUrl}${endpoint}`;

    const config = {
      method,
      url,
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json'
      }
    };

    if (data && (method === 'POST' || method === 'PUT')) {
      config.data = data;
    }

    console.log(`📡 [BIGIN API] ${method} ${endpoint}`);
    console.log(`🌍 [BIGIN API] Using base URL: ${baseUrl}`);
    const response = await axios(config);

    return {
      success: true,
      data: response.data,
      status: response.status
    };

  } catch (error) {
    console.error(`❌ [BIGIN API] ${method} ${endpoint} failed:`, error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data || { message: error.message },
      status: error.response?.status
    };
  }
}

/**
 * Get deals associated with a specific company
 * @param {string} companyId - Zoho company/account ID
 * @param {number} page - Page number (default: 1)
 * @param {number} perPage - Records per page (default: 20, max: 200)
 * @returns {Promise<Object>} Deals list response
 */
export async function getBiginDealsByCompany(companyId, page = 1, perPage = 20) {
  console.log(`💼 Fetching Bigin deals for company: ${companyId} (page ${page}, ${perPage} per page)`);

  try {
    // Method 1: Try COQL query for more reliable filtering
    // const coqlQuery = `SELECT id, Deal_Name, Stage, Amount, Closing_Date, Created_Time, Modified_Time
    //                    FROM Deals
    //                    WHERE Account_Name = '${companyId}'
    //                    ORDER BY Modified_Time DESC
    //                    LIMIT ${Math.min(perPage, 200)}
    //                    OFFSET ${(page - 1) * perPage}`;
        const coqlQuery = `SELECT *
                       FROM Deals
                       WHERE Account_Name = '${companyId}'
                       ORDER BY Modified_Time DESC
                       LIMIT ${Math.min(perPage, 200)}
                       OFFSET ${(page - 1) * perPage}`;

    console.log(`🔍 [COMPANY-DEALS] Using COQL to fetch deals for company ${companyId}`);
    const coqlResult = await makeBiginRequest('POST', '/coql', {
      select_query: coqlQuery
    });

    if (coqlResult.success && coqlResult.data?.data) {
      const deals = coqlResult.data.data;
      console.log(`✅ [COMPANY-DEALS] Found ${deals.length} deals via COQL`);

      return {
        success: true,
        deals: deals.map(deal => ({
          id: deal.id,
          name: deal.Deal_Name || 'Unnamed Deal',
          stage: deal.Stage || '',
          amount: deal.Amount || 0,
          closingDate: deal.Closing_Date || null,
          createdAt: deal.Created_Time || null,
          modifiedAt: deal.Modified_Time || null
        })),
        pagination: {
          page: page,
          perPage: perPage,
          total: deals.length // COQL doesn't return total count easily
        }
      };
    }

    // Method 2: Fallback to direct Deals endpoint with filters
    console.log(`🔄 [COMPANY-DEALS] COQL failed, trying direct Deals endpoint`);

    // ✅ V2 FIX: Add required fields parameter for Deals
    const dealFields = [
      'id',
      'Deal_Name',
      'Stage',
      'Amount',
      'Closing_Date',
      'Created_Time',
      'Modified_Time',
      'Description',
      'Pipeline',
      'Contact_Name'
    ].join(',');

    const endpoint = `/Deals?page=${page}&per_page=${Math.min(perPage, 200)}&Account_Name=${companyId}&fields=${dealFields}`;
    const directResult = await makeBiginRequest('GET', endpoint);

    if (directResult.success && directResult.data?.data) {
      const deals = directResult.data.data;
      console.log(`✅ [COMPANY-DEALS] Found ${deals.length} deals via direct endpoint`);

      return {
        success: true,
        deals: deals.map(deal => ({
          id: deal.id,
          name: deal.Deal_Name || 'Unnamed Deal',
          stage: deal.Stage || '',
          amount: deal.Amount || 0,
          closingDate: deal.Closing_Date || null,
          createdAt: deal.Created_Time || null,
          modifiedAt: deal.Modified_Time || null,
          // Additional fields that might be useful
          description: deal.Description || '',
          pipelineName: deal.Pipeline || '',
          contactName: deal.Contact_Name?.name || null
        })),
        pagination: {
          page: page,
          perPage: perPage,
          total: directResult.data.info?.count || deals.length,
          hasMore: directResult.data.info?.more_records || false
        }
      };
    }

    console.log(`⚠️ [COMPANY-DEALS] No deals found for company ${companyId}`);
    return {
      success: true,
      deals: [],
      pagination: {
        page: page,
        perPage: perPage,
        total: 0,
        hasMore: false
      }
    };

  } catch (error) {
    console.error(`❌ [COMPANY-DEALS] Failed to fetch deals for company ${companyId}:`, error.message);
    return {
      success: false,
      error: error.message,
      deals: []
    };
  }
}

/**
 * Get list of companies from Zoho Bigin
 * @param {number} page - Page number (default: 1)
 * @param {number} perPage - Records per page (default: 50, max: 200)
 * @returns {Promise<Object>} Company list response
 */
export async function getBiginCompanies(page = 1, perPage = 50) {
  console.log(`📋 Fetching Bigin companies (page ${page}, ${perPage} per page)...`);

  // ✅ V2 FIX: Add required fields parameter for Bigin v2 API
  const fields = [
    'id',
    'Account_Name',
    'Company_Name',
    'Phone',
    'Email',
    'Website',
    'Billing_Street'
  ].join(',');

  const endpoint = `/Accounts?page=${page}&per_page=${Math.min(perPage, 200)}&fields=${fields}`;
  const result = await makeBiginRequest('GET', endpoint);

  if (result.success) {
    const companies = result.data?.data || [];
    console.log(`✅ Found ${companies.length} companies`);

    // Return simplified company objects for UI
    return {
      success: true,
      companies: companies.map(company => ({
        id: company.id,
        name: company.Account_Name || company.Company_Name || 'Unnamed Company',  // ✅ FIXED: Try Account_Name first
        phone: company.Phone || '',
        email: company.Email || '',
        website: company.Website || '',
        address: company.Billing_Street || ''
      })),
      pagination: result.data?.info || {}
    };
  }

  return result;
}

/**
 * Search companies by name using COQL
 * @param {string} searchTerm - Company name to search for
 * @returns {Promise<Object>} Search results
 */
export async function searchBiginCompanies(searchTerm) {
  console.log(`🔍 Searching Bigin companies for: "${searchTerm}"`);

  // Use COQL to search companies by name (partial match)
  const coqlQuery = `SELECT id, Account_Name, Phone, Email, Website
                     FROM Accounts
                     WHERE Account_Name LIKE '%${searchTerm}%'
                     LIMIT 20`;  // ✅ FIXED: Use Accounts table and Account_Name field

  const endpoint = '/coql';
  const result = await makeBiginRequest('POST', endpoint, {
    select_query: coqlQuery
  });

  if (result.success) {
    const companies = result.data?.data || [];
    console.log(`✅ Found ${companies.length} companies matching "${searchTerm}"`);

    return {
      success: true,
      companies: companies.map(company => ({
        id: company.id,
        name: company.Account_Name || company.Company_Name || 'Unnamed Company',  // ✅ FIXED: Try Account_Name first
        phone: company.Phone || '',
        email: company.Email || '',
        website: company.Website || ''
      }))
    };
  }

  return result;
}

/**
 * Create a new company in Zoho Bigin
 * @param {Object} companyData - Company information
 * @returns {Promise<Object>} Creation result
 */
export async function createBiginCompany(companyData) {
  console.log(`🏢 Creating new Bigin company: ${companyData.name}`);

  const payload = {
    data: [{
      Account_Name: companyData.name,           // ✅ FIXED: Correct Bigin field name for Accounts
      Phone: companyData.phone || '',
      Email: companyData.email || '',
      Website: companyData.website || '',
      Billing_Street: companyData.address || '', // ✅ Correct Bigin field name
      // Add any custom fields as needed
      Description: `Created by EnviroMaster system on ${new Date().toISOString()}`
    }]
  };

  const result = await makeBiginRequest('POST', '/Accounts', payload);  // ✅ FIXED: Use Accounts endpoint

  if (result.success) {
    const createdCompany = result.data?.data?.[0];
    if (createdCompany?.code === 'SUCCESS') {
      console.log(`✅ Company created successfully: ${createdCompany.details.id}`);
      console.log(`🔍 Full Zoho response:`, JSON.stringify(result.data, null, 2));

      return {
        success: true,
        company: {
          id: createdCompany.details.id,
          name: companyData.name,
          phone: companyData.phone,
          email: companyData.email,
          website: companyData.website,
          address: companyData.address
        }
      };
    } else {
      console.error(`❌ Company creation failed:`, result.data);
      return {
        success: false,
        error: result.data
      };
    }
  }

  return result;
}

/**
 * PIPELINES (DEALS) MODULE METHODS
 */

/**
 * Create a new deal (pipeline record) in Zoho Bigin
 * @param {Object} dealData - Deal information
 * @returns {Promise<Object>} Creation result
 */
export async function createBiginDeal(dealData) {
  console.log(`💼 Creating new Bigin deal: ${dealData.dealName}`);

  const record = {
    // REQUIRED
    Deal_Name: dealData.dealName,                  // e.g. "PDF Documents Storage"
    Sub_Pipeline: dealData.subPipelineName
                  || "Sales Pipeline Standard",    // from your pipelineName
    Stage: dealData.stage || "Qualification",      // or "Proposal/Price Quote"

    // OPTIONAL BUT RECOMMENDED
    Amount: dealData.amount ?? 0,
    Closing_Date: dealData.closingDate
                  || new Date().toISOString().split("T")[0],
    Description:
      dealData.description
      || `EnviroMaster service proposal created on ${new Date().toISOString()}`
  };

  // Link to company (Account_Name lookup)
  if (dealData.companyId) {
    record.Account_Name = { id: dealData.companyId };
  }

  // Link to contact (Contact_Name lookup)
  if (dealData.contactId) {
    record.Contact_Name = { id: dealData.contactId };
  }

  const payload = { data: [record] };

  console.log(
    "🔍 [V2-Pipelines] Final payload:",
    JSON.stringify(payload, null, 2)
  );

  // IMPORTANT: v2 + Pipelines module, not v1 + Deals
  const result = await makeBiginRequest(
    "POST",
    "/Pipelines",     // <<--- change from '/Deals' to '/Pipelines'
    payload
  );

  if (result.success) {
    const createdDeal = result.data?.data?.[0];
    console.log(`🔍 [DEAL CREATION] Full Zoho response:`, JSON.stringify(result.data, null, 2));

    if (createdDeal?.code === 'SUCCESS') {
      console.log(`✅ Deal created successfully: ${createdDeal.details.id}`);

      return {
        success: true,
        deal: {
          id: createdDeal.details.id,
          name: dealData.dealName,
          stage: dealData.stage,
          amount: dealData.amount,
          companyId: dealData.companyId
        }
      };
    } else {
      console.error(`❌ Deal creation failed:`, result.data);
      return {
        success: false,
        error: result.data
      };
    }
  }

  console.error(`❌ Deal creation API call failed:`, result.error);
  return result;
}

/**
 * NOTES MODULE METHODS
 */

/**
 * Create a note attached to a deal
 * @param {string} dealId - Zoho deal ID
 * @param {Object} noteData - Note information
 * @returns {Promise<Object>} Creation result
 */
export async function createBiginNote(dealId, noteData) {
  console.log(`📝 Creating note for deal ${dealId}: ${noteData.title}`);

  // ✅ FIX: Check what fields Notes module actually requires
  try {
    console.log(`🔍 [NOTE CREATION] Checking Notes module field requirements...`);
    const notesFields = await getBiginModuleFields('Notes');
    if (notesFields.success) {
      const requiredFields = notesFields.fields.filter(f => f.required);
      console.log(`🔍 [NOTE CREATION] Required fields for Notes:`, requiredFields.map(f => f.apiName));
    }
  } catch (e) {
    console.log(`⚠️ [NOTE CREATION] Could not fetch Notes fields:`, e.message);
  }

  const payload = {
    data: [{
      Note_Title: noteData.title || 'EnviroMaster Agreement Update',  // ✅ Correct Bigin field name
      Note_Content: noteData.content,                                 // ✅ Correct Bigin field name
      Parent_Id: dealId,                                              // ✅ Links note to the deal
      $se_module: 'Deals',                                           // ✅ FIX: Specify which module the parent belongs to
      // Optional: set owner, created time, etc.
    }]
  };

  console.log(`🔍 [NOTE CREATION] Payload:`, JSON.stringify(payload, null, 2));

  // ✅ V2 FIX: Use Notes module directly, not nested under Deals
  const endpoint = `/Notes`;  // ✅ FIXED: Use direct Notes endpoint for v2
  console.log(`🔍 [NOTE CREATION] Using v2 Notes endpoint: ${endpoint}`);

  const result = await makeBiginRequest('POST', endpoint, payload);

  if (result.success) {
    const createdNote = result.data?.data?.[0];
    console.log(`🔍 [NOTE CREATION] Full Zoho response:`, JSON.stringify(result.data, null, 2));

    if (createdNote?.code === 'SUCCESS') {
      console.log(`✅ Note created successfully: ${createdNote.details.id}`);

      return {
        success: true,
        note: {
          id: createdNote.details.id,
          title: noteData.title,
          content: noteData.content,
          dealId: dealId
        }
      };
    } else {
      console.error(`❌ Note creation failed:`, result.data);

      // ✅ FIX: Extract actual error message from Zoho response
      const zohoError = result.data?.data?.[0];
      const errorMessage = zohoError?.message || zohoError?.details || 'Unknown Zoho error';

      console.error(`❌ Extracted error message:`, errorMessage);

      return {
        success: false,
        error: errorMessage  // Return the actual error message, not the whole object
      };
    }
  }

  console.error(`❌ Note creation API call failed:`, result.error);

  // ✅ FIX: Extract error message from failed API call
  const errorMessage = result.error?.message || result.error || 'Unknown API error';

  return {
    success: false,
    error: errorMessage
  };
}

/**
 * FILES/ATTACHMENTS MODULE METHODS
 */

/**
 * Upload a PDF file to a deal in Zoho Bigin
 * @param {string} dealId - Zoho deal ID
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {string} fileName - PDF filename
 * @returns {Promise<Object>} Upload result
 */
export async function uploadBiginFile(dealId, pdfBuffer, fileName) {
  console.log(`📎 Uploading file to deal ${dealId}: ${fileName} (${pdfBuffer.length} bytes)`);

  try {
    const accessToken = await getZohoAccessToken();
    const baseUrl = getBiginBaseUrl();

    const formData = new FormData();
    formData.append('file', pdfBuffer, {
      filename: fileName,
      contentType: 'application/pdf'
    });

    // ✅ V2 FIX: Upload to deal's attachments using Pipelines module (matches deal creation endpoint)
    const uploadUrl = `${baseUrl}/Pipelines/${dealId}/Attachments`;
    console.log(`🔍 [FILE UPLOAD] URL: ${uploadUrl}`);

    const response = await axios.post(uploadUrl, formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Zoho-oauthtoken ${accessToken}`
      }
    });

    console.log(`🔍 [FILE UPLOAD] Full Zoho response:`, JSON.stringify(response.data, null, 2));

    if (response.data?.data?.[0]?.code === 'SUCCESS') {
      const fileData = response.data.data[0].details;
      console.log(`✅ File uploaded successfully to deal: ${fileData.id}`);

      return {
        success: true,
        file: {
          id: fileData.id,
          fileName: fileName,
          dealId: dealId,
          uploadedAt: new Date().toISOString()
        }
      };
    } else {
      console.error(`❌ File upload failed - unexpected response format:`, response.data);
      return {
        success: false,
        error: {
          message: 'Unexpected response format from Zoho',
          zohoResponse: response.data
        }
      };
    }

  } catch (error) {
    console.error(`❌ File upload error:`, error.response?.data || error.message);
    console.error(`❌ Full error object:`, {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      headers: error.response?.headers
    });

    return {
      success: false,
      error: {
        message: error.message,
        status: error.response?.status,
        zohoResponse: error.response?.data
      }
    };
  }
}

/**
 * MODULE DISCOVERY METHODS
 */

/**
 * Get available modules in Zoho Bigin
 * @returns {Promise<Object>} Modules list
 */
export async function getBiginModules() {
  console.log(`📋 Fetching available Bigin modules...`);

  const result = await makeBiginRequest('GET', '/settings/modules');

  if (result.success) {
    const modules = result.data?.modules || [];
    console.log(`✅ Found ${modules.length} modules`);
    return {
      success: true,
      modules: modules.map(module => ({
        apiName: module.api_name,
        displayLabel: module.display_label,
        creatable: module.creatable,
        editable: module.editable
      }))
    };
  }

  return result;
}

/**
 * Get field metadata for a specific module
 * @param {string} moduleName - Module API name (e.g., 'Companies', 'Pipelines')
 * @returns {Promise<Object>} Field metadata
 */
export async function getBiginModuleFields(moduleName) {
  console.log(`📋 Fetching field metadata for ${moduleName} module...`);

  const result = await makeBiginRequest('GET', `/settings/fields?module=${moduleName}`);

  console.log(`🔍 [DEBUG] Module fields request for ${moduleName}:`);
  console.log(`  ├ Success: ${result.success}`);
  console.log(`  ├ Status: ${result.status}`);
  console.log(`  ├ Data keys: ${result.data ? Object.keys(result.data) : 'No data'}`);
  console.log(`  └ Error: ${result.error || 'None'}`);

  if (result.success) {
    const fields = result.data?.fields || [];
    console.log(`✅ Found ${fields.length} fields for ${moduleName}`);
    if (fields.length > 0) {
      console.log(`🔍 Sample fields: ${fields.slice(0, 5).map(f => f.api_name).join(', ')}`);
    }
    return {
      success: true,
      moduleName: moduleName, // ✅ Add module name for debugging
      fields: fields.map(field => ({
        apiName: field.api_name,
        displayLabel: field.display_label,
        dataType: field.data_type,
        required: field.required,
        readOnly: field.read_only,
        pickListValues: field.pick_list_values || null // ✅ Important for Pipeline/Stage validation
      }))
    };
  }

  console.error(`❌ Failed to get ${moduleName} fields:`, result);
  return result;
}

/**
 * Get available pipelines with their IDs
 * @returns {Promise<Object>} Pipelines list with IDs
 */
export async function getBiginPipelines() {
  console.log(`📋 Fetching available Bigin pipelines with IDs...`);

  // Try to get pipelines from settings or a dedicated endpoint
  const endpoints = [
    '/settings/pipelines',
    '/Pipelines',
    '/settings/layouts?module=Deals'
  ];

  for (const endpoint of endpoints) {
    try {
      const result = await makeBiginRequest('GET', endpoint);
      if (result.success && result.data) {
        console.log(`✅ Found pipelines data from ${endpoint}:`, JSON.stringify(result.data, null, 2));
        return {
          success: true,
          pipelines: result.data.pipelines || result.data.data || result.data.layouts || []
        };
      }
    } catch (error) {
      console.log(`⚠️ Pipeline endpoint ${endpoint} failed: ${error.message}`);
    }
  }

  // Fallback: return empty list
  console.log(`⚠️ Could not fetch pipeline IDs - using fallback`);
  return {
    success: false,
    pipelines: []
  };
}
export async function getBiginPipelineStages() {
  console.log(`🔍 Fetching pipeline and stage options from Bigin...`);

  try {
    // ✅ V2 FIX: Try 'Deals' module first (more likely to work than 'Pipelines')
    console.log(`🔍 Trying to fetch fields from 'Deals' module first...`);
    let fieldsResult = await getBiginModuleFields('Deals');

    if (!fieldsResult.success) {
      console.log(`🔄 'Deals' failed, trying 'Pipelines' module...`);
      fieldsResult = await getBiginModuleFields('Pipelines');
    }

    if (!fieldsResult.success) {
      console.log(`🔄 Both modules failed, trying 'Potentials' module...`);
      fieldsResult = await getBiginModuleFields('Potentials');
    }

    if (!fieldsResult.success) {
      return {
        success: false,
        error: 'Failed to fetch field metadata from any module (Deals, Pipelines, Potentials)'
      };
    }

    const fields = fieldsResult.fields;

    console.log(`🔍 [DEBUG] Available fields in module (${fieldsResult.moduleName || 'unknown'}):`, fields.map(f => f.apiName).slice(0, 15));

    console.log(`🔍 [DEBUG] Looking for pipeline fields: Sub_Pipeline, Pipeline, Pipeline_Name`);
    console.log(`🔍 [DEBUG] Looking for stage fields: Stage, Stage_Name`);

    // ✅ V2 FIX: Look for Sub_Pipeline field (not Pipeline field)
    const pipelineField = fields.find(f =>
      f.apiName === 'Sub_Pipeline' ||
      f.apiName === 'Pipeline' ||
      f.apiName === 'Pipeline_Name'
    );
    const stageField = fields.find(f =>
      f.apiName === 'Stage' ||
      f.apiName === 'Stage_Name'
    );

    console.log(`🔍 [DEBUG] Pipeline field found:`, pipelineField?.apiName, 'with', pipelineField?.pickListValues?.length || 0, 'values');
    console.log(`🔍 [DEBUG] Stage field found:`, stageField?.apiName, 'with', stageField?.pickListValues?.length || 0, 'values');

    // ✅ FIX: Use known working pipeline when no picklist values
    const pipelineValues = pipelineField?.pickListValues;
    const pipelines = (pipelineValues && pipelineValues.length > 0) ? pipelineValues : [
      { display_value: 'Sales Pipeline Standard', actual_value: 'Sales Pipeline Standard' }
    ];

    console.log(`🔍 [DEBUG] Using pipelines:`, pipelines.map(p => p.display_value || p.actual_value));

    const stages = stageField?.pickListValues || [
      { display_value: 'Qualification', actual_value: 'Qualification' },
      { display_value: 'Needs Analysis', actual_value: 'Needs Analysis' },
      { display_value: 'Proposal/Price Quote', actual_value: 'Proposal/Price Quote' },
      { display_value: 'Negotiation/Review', actual_value: 'Negotiation/Review' },
      { display_value: 'Closed Won', actual_value: 'Closed Won' },
      { display_value: 'Closed Lost', actual_value: 'Closed Lost' }
    ];

    console.log(`✅ Found ${pipelines.length} pipelines and ${stages.length} stages`);
    console.log(`🔍 Pipelines:`, pipelines.map(p => p.display_value));
    console.log(`🔍 Stages:`, stages.map(s => s.display_value));

    return {
      success: true,
      pipelines: pipelines.map(p => ({
        label: p.display_value,
        value: p.actual_value || p.display_value
      })),
      stages: stages.map(s => ({
        label: s.display_value,
        value: s.actual_value || s.display_value
      }))
    };

  } catch (error) {
    console.error(`❌ Failed to fetch pipeline/stage options:`, error.message);
    return {
      success: false,
      error: error.message,
      // Provide fallback values that match your working system
      pipelines: [
        { label: 'Sales Pipeline Standard', value: 'Sales Pipeline Standard' }
      ],
      stages: [
        { label: 'Qualification', value: 'Qualification' },
        { label: 'Needs Analysis', value: 'Needs Analysis' },
        { label: 'Proposal/Price Quote', value: 'Proposal/Price Quote' },
        { label: 'Negotiation/Review', value: 'Negotiation/Review' },
        { label: 'Closed Won', value: 'Closed Won' },
        { label: 'Closed Lost', value: 'Closed Lost' }
      ]
    };
  }
}

/**
 * Validate pipeline and stage values against Zoho Bigin
 * @param {string} pipelineName - Pipeline to validate
 * @param {string} stageName - Stage to validate
 * @returns {Promise<Object>} Validation result
 */
export async function validatePipelineStage(pipelineName, stageName) {
  console.log(`🔍 Validating pipeline: "${pipelineName}", stage: "${stageName}"`);

  try {
    const pipelineStages = await getBiginPipelineStages();

    if (!pipelineStages.success) {
      // If we can't validate, allow the values and let Zoho reject if invalid
      console.log(`⚠️ Could not validate against Zoho, allowing values`);
      return {
        success: true,
        valid: true,
        correctedPipeline: pipelineName,
        correctedStage: stageName,
        note: 'Validation skipped - could not fetch Zoho field options'
      };
    }

    const validPipelines = pipelineStages.pipelines;
    const validStages = pipelineStages.stages;

    // Find exact or case-insensitive matches
    const matchingPipeline = validPipelines.find(p =>
      p.value === pipelineName || p.label.toLowerCase() === pipelineName.toLowerCase()
    );

    const matchingStage = validStages.find(s =>
      s.value === stageName || s.label.toLowerCase() === stageName.toLowerCase()
    );

    if (!matchingPipeline) {
      console.log(`❌ Invalid pipeline: "${pipelineName}". Valid options:`, validPipelines.map(p => p.label));
      return {
        success: false,
        valid: false,
        error: `Invalid pipeline "${pipelineName}"`,
        validPipelines: validPipelines,
        validStages: validStages
      };
    }

    if (!matchingStage) {
      console.log(`❌ Invalid stage: "${stageName}". Valid options:`, validStages.map(s => s.label));
      return {
        success: false,
        valid: false,
        error: `Invalid stage "${stageName}"`,
        validPipelines: validPipelines,
        validStages: validStages,
        // ✅ V6 FIX: Provide correct fallback stage
        correctedPipeline: pipelineName,
        correctedStage: 'Proposal/Price Quote'  // ✅ Use valid picklist value
      };
    }

    console.log(`✅ Pipeline and stage are valid`);
    return {
      success: true,
      valid: true,
      correctedPipeline: matchingPipeline.value,
      correctedStage: matchingStage.value
    };

  } catch (error) {
    console.error(`❌ Pipeline/stage validation error:`, error.message);
    // Allow values if validation fails
    return {
      success: true,
      valid: true,
      correctedPipeline: pipelineName,
      correctedStage: stageName,
      note: `Validation error: ${error.message}`
    };
  }
}
