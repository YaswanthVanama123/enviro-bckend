// src/routes/oauthRoutes.js
import { Router } from "express";
import {
  handleZohoOAuthCallback,
  generateZohoAuthUrl,
  runZohoDiagnostics
} from "../services/zohoService.js";

const router = Router();

/**
 * GET /oauth/zoho/auth
 * Generate Zoho OAuth authorization URL
 */
router.get("/zoho/auth", async (req, res) => {
  try {
    console.log("🔐 Generating Zoho OAuth authorization URL...");

    const authUrl = generateZohoAuthUrl();

    console.log("✅ OAuth URL generated successfully");

    // You can either redirect directly or return the URL
    res.json({
      success: true,
      authUrl,
      message: "Visit this URL to authorize the application"
    });

  } catch (error) {
    console.error("❌ Failed to generate OAuth URL:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /oauth/callback
 * Handle OAuth callback from Zoho
 */
router.get("/callback", async (req, res) => {
  try {
    const { code, location } = req.query;

    console.log("🔐 OAuth callback received:");
    console.log("  ├ Authorization code:", code ? code.substring(0, 20) + "..." : "MISSING");
    console.log("  ├ Location:", location);
    console.log("  └ Full query:", JSON.stringify(req.query, null, 2));

    if (!code) {
      console.error("❌ No authorization code received");
      return res.status(400).send(`
        <html>
          <body style="font-family: Arial, sans-serif; padding: 40px;">
            <h1 style="color: #dc3545;">❌ OAuth Error</h1>
            <p>No authorization code received from Zoho.</p>
            <p>Please try the OAuth flow again.</p>
            <a href="/oauth/zoho/auth" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Retry Authorization</a>
          </body>
        </html>
      `);
    }

    console.log("🔄 Exchanging authorization code for tokens...");

    const tokens = await handleZohoOAuthCallback(code, location);

    if (tokens.success) {
      console.log("✅ OAuth flow completed successfully!");
      console.log("  ├ Access token length:", tokens.access_token?.length || 0);
      console.log("  ├ Refresh token length:", tokens.refresh_token?.length || 0);
      console.log("  └ Expires in:", tokens.expires_in, "seconds");

      // Success page
      res.send(`
        <html>
          <body style="font-family: Arial, sans-serif; padding: 40px;">
            <h1 style="color: #28a745;">✅ OAuth Setup Complete!</h1>
            <p>Zoho integration has been successfully configured.</p>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
              <h3>Token Information:</h3>
              <p><strong>Access Token:</strong> ${tokens.access_token.substring(0, 20)}... (${tokens.access_token.length} chars)</p>
              <p><strong>Refresh Token:</strong> ${tokens.refresh_token.substring(0, 20)}... (${tokens.refresh_token.length} chars)</p>
              <p><strong>Expires In:</strong> ${tokens.expires_in} seconds</p>
              <p><strong>Location:</strong> ${location || 'Not specified'}</p>
            </div>
            <div style="margin-top: 30px;">
              <a href="/oauth/test-zoho" style="background: #17a2b8; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-right: 10px;">Test Integration</a>
              <a href="/oauth/zoho/auth" style="background: #6c757d; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reauthorize</a>
            </div>
          </body>
        </html>
      `);
    } else {
      console.error("❌ OAuth flow failed:", tokens.error);

      // Error page
      res.status(500).send(`
        <html>
          <body style="font-family: Arial, sans-serif; padding: 40px;">
            <h1 style="color: #dc3545;">❌ OAuth Failed</h1>
            <p>Failed to exchange authorization code for tokens.</p>
            <div style="background: #f8d7da; padding: 20px; border-radius: 5px; margin: 20px 0;">
              <strong>Error:</strong> ${tokens.error}
            </div>
            <a href="/oauth/zoho/auth" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Try Again</a>
          </body>
        </html>
      `);
    }

  } catch (error) {
    console.error("❌ OAuth callback error:", error.message);
    console.error("❌ Full error:", error);

    res.status(500).send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 40px;">
          <h1 style="color: #dc3545;">❌ Server Error</h1>
          <p>An unexpected error occurred during OAuth processing.</p>
          <div style="background: #f8d7da; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <strong>Error:</strong> ${error.message}
          </div>
          <a href="/oauth/zoho/auth" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Start Over</a>
        </body>
      </html>
    `);
  }
});

/**
 * GET /oauth/test-zoho
 * Test the Zoho integration after OAuth setup
 */
router.get("/test-zoho", async (req, res) => {
  try {
    console.log("🧪 Running Zoho integration diagnostics...");

    const results = await runZohoDiagnostics();

    const passCount = Object.values(results).filter(r => r.success).length;
    const totalTests = Object.keys(results).filter(k => k !== 'error').length;

    res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 40px;">
          <h1>🧪 Zoho Integration Test Results</h1>
          <div style="background: ${passCount === totalTests ? '#d4edda' : '#f8d7da'}; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h2>Overall Score: ${passCount}/${totalTests} tests passed</h2>
          </div>

          <div style="margin: 20px 0;">
            <h3>Test Results:</h3>
            ${Object.entries(results).filter(([k]) => k !== 'error').map(([key, result]) => `
              <div style="margin: 10px 0; padding: 10px; background: ${result.success ? '#d4edda' : '#f8d7da'}; border-radius: 3px;">
                <strong>${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:</strong>
                ${result.success ? '✅ PASS' : '❌ FAIL'}
                ${result.error ? `<br><small>Error: ${result.error}</small>` : ''}
                ${result.baseUrl ? `<br><small>Endpoint: ${result.baseUrl}</small>` : ''}
                ${result.dealCount !== undefined ? `<br><small>Deals found: ${result.dealCount}</small>` : ''}
              </div>
            `).join('')}
          </div>

          <div style="margin-top: 30px;">
            <a href="/oauth/test-zoho" style="background: #17a2b8; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-right: 10px;">Run Again</a>
            <a href="/oauth/zoho/auth" style="background: #6c757d; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reauthorize</a>
          </div>
        </body>
      </html>
    `);

  } catch (error) {
    console.error("❌ Test failed:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /oauth/debug
 * Debug current OAuth configuration
 */
router.get("/debug", async (req, res) => {
  try {
    const clientId = process.env.ZOHO_CLIENT_ID;
    const clientSecret = process.env.ZOHO_CLIENT_SECRET;
    const redirectUri = process.env.ZOHO_REDIRECT_URI || "http://localhost:5000/oauth/callback";

    console.log("🔍 [DEBUG] OAuth Configuration Check");
    console.log("  ├ Client ID:", clientId ? `${clientId.substring(0, 20)}...` : "MISSING");
    console.log("  ├ Client Secret:", clientSecret ? `${clientSecret.substring(0, 10)}...` : "MISSING");
    console.log("  └ Redirect URI:", redirectUri);

    res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 40px;">
          <h1>🔍 OAuth Configuration Debug</h1>

          <div style="background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3>Current Configuration:</h3>
            <p><strong>Client ID:</strong> ${clientId || 'MISSING'}</p>
            <p><strong>Client Secret:</strong> ${clientSecret ? clientSecret.substring(0, 10) + '...' : 'MISSING'}</p>
            <p><strong>Redirect URI:</strong> ${redirectUri}</p>
          </div>

          <div style="background: #e7f3ff; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3>❌ "invalid_client" Error Troubleshooting:</h3>
            <ol>
              <li><strong>Check Zoho Console:</strong> Visit <a href="https://api-console.zoho.com/" target="_blank">api-console.zoho.com</a></li>
              <li><strong>Find Your App:</strong> Look for Client ID: <code>${clientId}</code></li>
              <li><strong>Verify Client Secret:</strong> Copy the secret from Zoho console</li>
              <li><strong>Update .env file:</strong> Replace ZOHO_CLIENT_SECRET with correct value</li>
              <li><strong>Restart server:</strong> npm restart</li>
              <li><strong>Try again:</strong> <a href="/oauth/zoho/auth">Start OAuth Flow</a></li>
            </ol>
          </div>

          <div style="background: #fff3cd; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3>🔑 Required App Settings in Zoho:</h3>
            <p><strong>Client Type:</strong> Server-based Applications</p>
            <p><strong>Redirect URI:</strong> <code>http://localhost:5000/oauth/callback</code></p>
            <p><strong>Scopes:</strong> ZohoBigin.modules.ALL, ZohoBigin.files.ALL, AaaServer.profile.Read</p>
          </div>

          <div style="margin-top: 30px;">
            <a href="/oauth/zoho/auth" style="background: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-right: 10px;">Try OAuth Again</a>
            <a href="/oauth/debug" style="background: #17a2b8; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Refresh Debug</a>
          </div>
        </body>
      </html>
    `);

  } catch (error) {
    console.error("❌ Debug failed:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;