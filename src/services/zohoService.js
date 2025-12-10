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

    // Store tokens in environment (for development)
    // In production, you should store these securely in a database
    process.env.ZOHO_ACCESS_TOKEN = access_token;
    process.env.ZOHO_REFRESH_TOKEN = refresh_token;
    process.env.ZOHO_ACCOUNTS_BASE = accountsUrl;

    console.log("💾 Tokens stored in environment variables");
    console.log("⚠️  In production, store these tokens securely in a database");

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

    // Test endpoints in order of likelihood
    const testEndpoints = [
      // V1 endpoints (Deals endpoint - lightweight test)
      "https://www.zohoapis.com/bigin/v1/Deals",
      "https://www.zohoapis.in/bigin/v1/Deals",
      "https://www.zohoapis.eu/bigin/v1/Deals",
      "https://www.zohoapis.com.au/bigin/v1/Deals",
      // V2 endpoints
      "https://www.zohoapis.com/bigin/v2/Deals",
      "https://www.zohoapis.in/bigin/v2/Deals",
      "https://www.zohoapis.eu/bigin/v2/Deals",
      "https://www.zohoapis.com.au/bigin/v2/Deals"
    ];

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
      const createUrl = `${baseUrlToTry}/Deals`;
      console.log(`🔨 Testing deal creation with detected endpoint: ${createUrl}`);

      try {
        const dealData = {
          data: [
            {
              Deal_Name: "PDF Documents Storage",
              Pipeline: "Sales Pipeline Standard", // ✅ Added mandatory Pipeline field
              Stage: "Qualification",
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

    // ✅ Test different base URLs specifically for POST deal creation
    const possibleCreateUrls = [
      // V1 endpoints (often more stable for writes) - Use correct case-sensitive module name "Deals"
      "https://www.zohoapis.com/bigin/v1/Deals",
      "https://www.zohoapis.in/bigin/v1/Deals",
      "https://www.zohoapis.eu/bigin/v1/Deals",
      "https://www.zohoapis.com.au/bigin/v1/Deals",
      // V2 endpoints
      "https://www.zohoapis.com/bigin/v2/Deals",
      "https://www.zohoapis.in/bigin/v2/Deals",
      "https://www.zohoapis.eu/bigin/v2/Deals",
      "https://www.zohoapis.com.au/bigin/v2/Deals",
      // Alternative CRM patterns
      "https://bigin.zoho.com/crm/v2/Deals",
      "https://bigin.zoho.in/crm/v2/Deals",
      "https://bigin.zoho.eu/crm/v2/Deals",
      "https://bigin.zoho.com.au/crm/v2/Deals"
    ];

    const dealData = {
      data: [
        {
          Deal_Name: "PDF Documents Storage",
          Pipeline: "Sales Pipeline Standard", // ✅ Added mandatory Pipeline field
          Stage: "Qualification",
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
 * Get Zoho access token using refresh token
 * 1. Try to get new access token using refresh token
 * 2. If that fails, fall back to static ZOHO_ACCESS_TOKEN (dev shortcut)
 */
export async function getZohoAccessToken() {
  // First, try to use refresh token to get new access token
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
  const accountsUrl = process.env.ZOHO_ACCOUNTS_BASE || ZOHO_ACCOUNTS_URL;

  if (clientId && clientSecret && refreshToken) {
    try {
      console.log("🔄 Refreshing Zoho access token...");

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
      console.log(`✅ Got new Zoho access token, expires in ${expires_in} seconds`);
      return access_token;
    } catch (error) {
      console.error("❌ Failed to refresh Zoho token:", error.response?.data || error.message);
      // Fall through to static token fallback
    }
  }

  // Fallback to static token if refresh fails or credentials missing
  if (process.env.ZOHO_ACCESS_TOKEN) {
    const token = process.env.ZOHO_ACCESS_TOKEN.trim();
    console.log("⚠️  Using static Zoho access token as fallback:", token.substring(0, 25), "...");
    return token;
  }

  // No token available
  console.error("❌ No Zoho credentials found. Need either refresh token credentials or ZOHO_ACCESS_TOKEN");
  throw new Error("Zoho authentication failed: No valid credentials found");
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
 * Legacy function kept for backward compatibility
 */
export async function recordZohoPdf({ fileName, size, mimeType, url }) {
  return { zohoRecordId: `ZHO_${Date.now()}` };
}

/**
 * Comprehensive Zoho integration diagnostic tool
 * Use this to test and troubleshoot Zoho connectivity
 */
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

    // Test 2: Auto-detection
    console.log("\n📋 [TEST 2] Testing endpoint auto-detection...");
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

    // Test 3: Deals fetching
    console.log("\n📋 [TEST 3] Testing deals fetching...");
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

    // Test 4: Deal creation
    console.log("\n📋 [TEST 4] Testing deal creation...");
    try {
      const newDeal = await createDefaultDeal();
      results.dealCreation = { success: !!newDeal, dealId: newDeal?.id };
      if (newDeal) {
        console.log(`✅ Deal creation successful, ID: ${newDeal.id}`);
      } else {
        console.log(`❌ Deal creation failed - no deal returned`);
      }
    } catch (error) {
      results.dealCreation = { success: false, error: error.message };
      console.log(`❌ Deal creation error: ${error.message}`);
    }

    // Summary
    console.log("\n🏁 [SUMMARY] Zoho Integration Diagnostic Results:");
    console.log("=" .repeat(50));
    console.log(`Token Refresh: ${results.tokenRefresh?.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Auto-Detection: ${results.autoDetection?.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Deals Fetching: ${results.dealsFetch?.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Deal Creation: ${results.dealCreation?.success ? '✅ PASS' : '❌ FAIL'}`);

    if (results.autoDetection?.baseUrl) {
      console.log(`\n🎯 Detected working endpoint: ${results.autoDetection.baseUrl}`);
    }

    const passCount = Object.values(results).filter(r => r.success).length;
    console.log(`\n📊 Overall Score: ${passCount}/4 tests passed`);

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
 * Get the working Bigin base URL (use auto-detected or fallback)
 */
function getBiginBaseUrl() {
  return process.env.ZOHO_BIGIN_DETECTED_BASE ||
         process.env.ZOHO_BIGIN_WORKING_URL ||
         "https://www.zohoapis.com/bigin/v1";
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
 * COMPANIES MODULE METHODS
 */

/**
 * Get list of companies from Zoho Bigin
 * @param {number} page - Page number (default: 1)
 * @param {number} perPage - Records per page (default: 50, max: 200)
 * @returns {Promise<Object>} Company list response
 */
export async function getBiginCompanies(page = 1, perPage = 50) {
  console.log(`📋 Fetching Bigin companies (page ${page}, ${perPage} per page)...`);

  const endpoint = `/Accounts?page=${page}&per_page=${Math.min(perPage, 200)}`;  // ✅ FIXED: Use Accounts endpoint
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
  console.log(`💼 Creating new Bigin deal in Pipelines module: ${dealData.dealName}`);

  const record = {
    Deal_Name: dealData.dealName,                    // ✅ Correct Bigin field name
    Stage: dealData.stage || 'Proposal',            // ✅ Must match existing stage values
    Pipeline: dealData.pipelineName || 'Sales Pipeline',  // ✅ Must match existing pipeline
    Amount: dealData.amount || 0,
    Closing_Date: dealData.closingDate || new Date().toISOString().split('T')[0],
    // Custom description
    Description: dealData.description || `EnviroMaster service proposal created on ${new Date().toISOString()}`
  };

  // 🔗 IMPORTANT: Link the deal to a Company in Bigin (proper lookup field format)
  if (dealData.companyId) {
    record.Account_Name = {
      id: dealData.companyId      // ✅ Bigin Company ID (e.g. 1157694000000428610)
    };
    console.log(`🏢 [DEAL CREATION] Linking deal to company ID: ${dealData.companyId}`);
  } else {
    console.log(`⚠️ [DEAL CREATION] No companyId provided - deal will not be linked to any company`);
  }

  const payload = { data: [record] };

  console.log(`🔍 [DEAL CREATION] Payload:`, JSON.stringify(payload, null, 2));

  const result = await makeBiginRequest('POST', '/Pipelines', payload);  // ✅ Correct module name

  if (result.success) {
    const createdDeal = result.data?.data?.[0];
    console.log(`🔍 [DEAL CREATION] Full Zoho response:`, JSON.stringify(result.data, null, 2));

    if (createdDeal?.code === 'SUCCESS') {
      console.log(`✅ Deal created successfully in Pipelines module: ${createdDeal.details.id}`);

      return {
        success: true,
        deal: {
          id: createdDeal.details.id,
          name: dealData.dealName,
          stage: dealData.stage,
          pipelineName: dealData.pipelineName,
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
  console.log(`📝 Creating note for Pipelines deal ${dealId}: ${noteData.title}`);

  const payload = {
    data: [{
      Note_Title: noteData.title || 'EnviroMaster Agreement Update',  // ✅ Correct Bigin field name
      Note_Content: noteData.content,                                 // ✅ Correct Bigin field name
      Parent_Id: dealId,                                              // ✅ Links note to the deal
      // Optional: set owner, created time, etc.
    }]
  };

  console.log(`🔍 [NOTE CREATION] Payload:`, JSON.stringify(payload, null, 2));

  const endpoint = `/Pipelines/${dealId}/Notes`;  // ✅ Correct module path
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
      return {
        success: false,
        error: result.data
      };
    }
  }

  console.error(`❌ Note creation API call failed:`, result.error);
  return result;
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
  console.log(`📎 Uploading file to Pipelines deal ${dealId}: ${fileName} (${pdfBuffer.length} bytes)`);

  try {
    const accessToken = await getZohoAccessToken();
    const baseUrl = getBiginBaseUrl();

    const formData = new FormData();
    formData.append('file', pdfBuffer, {
      filename: fileName,
      contentType: 'application/pdf'
    });

    // Upload to deal's attachments - correct endpoint for Pipelines module
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
      console.log(`✅ File uploaded successfully to Pipelines deal: ${fileData.id}`);

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

  if (result.success) {
    const fields = result.data?.fields || [];
    console.log(`✅ Found ${fields.length} fields for ${moduleName}`);
    return {
      success: true,
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

  return result;
}

/**
 * Get valid pipeline and stage values from Zoho Bigin
 * @returns {Promise<Object>} Pipeline and stage options
 */
export async function getBiginPipelineStages() {
  console.log(`🔍 Fetching pipeline and stage options from Bigin...`);

  try {
    // Get field metadata for Pipelines module to find Pipeline and Stage picklist values
    const fieldsResult = await getBiginModuleFields('Pipelines');

    if (!fieldsResult.success) {
      return {
        success: false,
        error: 'Failed to fetch Pipelines module fields'
      };
    }

    const fields = fieldsResult.fields;
    const pipelineField = fields.find(f => f.apiName === 'Pipeline' || f.apiName === 'Pipeline_Name');
    const stageField = fields.find(f => f.apiName === 'Stage' || f.apiName === 'Stage_Name');

    const pipelines = pipelineField?.pickListValues || [
      { display_value: 'Sales Pipeline', actual_value: 'Sales Pipeline' }
    ];

    const stages = stageField?.pickListValues || [
      { display_value: 'Proposal', actual_value: 'Proposal' },
      { display_value: 'Negotiation', actual_value: 'Negotiation' },
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
      // Provide fallback values
      pipelines: [
        { label: 'Sales Pipeline', value: 'Sales Pipeline' }
      ],
      stages: [
        { label: 'Proposal', value: 'Proposal' },
        { label: 'Negotiation', value: 'Negotiation' },
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
        validStages: validStages
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
