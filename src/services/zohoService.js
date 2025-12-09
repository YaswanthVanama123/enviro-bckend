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
 * Upload a PDF buffer to Zoho Bigin
 */
export async function uploadToZohoBigin(
  pdfBuffer,
  fileName = "document.pdf",
  recordId = null
) {
  console.log("Uploading to Zoho Bigin...");
  try {
    const accessToken = await getZohoAccessToken();

    console.log("🚀 Uploading to Zoho Bigin...");
    console.log("🌍 Bigin API URL being used:", ZOHO_BIGIN_API_URL);
    console.log(
      "🔐 Bigin Access Token being sent:",
      accessToken.substring(0, 20),
      "..."
    );
    console.log("📎 File Name:", fileName);
    console.log("📌 Bigin Record ID:", recordId || "none");

    const formData = new FormData();
    formData.append("file", pdfBuffer, {
      filename: fileName,
      contentType: "application/pdf",
    });

    const uploadResponse = await axios.post(
      `${ZOHO_BIGIN_API_URL}/files`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Zoho-oauthtoken ${accessToken}`,
        },
      }
    );

    // ✅ DEBUG: Log the full response to understand structure
    console.log("🔍 Zoho Bigin upload response:", JSON.stringify(uploadResponse.data, null, 2));

    const fileData = uploadResponse.data?.data?.[0] || uploadResponse.data;

    // ✅ FIXED: Extract file ID from correct location (details.id)
    const fileId = fileData?.details?.id || fileData?.id;

    // ✅ FIXED: Zoho Bigin doesn't return download_url directly, construct or mark success differently
    const fileUrl = fileData?.download_url || (fileId ? `${ZOHO_BIGIN_API_URL}/files/${fileId}` : null);

    console.log("📋 Parsed Zoho response:", { fileId, fileUrl, status: fileData?.status });

    if (recordId && fileId) {
      await attachFileToRecord(
        recordId,
        fileId,
        accessToken,
        ZOHO_BIGIN_API_URL
      );
    }

    return {
      fileId: fileId || `FILE_${Date.now()}`,
      url: fileUrl,
      dealId: recordId || null,
    };
  } catch (error) {
    console.error("Zoho Bigin upload error:", error.response?.data || error.message);

    // ✅ DETAILED ERROR LOGGING for debugging
    if (error.response) {
      console.error("❌ Zoho Bigin API Error Details:");
      console.error("Status:", error.response.status);
      console.error("Headers:", JSON.stringify(error.response.headers, null, 2));
      console.error("Data:", JSON.stringify(error.response.data, null, 2));
    }

    return {
      fileId: `MOCK_FILE_${Date.now()}`,
      url: null,
      dealId: recordId || null,
      error: error.message,
    };
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
async function getZohoAccessToken() {
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
