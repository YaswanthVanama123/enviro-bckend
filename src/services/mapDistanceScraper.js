/**
 * Map Distance Scraper Service
 * Automates RouteStar website to fetch map distance for a customer
 */

import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.ROUTESTAR_BASE_URL || 'https://emnrv.routestar.online';
const USERNAME = process.env.ROUTESTAR_USERNAME || '';
const PASSWORD = process.env.ROUTESTAR_PASSWORD || '';

// Screenshot directory
const SCREENSHOT_DIR = path.join(__dirname, '../tmp');

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

/**
 * Login to RouteSTAR
 */
async function login(page) {
  console.log('🔐 Logging into RouteStar for Map Distance...');
  console.log(`   URL: ${BASE_URL}/web/login/`);

  if (!USERNAME || !PASSWORD) {
    throw new Error('ROUTESTAR_USERNAME or ROUTESTAR_PASSWORD not set in environment');
  }

  await page.goto(`${BASE_URL}/web/login/`, {
    waitUntil: 'networkidle2',
    timeout: 30000
  });

  // Wait for login form
  await page.waitForSelector('input[name="username"], #username', { timeout: 10000 });

  // Clear and fill username
  const usernameInput = await page.$('input[name="username"], #username');
  await usernameInput.click({ clickCount: 3 });
  await usernameInput.type(USERNAME);

  // Clear and fill password
  const passwordInput = await page.$('input[name="password"], #password');
  await passwordInput.click({ clickCount: 3 });
  await passwordInput.type(PASSWORD);

  // Click login button
  await page.click('button[type="submit"], input[type="submit"], #login-btn, .login-btn');

  // Wait for either redirect or dashboard element to appear
  try {
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
      page.waitForSelector('.dashboard, #dashboard, .main-content, nav, .sidebar', { timeout: 30000 })
    ]);
  } catch (e) {
    const currentUrl = page.url();
    console.log('   Current URL after login attempt:', currentUrl);
  }

  // Verify login success
  const currentUrl = page.url();
  if (currentUrl.includes('/login')) {
    const errorMsg = await page.$eval('.error, .alert-danger, .login-error', el => el.textContent).catch(() => null);
    throw new Error(`Login failed: ${errorMsg || 'Still on login page'}`);
  }

  console.log('✅ Login successful');
  return true;
}

/**
 * Dismiss any modal popups on the page
 */
async function dismissModals(page) {
  console.log('   Attempting to dismiss modals...');

  // Wait a moment for modal to fully render
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Take screenshot before dismissal attempt
  const beforeScreenshot = path.join(SCREENSHOT_DIR, `before_dismiss_${Date.now()}.png`);
  await page.screenshot({ path: beforeScreenshot, fullPage: true });
  console.log(`   Screenshot before dismiss: ${beforeScreenshot}`);

  // Method 1: Use XPath to find CANCEL button by text
  console.log('   Looking for CANCEL button using XPath...');
  try {
    // First, let's diagnose what's on the page
    const pageInfo = await page.evaluate(() => {
      const modals = document.querySelectorAll('.bootbox, .modal');
      const buttons = document.querySelectorAll('button');
      const modalInfo = Array.from(modals).map(m => ({
        classes: m.className,
        visible: m.offsetParent !== null,
        html: m.outerHTML.substring(0, 500)
      }));
      const buttonInfo = Array.from(buttons).map(b => ({
        text: b.innerText || b.textContent,
        classes: b.className,
        visible: b.offsetParent !== null
      }));
      return {
        modalCount: modals.length,
        buttonCount: buttons.length,
        modals: modalInfo,
        buttons: buttonInfo.filter(b => b.text.includes('CANCEL') || b.text.includes('FIX'))
      };
    });
    console.log(`   Page info: ${JSON.stringify(pageInfo, null, 2)}`);

    // If no modals found, skip all dismissal attempts
    if (pageInfo.modalCount === 0 && pageInfo.buttons.length === 0) {
      console.log('   No modals or CANCEL buttons found, skipping dismissal');
      return;
    }

    // Wait for the modal to be visible
    await page.waitForSelector('.bootbox, .modal', { timeout: 3000 }).catch(() => {});

    // Find button with text "CANCEL" using XPath
    const cancelButtonXPath = "//button[contains(text(),'CANCEL')] | //button[contains(text(),'Cancel')]";
    const cancelButtons = await page.$x(cancelButtonXPath);

    if (cancelButtons.length > 0) {
      console.log(`   Found ${cancelButtons.length} CANCEL button(s) via XPath`);
      await cancelButtons[0].click();
      console.log('   Clicked CANCEL button via XPath');
      await new Promise(resolve => setTimeout(resolve, 1000));
    } else {
      console.log('   No CANCEL button found via XPath');
    }
  } catch (e) {
    console.log(`   XPath click failed: ${e.message}`);
  }

  // Method 2: Wait for modal and use page.click with :has-text pseudo selector simulation
  console.log('   Trying direct button click with page.evaluate...');
  const clickResult = await page.evaluate(() => {
    // Get all buttons in the page
    const buttons = Array.from(document.querySelectorAll('button'));
    console.log(`Total buttons: ${buttons.length}`);

    for (const btn of buttons) {
      const text = btn.innerText || btn.textContent || '';
      console.log(`Button: "${text.trim()}"`);

      if (text.trim().toUpperCase() === 'CANCEL') {
        console.log('Found exact CANCEL button!');
        // Multiple click methods
        btn.click();
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        // Also try to trigger jQuery click if available
        if (typeof jQuery !== 'undefined') {
          jQuery(btn).trigger('click');
        }
        return 'clicked-cancel-button';
      }
    }

    // If no CANCEL button, try to close any bootbox modal
    const bootboxModal = document.querySelector('.bootbox');
    if (bootboxModal) {
      // Find the close button in bootbox
      const closeBtn = bootboxModal.querySelector('.bootbox-close-button, .close, [data-dismiss="modal"]');
      if (closeBtn) {
        closeBtn.click();
        return 'clicked-bootbox-close';
      }

      // Try clicking outside to close
      const backdrop = document.querySelector('.modal-backdrop');
      if (backdrop) {
        backdrop.click();
        return 'clicked-backdrop';
      }
    }

    return 'no-cancel-found';
  });
  console.log(`   Click result: ${clickResult}`);

  await new Promise(resolve => setTimeout(resolve, 500));

  // Method 3: Use page.keyboard to simulate Tab + Enter to click the default button
  console.log('   Trying Tab+Enter approach...');
  await page.keyboard.press('Tab');
  await new Promise(resolve => setTimeout(resolve, 100));
  await page.keyboard.press('Enter');
  await new Promise(resolve => setTimeout(resolve, 500));

  // Method 4: Try ESC key
  console.log('   Pressing ESC key...');
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Escape');
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // Method 5: Use exact pixel coordinates based on the screenshot
  // The CANCEL button appears at approximately (690, 444) based on modal position
  console.log('   Trying pixel coordinate click for CANCEL button...');
  try {
    // Get the bounding box of the modal if it exists
    const modalBox = await page.evaluate(() => {
      const modal = document.querySelector('.bootbox, .modal-dialog');
      if (modal) {
        const rect = modal.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }
      return null;
    });

    if (modalBox) {
      // CANCEL button is typically in the bottom-left of the modal footer
      // Footer is usually at the bottom, CANCEL is the left button
      const cancelX = modalBox.x + 120; // About 120px from left of modal
      const cancelY = modalBox.y + modalBox.height - 40; // About 40px from bottom
      console.log(`   Modal at (${modalBox.x}, ${modalBox.y}), clicking at (${cancelX}, ${cancelY})`);
      await page.mouse.click(cancelX, cancelY);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch (e) {
    console.log(`   Coordinate click failed: ${e.message}`);
  }

  // Method 6: Force remove modals from DOM (nuclear option)
  console.log('   Force removing modals from DOM...');
  await page.evaluate(() => {
    // Find and remove all modal-related elements
    const selectors = ['.bootbox', '.modal', '.modal-backdrop', '.modal-open', '.fade'];
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        if (el.tagName !== 'BODY') {
          el.remove();
        }
      });
    });

    // Reset body
    document.body.classList.remove('modal-open');
    document.body.style.cssText = document.body.style.cssText.replace(/overflow[^;]*;?/gi, '').replace(/padding-right[^;]*;?/gi, '');
  });

  await new Promise(resolve => setTimeout(resolve, 500));

  // Take screenshot after all dismissal attempts
  const afterScreenshot = path.join(SCREENSHOT_DIR, `after_all_dismiss_${Date.now()}.png`);
  await page.screenshot({ path: afterScreenshot, fullPage: true });
  console.log(`   Screenshot after all dismiss attempts: ${afterScreenshot}`);

  // Check if modal is still visible and repeat if needed
  const stillHasModal = await page.evaluate(() => {
    return document.querySelector('.bootbox, .modal.show, .modal.in, .modal[style*="display: block"]') !== null;
  });

  if (stillHasModal) {
    console.log('   Modal STILL visible after all attempts!');
    // One more aggressive removal
    await page.evaluate(() => {
      const allModals = document.querySelectorAll('.bootbox, .modal, .modal-backdrop');
      allModals.forEach(m => m.parentNode?.removeChild(m));
    });
  } else {
    console.log('   Modal successfully dismissed!');
  }
}

/**
 * Navigate to Map Distance page
 */
async function navigateToMapDistance(page) {
  console.log('📍 Navigating to Map Distance page...');

  // Inject script to block bootbox modals BEFORE page loads
  await page.evaluateOnNewDocument(() => {
    // Override bootbox.alert and bootbox.dialog to prevent modal popups
    window.addEventListener('DOMContentLoaded', () => {
      if (typeof bootbox !== 'undefined') {
        console.log('Blocking bootbox modals');
        bootbox.alert = () => {};
        bootbox.dialog = () => {};
        bootbox.confirm = () => {};
        bootbox.prompt = () => {};
      }
    });

    // Also try to hide any modals that appear
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            if (node.classList && (node.classList.contains('bootbox') || node.classList.contains('modal'))) {
              console.log('Removing dynamically added modal');
              node.remove();
            }
          }
        });
      });
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  });

  await page.goto(`${BASE_URL}/web/mapdistance/`, {
    waitUntil: 'networkidle2',
    timeout: 30000
  });

  const currentUrl = page.url();
  console.log(`   Current URL: ${currentUrl}`);
  console.log(`   Page title: ${await page.title()}`);

  // Wait for the page to load
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Dismiss any modal popups (QuickBooks modal, etc.)
  await dismissModals(page);

  // Wait a bit more after modal dismissal
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Take screenshot to verify modal is dismissed
  const screenshotPath = path.join(SCREENSHOT_DIR, `after_modal_dismiss_${Date.now()}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`   Screenshot after modal dismiss: ${screenshotPath}`);

  // Wait for the page to load - look for the customer dropdown
  await page.waitForSelector('.select2-selection, #customerSelect', { timeout: 15000 });

  console.log('✅ Map Distance page loaded');
}

/**
 * Search customer and get distance results
 */
async function searchAndGetDistance(page, customerName) {
  console.log(`🔍 Searching for customer: ${customerName}`);

  // Wait a bit for page to fully load
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Dismiss any modal that might have appeared
  await dismissModals(page);

  // Take debug screenshot (should be without modal now)
  const screenshotPath = path.join(SCREENSHOT_DIR, `mapdistance_page_${Date.now()}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`   Debug screenshot saved: ${screenshotPath}`);

  // Find the dropdown - try multiple selectors
  console.log('   Looking for customer dropdown...');

  // Get available form elements for debugging
  const formElements = await page.evaluate(() => {
    const selects = document.querySelectorAll('select');
    const inputs = document.querySelectorAll('input[type="text"], input[type="search"]');
    const select2 = document.querySelectorAll('.select2, .select2-container, [class*="select2"]');

    return {
      selects: Array.from(selects).map(s => ({ id: s.id, name: s.name, classes: s.className })),
      inputs: Array.from(inputs).map(i => ({ id: i.id, name: i.name, placeholder: i.placeholder, classes: i.className })),
      select2: Array.from(select2).map(s => ({ classes: s.className, id: s.id }))
    };
  });
  console.log(`   Form elements: ${JSON.stringify(formElements, null, 2)}`);

  // Try multiple selectors for the dropdown
  const dropdownSelectors = [
    '.select2-selection--single',
    '.select2-selection',
    '.select2-container',
    '#customerSelect + .select2-container',
    '#select2-customerSelect-container',
    'span.select2',
    '[aria-labelledby*="customerSelect"]'
  ];

  let dropdownClicked = false;
  for (const selector of dropdownSelectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        console.log(`   Found dropdown with selector: ${selector}`);
        await element.click();
        dropdownClicked = true;
        await new Promise(resolve => setTimeout(resolve, 1000));
        break;
      }
    } catch (e) {
      // Continue to next selector
    }
  }

  if (!dropdownClicked) {
    // Try clicking directly on the select element or its container
    console.log('   Trying to click on #customerSelect or nearby elements...');
    try {
      // Try clicking using JavaScript
      await page.evaluate(() => {
        // Try to open Select2 programmatically
        const select = document.querySelector('#customerSelect');
        if (select && typeof jQuery !== 'undefined') {
          jQuery(select).select2('open');
          return 'opened-via-jquery';
        }

        // Or click on the container
        const container = document.querySelector('.select2-container, .select2');
        if (container) {
          container.click();
          return 'clicked-container';
        }

        return 'no-element-found';
      });
      dropdownClicked = true;
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e) {
      console.log(`   JavaScript click failed: ${e.message}`);
    }
  }

  // Take screenshot after clicking
  const afterClickScreenshot = path.join(SCREENSHOT_DIR, `mapdistance_afterclick_${Date.now()}.png`);
  await page.screenshot({ path: afterClickScreenshot, fullPage: true });
  console.log(`   After click screenshot saved: ${afterClickScreenshot}`);

  // The Select2 dropdown should now be open with a search field
  // The search field is usually in a dropdown that appears at the bottom of the body
  // Wait for the dropdown to appear
  await page.waitForSelector('.select2-dropdown', { timeout: 5000 }).catch(() => {
    console.log('   Select2 dropdown not found, trying alternative...');
  });

  // Find and type in the search field
  const searchField = await page.$('.select2-search__field');

  if (searchField) {
    console.log(`   Typing customer name in search: ${customerName}`);
    // Clear any existing text and type
    await searchField.click({ clickCount: 3 });
    await searchField.type(customerName, { delay: 50 });

    // Wait for AJAX search results
    console.log('   Waiting for search results...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Take screenshot of search results
    const searchScreenshot = path.join(SCREENSHOT_DIR, `mapdistance_search_${Date.now()}.png`);
    await page.screenshot({ path: searchScreenshot, fullPage: true });
    console.log(`   Search screenshot saved: ${searchScreenshot}`);

    // Look for search results
    const resultOptions = await page.$$('.select2-results__option');
    console.log(`   Found ${resultOptions.length} result options`);

    // Check for actual results (not loading/no results messages)
    const hasValidResult = await page.evaluate(() => {
      const options = document.querySelectorAll('.select2-results__option');
      for (const opt of options) {
        if (!opt.classList.contains('select2-results__message') &&
            !opt.classList.contains('loading-results') &&
            opt.textContent && opt.textContent.trim().length > 0) {
          return true;
        }
      }
      return false;
    });

    if (hasValidResult) {
      console.log('   Clicking on first valid result...');

      // Method 1: Try using Puppeteer to click directly on the option
      const options = await page.$$('.select2-results__option');
      let clicked = false;

      for (const option of options) {
        const isValid = await page.evaluate(el => {
          return !el.classList.contains('select2-results__message') &&
                 !el.classList.contains('loading-results') &&
                 el.textContent && el.textContent.trim().length > 0;
        }, option);

        if (isValid) {
          console.log('   Found valid option, clicking with Puppeteer...');
          await option.click();
          clicked = true;
          await new Promise(resolve => setTimeout(resolve, 1000));
          break;
        }
      }

      // Method 2: If Puppeteer click didn't work, try keyboard navigation
      if (!clicked) {
        console.log('   Trying keyboard navigation (Enter key)...');
        await page.keyboard.press('ArrowDown');
        await new Promise(resolve => setTimeout(resolve, 200));
        await page.keyboard.press('Enter');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Method 3: Try mousedown/mouseup events via JavaScript
      const selectionResult = await page.evaluate(() => {
        const options = document.querySelectorAll('.select2-results__option');
        for (const opt of options) {
          if (!opt.classList.contains('select2-results__message') &&
              !opt.classList.contains('loading-results') &&
              opt.textContent && opt.textContent.trim().length > 0) {

            // Try multiple event types
            opt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            opt.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            opt.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            // Also try triggering select2 selection directly
            if (typeof jQuery !== 'undefined') {
              const select = document.querySelector('#customerSelect');
              if (select) {
                const value = opt.getAttribute('data-select2-id') || opt.getAttribute('id');
                if (value) {
                  // Extract the actual value from the option
                  const optionId = opt.id || '';
                  const match = optionId.match(/select2-customerSelect-result-([a-z0-9]+)-(\d+)/i);
                  if (match) {
                    jQuery(select).val(match[2]).trigger('change');
                    return `jquery-val: ${match[2]}`;
                  }
                }
              }
            }
            return `events-dispatched: ${opt.textContent.trim().substring(0, 50)}`;
          }
        }
        return 'no-valid-option';
      });
      console.log(`   Selection result: ${selectionResult}`);

      await new Promise(resolve => setTimeout(resolve, 1000));
    } else {
      console.log('   No valid results found in dropdown');
      // Press Escape to close dropdown
      await page.keyboard.press('Escape');
    }
  } else {
    console.log('   No search field found');
  }

  // Take screenshot after selection
  const afterSelectScreenshot = path.join(SCREENSHOT_DIR, `mapdistance_afterselect_${Date.now()}.png`);
  await page.screenshot({ path: afterSelectScreenshot, fullPage: true });
  console.log(`   After select screenshot saved: ${afterSelectScreenshot}`);

  // Check what's selected now
  const selectedText = await page.$eval('.select2-selection__rendered', el => el.textContent).catch(() => 'none');
  console.log(`   Selected customer: ${selectedText}`);

  // Verify selection worked - if still showing placeholder, try again
  if (selectedText === 'Search Customers' || selectedText === 'none' || !selectedText.includes(customerName.split(' ')[0])) {
    console.log('   Selection may have failed, trying alternative method...');

    // Try using keyboard to select
    await page.click('.select2-selection--single');
    await new Promise(resolve => setTimeout(resolve, 500));

    const searchField2 = await page.$('.select2-search__field');
    if (searchField2) {
      await searchField2.type(customerName, { delay: 30 });
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Press Enter to select the first result
      await page.keyboard.press('Enter');
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check selection again
      const selectedText2 = await page.$eval('.select2-selection__rendered', el => el.textContent).catch(() => 'none');
      console.log(`   After retry - Selected customer: ${selectedText2}`);
    }
  }

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Click the "Get Distance" button
  console.log('   Clicking Get Distance button...');
  await page.click('#getDistanceBtn');

  // Wait for form submission and results to load
  console.log('   Waiting for results...');
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {
    console.log('   No navigation occurred, results might already be loaded');
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  // Dismiss any modal that might have appeared after submission
  await dismissModals(page);

  // Take screenshot of results
  const resultsScreenshot = path.join(SCREENSHOT_DIR, `mapdistance_results_${Date.now()}.png`);
  await page.screenshot({ path: resultsScreenshot, fullPage: true });
  console.log(`   Results screenshot saved: ${resultsScreenshot}`);

  // Extract results from the table
  const results = await page.evaluate(() => {
    // Try to find the data table
    let dataTable = document.querySelector('table.table');
    if (!dataTable) {
      dataTable = document.querySelector('.dataTable');
    }
    if (!dataTable) {
      dataTable = document.querySelector('table');
    }

    if (!dataTable) {
      return { debug: 'No table found', results: [] };
    }

    const rows = dataTable.querySelectorAll('tbody tr');
    const extractedResults = Array.from(rows).map(row => {
      const cells = row.querySelectorAll('td');

      // Check if this is a "no data" row
      if (cells.length === 1 && row.textContent.includes('No data')) {
        return null;
      }

      if (cells.length < 6) return null;

      return {
        assignedTo: cells[0]?.textContent?.trim() || '',
        frequency: cells[1]?.textContent?.trim() || '',
        date: cells[2]?.textContent?.trim() || '',
        customer: cells[3]?.textContent?.trim() || '',
        day: cells[4]?.textContent?.trim() || '',
        stop: cells[5]?.textContent?.trim() || '',
        distance: cells[6]?.textContent?.trim() || '',
      };
    }).filter(r => r !== null && (r.customer || r.assignedTo));

    return {
      debug: `Found ${rows.length} rows in table`,
      tableClasses: dataTable.className,
      results: extractedResults
    };
  });

  console.log(`   Table debug: ${results.debug}`);
  console.log(`   Table classes: ${results.tableClasses || 'none'}`);
  console.log(`✅ Found ${results.results?.length || 0} distance results`);

  return results.results || [];
}

/**
 * Main function - fetch map distance for a customer
 */
export async function getMapDistance(customerName, onProgress) {
  let browser = null;

  try {
    console.log('🚀 Starting Map Distance fetch...');
    onProgress?.(5, 'Launching browser...');

    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-features=IsolateOrigins,site-per-process'
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);

    // Login
    onProgress?.(15, 'Logging into RouteStar...');
    await login(page);

    // Navigate to Map Distance page
    onProgress?.(40, 'Navigating to Map Distance page...');
    await navigateToMapDistance(page);

    // Search and get results
    onProgress?.(60, `Searching for ${customerName}...`);
    const results = await searchAndGetDistance(page, customerName);

    await browser.close();

    onProgress?.(100, 'Complete');
    console.log('🎉 Map Distance fetch completed successfully!');

    return {
      success: true,
      data: results,
      customerName,
      fetchedAt: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Map Distance fetch failed:', error);

    if (browser) {
      await browser.close();
    }

    return {
      success: false,
      data: [],
      customerName,
      error: error.message || 'Unknown error',
      fetchedAt: new Date().toISOString()
    };
  }
}

export default { getMapDistance };
