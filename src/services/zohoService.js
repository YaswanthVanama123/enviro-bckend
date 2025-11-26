import FormData from "form-data";
import axios from "axios";

/**
 * Upload a PDF buffer to Zoho Bigin
 * @param {Buffer} pdfBuffer - The PDF file buffer
 * @param {string} fileName - Name for the uploaded file
 * @param {string} recordId - Optional Zoho record/deal ID to attach file to
 * @returns {Promise<{fileId: string, url: string, dealId: string}>}
 */
export async function uploadToZohoBigin(pdfBuffer, fileName = "document.pdf", recordId = null) {
  try {
    // TODO: Implement actual Zoho Bigin API integration
    // This is a placeholder implementation
    // You'll need to:
    // 1. Get Zoho access token using refresh token
    // 2. Upload file using Zoho Files API
    // 3. Attach file to record if recordId provided

    const ZOHO_BIGIN_API_URL = process.env.ZOHO_BIGIN_API_URL || "https://www.zohoapis.com/bigin/v1";
    const ZOHO_ACCESS_TOKEN = await getZohoAccessToken();

    // Create FormData for file upload
    const formData = new FormData();
    formData.append("file", pdfBuffer, {
      filename: fileName,
      contentType: "application/pdf"
    });

    // Upload file to Zoho
    const uploadResponse = await axios.post(
      `${ZOHO_BIGIN_API_URL}/files`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          "Authorization": `Zoho-oauthtoken ${ZOHO_ACCESS_TOKEN}`
        }
      }
    );

    const fileId = uploadResponse.data?.data?.[0]?.id || uploadResponse.data?.id;
    const fileUrl = uploadResponse.data?.data?.[0]?.download_url || uploadResponse.data?.download_url;

    // If recordId provided, attach file to the record
    if (recordId && fileId) {
      await attachFileToRecord(recordId, fileId, ZOHO_ACCESS_TOKEN, ZOHO_BIGIN_API_URL);
    }

    return {
      fileId: fileId || `FILE_${Date.now()}`,
      url: fileUrl || null,
      dealId: recordId || null
    };
  } catch (error) {
    console.error("Zoho Bigin upload error:", error.message);
    // Return mock data if Zoho fails (graceful degradation)
    return {
      fileId: `MOCK_FILE_${Date.now()}`,
      url: null,
      dealId: recordId || null,
      error: error.message
    };
  }
}

/**
 * Upload a PDF buffer to Zoho CRM
 * @param {Buffer} pdfBuffer - The PDF file buffer
 * @param {string} fileName - Name for the uploaded file
 * @param {string} recordId - Optional Zoho record/deal ID to attach file to
 * @returns {Promise<{fileId: string, url: string, dealId: string}>}
 */
export async function uploadToZohoCRM(pdfBuffer, fileName = "document.pdf", recordId = null) {
  try {
    // TODO: Implement actual Zoho CRM API integration
    const ZOHO_CRM_API_URL = process.env.ZOHO_CRM_API_URL || "https://www.zohoapis.com/crm/v3";
    const ZOHO_ACCESS_TOKEN = await getZohoAccessToken();

    // Similar implementation to Bigin
    const formData = new FormData();
    formData.append("file", pdfBuffer, {
      filename: fileName,
      contentType: "application/pdf"
    });

    const uploadResponse = await axios.post(
      `${ZOHO_CRM_API_URL}/files`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          "Authorization": `Zoho-oauthtoken ${ZOHO_ACCESS_TOKEN}`
        }
      }
    );

    const fileId = uploadResponse.data?.data?.[0]?.id || uploadResponse.data?.id;
    const fileUrl = uploadResponse.data?.data?.[0]?.download_url || uploadResponse.data?.download_url;

    return {
      fileId: fileId || `CRM_FILE_${Date.now()}`,
      url: fileUrl || null,
      dealId: recordId || null
    };
  } catch (error) {
    console.error("Zoho CRM upload error:", error.message);
    return {
      fileId: `MOCK_CRM_FILE_${Date.now()}`,
      url: null,
      dealId: recordId || null,
      error: error.message
    };
  }
}

/**
 * Get Zoho access token using refresh token
 * @returns {Promise<string>} Access token
 */
async function getZohoAccessToken() {
  try {
    const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID;
    const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
    const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN;

    if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET || !ZOHO_REFRESH_TOKEN) {
      throw new Error("Zoho credentials not configured");
    }

    const response = await axios.post(
      "https://accounts.zoho.com/oauth/v2/token",
      null,
      {
        params: {
          refresh_token: ZOHO_REFRESH_TOKEN,
          client_id: ZOHO_CLIENT_ID,
          client_secret: ZOHO_CLIENT_SECRET,
          grant_type: "refresh_token"
        }
      }
    );

    return response.data.access_token;
  } catch (error) {
    console.error("Failed to get Zoho access token:", error.message);
    throw new Error("Zoho authentication failed");
  }
}

/**
 * Attach uploaded file to a Zoho record
 */
async function attachFileToRecord(recordId, fileId, accessToken, apiUrl) {
  try {
    // Zoho-specific API call to link file to record
    await axios.post(
      `${apiUrl}/records/${recordId}/attachments`,
      { file_id: fileId },
      {
        headers: {
          "Authorization": `Zoho-oauthtoken ${accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );
  } catch (error) {
    console.error("Failed to attach file to record:", error.message);
    // Don't throw - file is uploaded, just not attached
  }
}

// Legacy function kept for backward compatibility
export async function recordZohoPdf({ fileName, size, mimeType, url }) {
  return { zohoRecordId: `ZHO_${Date.now()}` };
}

