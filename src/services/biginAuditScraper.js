/**
 * Zoho Bigin Audit Log Scraper Service
 * Scrapes audit history from Zoho Bigin using Puppeteer
 */

import puppeteer from 'puppeteer';

const BIGIN_SIGNIN_URL = 'https://accounts.zoho.in/signin?servicename=ZohoBigin&signupurl=https://www.bigin.com/signup.html';
const BIGIN_EMAIL = process.env.BIGIN_EMAIL || 'hvanama@enviromasternva.com';
const BIGIN_PASSWORD = process.env.BIGIN_PASSWORD || 'Satyavani@970';

/**
 * Login to Zoho Bigin
 */
async function login(page) {
  console.log('🔐 Logging into Zoho Bigin...');
  console.log(`   URL: ${BIGIN_SIGNIN_URL}`);
  console.log(`   Email: ${BIGIN_EMAIL ? BIGIN_EMAIL.substring(0, 5) + '***' : 'NOT SET'}`);

  if (!BIGIN_EMAIL || !BIGIN_PASSWORD) {
    throw new Error('BIGIN_EMAIL or BIGIN_PASSWORD not set');
  }

  // Navigate to sign-in page
  await page.goto(BIGIN_SIGNIN_URL, {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  // Wait for login form to load
  await page.waitForSelector('#login_id', { timeout: 30000 });
  console.log('   Login form loaded');

  // Step 1: Enter email
  console.log('   Step 1: Entering email...');
  await page.type('#login_id', BIGIN_EMAIL, { delay: 50 });

  // Wait a bit for any validation
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Click Next button
  await page.click('#nextbtn');
  console.log('   Clicked Next button');

  // Wait for password field to appear
  try {
    await page.waitForSelector('#password_container:not(.zeroheight)', { timeout: 15000 });
    // Also wait for the password input to be visible
    await page.waitForFunction(() => {
      const container = document.querySelector('#password_container');
      return container && !container.classList.contains('zeroheight');
    }, { timeout: 15000 });
  } catch (e) {
    // Check if password field is already visible
    const passwordVisible = await page.evaluate(() => {
      const container = document.querySelector('#password_container');
      return container && !container.classList.contains('zeroheight');
    });
    if (!passwordVisible) {
      throw new Error('Password field did not appear after entering email');
    }
  }

  console.log('   Password field appeared');
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Step 2: Enter password
  console.log('   Step 2: Entering password...');
  await page.type('#password', BIGIN_PASSWORD, { delay: 50 });

  // Wait a bit before clicking
  await new Promise(resolve => setTimeout(resolve, 500));

  // Click Sign in button
  await page.click('#nextbtn');
  console.log('   Clicked Sign in button');

  // Wait for navigation or dashboard to appear
  try {
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
      page.waitForSelector('.bigin-home, .bigin-dashboard, .crm-header, [data-module], .zb-header', { timeout: 60000 })
    ]);
  } catch (e) {
    // Check current URL to see if we're logged in
    const currentUrl = page.url();
    console.log('   Current URL after login:', currentUrl);

    // Check for error messages
    const errorMsg = await page.$eval('.fielderror', el => el.textContent).catch(() => null);
    if (errorMsg && errorMsg.trim()) {
      throw new Error(`Login failed: ${errorMsg}`);
    }
  }

  // Verify login success by checking URL
  const currentUrl = page.url();
  if (currentUrl.includes('signin') || currentUrl.includes('login')) {
    // Check for any error message
    const errorMsg = await page.$eval('.fielderror', el => el.textContent).catch(() => '');
    if (errorMsg.trim()) {
      throw new Error(`Login failed: ${errorMsg}`);
    }
    throw new Error('Login may have failed - still on login page');
  }

  console.log('✅ Login successful');
  console.log('   Redirected to:', currentUrl);
  return true;
}

/**
 * Navigate to audit logs page in Bigin
 */
async function navigateToAuditLogs(page) {
  console.log('📍 Navigating to audit logs...');

  // Bigin audit logs are typically at Settings > Audit Log
  // Try different possible URLs
  const auditUrls = [
    'https://bigin.zoho.in/crm/org*/tab/AuditLog',
    'https://bigin.zoho.in/crm/settings/audit-log',
    'https://bigin.zoho.in/crm/tab/AuditLog',
  ];

  // First, let's navigate to settings
  const settingsUrl = 'https://bigin.zoho.in/crm/settings';

  try {
    await page.goto(settingsUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    console.log('   Loaded settings page');
  } catch (e) {
    console.log('   Could not load settings directly, trying from current page');
  }

  // Wait for page to stabilize
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Try to find and click on Audit Log link
  const auditLogClicked = await page.evaluate(() => {
    // Look for audit log links
    const links = document.querySelectorAll('a, div, span, li');
    for (const link of links) {
      const text = link.textContent?.toLowerCase() || '';
      if (text.includes('audit') && text.includes('log')) {
        link.click();
        return true;
      }
    }
    return false;
  });

  if (auditLogClicked) {
    console.log('   Clicked on Audit Log link');
    await new Promise(resolve => setTimeout(resolve, 3000));
    await page.waitForNetworkIdle({ timeout: 15000 }).catch(() => {});
  } else {
    // Try direct navigation to audit log page
    console.log('   Trying direct navigation to audit log...');

    // Get current URL to extract org ID
    const currentUrl = page.url();
    const orgMatch = currentUrl.match(/org(\d+)/);
    const orgId = orgMatch ? orgMatch[1] : '';

    if (orgId) {
      const directUrl = `https://bigin.zoho.in/crm/org${orgId}/tab/AuditLog`;
      await page.goto(directUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      }).catch(() => {});
    }
  }

  console.log('   Current URL:', page.url());
  return true;
}

/**
 * Scrape audit logs from the page
 */
async function scrapeAuditLogs(page) {
  console.log('🔍 Scraping audit logs...');

  // Wait for audit log content to load
  await new Promise(resolve => setTimeout(resolve, 3000));

  const auditLogs = await page.evaluate(() => {
    const logs = [];

    // Try different selectors for audit log table
    const tableSelectors = [
      '.audit-log-table tbody tr',
      '.lyte-table tbody tr',
      '.zc-datatable tbody tr',
      'table tbody tr',
      '.audit-list-item',
      '[data-audit-entry]'
    ];

    let rows = [];
    for (const selector of tableSelectors) {
      rows = document.querySelectorAll(selector);
      if (rows.length > 0) break;
    }

    if (rows.length === 0) {
      // Try to get any visible text content that looks like audit logs
      const content = document.body.innerText;
      console.log('No table found. Page content preview:', content.substring(0, 500));
      return logs;
    }

    rows.forEach((row, index) => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 2) return;

      // Common audit log fields
      const logEntry = {
        id: `audit-${index}`,
        timestamp: cells[0]?.textContent?.trim() || '',
        user: cells[1]?.textContent?.trim() || '',
        action: cells[2]?.textContent?.trim() || '',
        module: cells[3]?.textContent?.trim() || '',
        details: cells[4]?.textContent?.trim() || '',
        ipAddress: '',
        recordId: '',
      };

      // Try to extract more specific data
      const allText = row.textContent || '';

      // Extract IP address if present
      const ipMatch = allText.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
      if (ipMatch) {
        logEntry.ipAddress = ipMatch[1];
      }

      // Only add if we have meaningful data
      if (logEntry.timestamp || logEntry.user || logEntry.action) {
        logs.push(logEntry);
      }
    });

    return logs;
  });

  console.log(`✅ Scraped ${auditLogs.length} audit log entries`);
  return auditLogs;
}

/**
 * Take a screenshot for debugging
 */
async function takeDebugScreenshot(page, filename) {
  try {
    const screenshotPath = `/tmp/${filename}-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`   Screenshot saved: ${screenshotPath}`);
    return screenshotPath;
  } catch (e) {
    console.log('   Could not take screenshot:', e.message);
    return null;
  }
}

/**
 * Main function to scrape Bigin audit logs
 */
export async function scrapeBiginAuditLogs(onProgress) {
  let browser = null;

  try {
    console.log('🚀 Starting Zoho Bigin audit log scrape...');
    onProgress?.(5, 'Launching browser...');

    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-features=IsolateOrigins,site-per-process',
        '--window-size=1920,1080'
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Set user agent to avoid detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Set longer timeouts
    page.setDefaultTimeout(60000);
    page.setDefaultNavigationTimeout(60000);

    // Login
    onProgress?.(10, 'Logging into Zoho Bigin...');
    await login(page);

    // Take screenshot after login for debugging
    await takeDebugScreenshot(page, 'after-login');

    // Navigate to audit logs
    onProgress?.(40, 'Navigating to audit logs...');
    await navigateToAuditLogs(page);

    // Take screenshot of audit page
    await takeDebugScreenshot(page, 'audit-page');

    // Scrape audit logs
    onProgress?.(70, 'Scraping audit log data...');
    const auditLogs = await scrapeAuditLogs(page);

    await browser.close();

    console.log('🎉 Audit log scrape completed!');
    return {
      success: true,
      auditLogs,
      totalCount: auditLogs.length,
      scrapedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('❌ Audit log scrape failed:', error);

    if (browser) {
      await browser.close();
    }

    return {
      success: false,
      auditLogs: [],
      totalCount: 0,
      error: error.message || 'Unknown error',
      scrapedAt: new Date().toISOString(),
    };
  }
}

export default { scrapeBiginAuditLogs };
