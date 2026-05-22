/**
 * Zoho Bigin Audit Log Scraper Service
 * Scrapes audit history from Zoho Bigin using Puppeteer
 * Stops when it reaches logs already in our database
 */

import puppeteer from 'puppeteer';
import BiginAuditLog from '../models/BiginAuditLog.js';

const BIGIN_AUDIT_URL = 'https://bigin.zoho.in/bigin/Home#/settings/audit-log';
const BIGIN_SIGNIN_URL = 'https://accounts.zoho.in/signin?servicename=ZohoBigin&signupurl=https://www.bigin.com/signup.html';
const BIGIN_EMAIL = process.env.BIGIN_EMAIL || 'hvanama@enviromasternva.com';
const BIGIN_PASSWORD = process.env.BIGIN_PASSWORD || 'Satyavani@970';

/**
 * Get the most recent audit log timestamp from our database
 */
async function getLatestStoredLogTimestamp() {
  const latestLog = await BiginAuditLog.findOne({})
    .sort({ timestamp: -1 })
    .select('timestamp user action recordName')
    .lean();

  if (latestLog) {
    console.log('📅 Latest stored log:', {
      timestamp: latestLog.timestamp,
      user: latestLog.user,
      action: latestLog.action,
      recordName: latestLog.recordName
    });
  }

  return latestLog;
}

/**
 * Check if a log entry already exists in our database
 * Uses time range to handle slight timestamp differences
 */
async function logExistsInDatabase(timestamp, user, action, recordName) {
  // Look for logs within 1 minute of this timestamp with same user/action
  const timeStart = new Date(timestamp.getTime() - 60000); // 1 minute before
  const timeEnd = new Date(timestamp.getTime() + 60000); // 1 minute after

  const filter = {
    timestamp: { $gte: timeStart, $lte: timeEnd },
    user: user.trim(),
    action: action.trim(),
  };

  // Add recordName to filter if it exists
  if (recordName) {
    filter.recordName = recordName.trim();
  }

  const exists = await BiginAuditLog.findOne(filter).lean();
  return !!exists;
}

/**
 * Parse date string from timeline (handles "Yesterday", "Today", "May 20, 2026", etc.)
 */
function parseTimelineDate(dateHeader, timeStr) {
  const now = new Date();
  let dateObj;

  if (dateHeader.toLowerCase() === 'today') {
    dateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (dateHeader.toLowerCase() === 'yesterday') {
    dateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  } else {
    // Parse "May 20, 2026" format
    dateObj = new Date(dateHeader);
  }

  // Parse time "12:09 PM"
  if (timeStr) {
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2]);
      const ampm = timeMatch[3].toUpperCase();

      if (ampm === 'PM' && hours !== 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;

      dateObj.setHours(hours, minutes, 0, 0);
    }
  }

  return dateObj;
}

/**
 * Parse action text to extract action type, module, and record name
 */
function parseActionText(actionText) {
  // Examples:
  // "Mark Lineberry added a note for Event CONF: Mark/True Food..."
  // "Lisa Rothwell updated a Event Mark/Glory Days/..."
  // "Heather Hartwell added a Company Urban Air - Woodbridge"

  const result = {
    user: '',
    action: '',
    module: '',
    recordName: ''
  };

  // Extract user name (first bold span)
  const userMatch = actionText.match(/^([A-Za-z\s]+?)\s+(added|updated|deleted|sent|created|removed)/i);
  if (userMatch) {
    result.user = userMatch[1].trim();
  }

  // Extract action type
  if (actionText.includes('added a note')) {
    result.action = 'Added Note';
  } else if (actionText.includes('updated a note')) {
    result.action = 'Updated Note';
  } else if (actionText.includes('added a file')) {
    result.action = 'Added File';
  } else if (actionText.includes('sent an email')) {
    result.action = 'Sent Email';
  } else if (actionText.includes('added a')) {
    result.action = 'Added';
  } else if (actionText.includes('updated a')) {
    result.action = 'Updated';
  } else if (actionText.includes('deleted a')) {
    result.action = 'Deleted';
  }

  // Extract module
  const modulePatterns = [
    /for (Pipeline|Event|Contact|Company|Task|Call|Note|Product)/i,
    /(added|updated|deleted) a (Pipeline|Event|Contact|Company|Task|Call|Note|Product|Sales Pipeline Deal|File)/i
  ];

  for (const pattern of modulePatterns) {
    const match = actionText.match(pattern);
    if (match) {
      result.module = match[match.length - 1];
      break;
    }
  }

  return result;
}

/**
 * Login to Zoho Bigin
 */
async function login(page) {
  console.log('🔐 Logging into Zoho Bigin...');

  if (!BIGIN_EMAIL || !BIGIN_PASSWORD) {
    throw new Error('BIGIN_EMAIL or BIGIN_PASSWORD not set');
  }

  await page.goto(BIGIN_SIGNIN_URL, {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  await page.waitForSelector('#login_id', { timeout: 30000 });
  console.log('   Login form loaded');

  // Enter email
  await page.type('#login_id', BIGIN_EMAIL, { delay: 50 });
  await new Promise(resolve => setTimeout(resolve, 1000));
  await page.click('#nextbtn');
  console.log('   Entered email, clicked Next');

  // Wait for password field
  await page.waitForFunction(() => {
    const container = document.querySelector('#password_container');
    return container && !container.classList.contains('zeroheight');
  }, { timeout: 15000 });

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Enter password
  await page.type('#password', BIGIN_PASSWORD, { delay: 50 });
  await new Promise(resolve => setTimeout(resolve, 500));
  await page.click('#nextbtn');
  console.log('   Entered password, clicked Sign in');

  // Wait for navigation
  await Promise.race([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
    page.waitForSelector('.bigin-home, .bigin-dashboard, .crm-header, [data-module], .zb-header', { timeout: 60000 })
  ]).catch(() => {});

  const currentUrl = page.url();
  if (currentUrl.includes('signin') || currentUrl.includes('login')) {
    throw new Error('Login may have failed - still on login page');
  }

  console.log('✅ Login successful');
  return true;
}

/**
 * Navigate to audit logs page
 */
async function navigateToAuditLogs(page) {
  console.log('📍 Navigating to audit logs...');

  await page.goto(BIGIN_AUDIT_URL, {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  // Wait for timeline to load
  await page.waitForSelector('.detail-timeline-wrap, .audit-log-timeline-wrapper, zt-timeline', {
    timeout: 30000
  }).catch(() => {});

  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('   Audit log page loaded');
  return true;
}

/**
 * Scrape visible audit logs from the timeline
 */
async function scrapeVisibleLogs(page) {
  return await page.evaluate(() => {
    const logs = [];
    let currentDateHeader = '';

    const timelineBoxes = document.querySelectorAll('.detail-timeline-box');

    timelineBoxes.forEach(box => {
      // Check for date header
      const dateHeader = box.querySelector('.detail-timeline-head');
      if (dateHeader) {
        currentDateHeader = dateHeader.textContent.trim();
      }

      // Get timeline row
      const row = box.querySelector('.detail-timeline-row');
      if (!row) return;

      const timeEl = row.querySelector('.detail-timeline-left');
      const descEl = row.querySelector('.detail-timeline-desc');

      if (!timeEl || !descEl) return;

      const time = timeEl.textContent.trim();
      const descHead = descEl.querySelector('.timeline-desc-head');
      if (!descHead) return;

      // Get user name
      const userEl = descHead.querySelector('.fw-semi');
      const user = userEl ? userEl.textContent.trim() : '';

      // Get full action text
      const fullText = descHead.textContent.trim();

      // Get record name from link
      const linkEl = descHead.querySelector('a');
      const recordName = linkEl ? linkEl.textContent.trim() : '';
      const recordHref = linkEl ? linkEl.getAttribute('href') : '';

      // Extract record ID from href if available
      let recordId = '';
      if (recordHref) {
        const idMatch = recordHref.match(/\/(\d+)$/);
        if (idMatch) recordId = idMatch[1];
      }

      // Parse action
      let action = '';
      let module = '';

      if (fullText.includes('added a note')) {
        action = 'Added Note';
      } else if (fullText.includes('updated a note')) {
        action = 'Updated Note';
      } else if (fullText.includes('added a file')) {
        action = 'Added File';
      } else if (fullText.includes('sent an email')) {
        action = 'Sent Email';
      } else if (fullText.includes('added a')) {
        action = 'Added';
      } else if (fullText.includes('updated a')) {
        action = 'Updated';
      } else if (fullText.includes('deleted')) {
        action = 'Deleted';
      }

      // Extract module
      const moduleMatch = fullText.match(/(Pipeline|Event|Contact|Company|Task|Call|Note|Product|Sales Pipeline Deal)/i);
      if (moduleMatch) {
        module = moduleMatch[1];
      }

      logs.push({
        dateHeader: currentDateHeader,
        time,
        user,
        action,
        module,
        recordName,
        recordId,
        fullText
      });
    });

    return logs;
  });
}

/**
 * Click "View More" button to load more logs
 */
async function clickViewMore(page) {
  const clicked = await page.evaluate(() => {
    const viewMoreBtn = document.querySelector('lyte-button[data-zcqa="loadTimelineMoreOption"] button');
    if (viewMoreBtn && viewMoreBtn.offsetParent !== null) {
      viewMoreBtn.click();
      return true;
    }
    return false;
  });

  if (clicked) {
    // Wait for new content to load
    await new Promise(resolve => setTimeout(resolve, 2000));
    await page.waitForNetworkIdle({ timeout: 10000 }).catch(() => {});
  }

  return clicked;
}

/**
 * Main function to scrape Bigin audit logs
 * Stops when it reaches logs that already exist in our database
 */
export async function scrapeBiginAuditLogs(onProgress) {
  let browser = null;
  const newLogs = [];
  let reachedExisting = false;
  let totalScraped = 0;
  let viewMoreClicks = 0;
  const MAX_VIEW_MORE_CLICKS = 50; // Safety limit

  try {
    console.log('🚀 Starting Zoho Bigin audit log scrape...');
    onProgress?.(5, 'Launching browser...');

    // Get latest stored log to know when to stop
    const latestStored = await getLatestStoredLogTimestamp();

    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1920,1080'
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    page.setDefaultTimeout(60000);

    // Login
    onProgress?.(10, 'Logging into Zoho Bigin...');
    await login(page);

    // Navigate to audit logs
    onProgress?.(30, 'Navigating to audit logs...');
    await navigateToAuditLogs(page);

    // Scrape logs, clicking "View More" until we reach existing records
    onProgress?.(40, 'Scraping audit logs...');

    const seenLogs = new Set(); // Track seen logs to avoid duplicates

    while (!reachedExisting && viewMoreClicks < MAX_VIEW_MORE_CLICKS) {
      const visibleLogs = await scrapeVisibleLogs(page);
      console.log(`   Found ${visibleLogs.length} visible logs`);

      for (const log of visibleLogs) {
        // Create unique key for this log
        const logKey = `${log.dateHeader}|${log.time}|${log.user}|${log.action}|${log.recordName}`;

        if (seenLogs.has(logKey)) continue;
        seenLogs.add(logKey);

        // Parse the timestamp
        const timestamp = parseTimelineDate(log.dateHeader, log.time);

        // Check if this log exists in our database
        if (latestStored) {
          const existsInDb = await logExistsInDatabase(
            timestamp,
            log.user,
            log.action,
            log.recordName || null
          );

          if (existsInDb) {
            console.log(`   ✅ Found existing log - stopping scrape`);
            console.log(`      Log: ${log.user} - ${log.action} - ${log.recordName}`);
            reachedExisting = true;
            break;
          }
        }

        // Add to new logs
        newLogs.push({
          timestamp,
          user: log.user,
          action: log.action,
          module: log.module || null,
          recordName: log.recordName || null,
          recordId: log.recordId || null,
          details: log.fullText,
          rawData: log
        });

        totalScraped++;
      }

      if (reachedExisting) break;

      // Click "View More" to load more logs
      const moreAvailable = await clickViewMore(page);
      if (!moreAvailable) {
        console.log('   No more logs to load');
        break;
      }

      viewMoreClicks++;
      const progress = Math.min(40 + (viewMoreClicks * 2), 90);
      onProgress?.(progress, `Loaded ${totalScraped} new logs... (click ${viewMoreClicks})`);

      console.log(`   Clicked View More (${viewMoreClicks}), total new logs: ${totalScraped}`);
    }

    await browser.close();
    browser = null;

    console.log(`🎉 Scrape completed! Found ${newLogs.length} new audit logs`);

    return {
      success: true,
      auditLogs: newLogs,
      totalCount: newLogs.length,
      reachedExisting,
      viewMoreClicks,
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
