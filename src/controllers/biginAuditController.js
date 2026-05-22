/**
 * Bigin Audit Log Controller
 * Handles fetching and managing audit logs from Zoho Bigin
 */

import BiginAuditLog from "../models/BiginAuditLog.js";
import BiginScrapeSession from "../models/BiginScrapeSession.js";
import { scrapeBiginAuditLogs } from "../services/biginAuditScraper.js";
import { v4 as uuidv4 } from "uuid";
import { parse } from "csv-parse/sync";

// Track scrape status in memory
let scrapeStatus = {
  isRunning: false,
  lastScrapeAt: null,
  lastScrapeResult: null,
  progress: 0,
  message: "",
  currentSessionId: null,
};

/**
 * Get all audit logs with pagination and filters
 */
export const getAllAuditLogs = async (req, res) => {
  try {
    const {
      search,
      user,
      action,
      module,
      startDate,
      endDate,
      limit = 50,
      skip = 0,
    } = req.query;

    const filter = {};

    if (search) {
      filter.$or = [
        { user: { $regex: search, $options: "i" } },
        { action: { $regex: search, $options: "i" } },
        { module: { $regex: search, $options: "i" } },
        { details: { $regex: search, $options: "i" } },
        { recordName: { $regex: search, $options: "i" } },
      ];
    }
    if (user) filter.user = { $regex: user, $options: "i" };
    if (action) filter.action = { $regex: action, $options: "i" };
    if (module) filter.module = { $regex: module, $options: "i" };
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate);
      if (endDate) filter.timestamp.$lte = new Date(endDate);
    }

    const total = await BiginAuditLog.countDocuments(filter);
    const logs = await BiginAuditLog.find(filter)
      .sort({ timestamp: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: logs,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
        hasMore: parseInt(skip) + logs.length < total,
      },
    });
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch audit logs",
    });
  }
};

/**
 * Get audit log by ID
 */
export const getAuditLogById = async (req, res) => {
  try {
    const { id } = req.params;

    const log = await BiginAuditLog.findById(id);

    if (!log) {
      return res.status(404).json({
        success: false,
        error: "Audit log not found",
      });
    }

    res.json({
      success: true,
      data: log,
    });
  } catch (error) {
    console.error("Error fetching audit log:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch audit log",
    });
  }
};

/**
 * Get scrape status
 */
export const getScrapeStatus = async (req, res) => {
  try {
    const totalLogs = await BiginAuditLog.countDocuments();
    const latestLog = await BiginAuditLog.findOne().sort({ timestamp: -1 });
    const lastSession = await BiginScrapeSession.findOne().sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        ...scrapeStatus,
        totalLogs,
        latestLogTimestamp: latestLog?.timestamp || null,
        lastSession: lastSession ? {
          sessionId: lastSession.sessionId,
          status: lastSession.status,
          logsScraped: lastSession.logsScraped,
          completedAt: lastSession.completedAt,
        } : null,
      },
    });
  } catch (error) {
    console.error("Error getting scrape status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get scrape status",
    });
  }
};

/**
 * Start audit log scrape from Bigin
 */
export const startScrape = async (req, res) => {
  try {
    if (scrapeStatus.isRunning) {
      return res.status(400).json({
        success: false,
        error: "Scrape already in progress",
      });
    }

    const sessionId = uuidv4();

    // Create session record
    await BiginScrapeSession.create({
      sessionId,
      status: "running",
      startedAt: new Date(),
      triggeredBy: req.user?.email || "manual",
    });

    // Set scrape status to running
    scrapeStatus = {
      isRunning: true,
      lastScrapeAt: scrapeStatus.lastScrapeAt,
      lastScrapeResult: null,
      progress: 0,
      message: "Starting scrape...",
      currentSessionId: sessionId,
    };

    // Respond immediately
    res.json({
      success: true,
      message: "Scrape started",
      data: {
        sessionId,
        ...scrapeStatus,
      },
    });

    // Run scraper in background (don't await)
    runScrapeInBackground(sessionId);
  } catch (error) {
    console.error("Error starting scrape:", error);
    scrapeStatus.isRunning = false;
    res.status(500).json({
      success: false,
      error: "Failed to start scrape",
    });
  }
};

/**
 * Run the scrape process in background
 */
async function runScrapeInBackground(sessionId) {
  try {
    console.log("🚀 Starting Bigin audit log scrape...");

    // Progress callback
    const onProgress = (progress, message) => {
      scrapeStatus.progress = progress;
      scrapeStatus.message = message;

      // Update session progress
      BiginScrapeSession.updateOne(
        { sessionId },
        { progress, progressMessage: message }
      ).catch(() => {});
    };

    // Run the scraper
    const result = await scrapeBiginAuditLogs(onProgress);

    if (!result.success) {
      throw new Error(result.error || "Scrape failed");
    }

    // Save audit logs to database
    scrapeStatus.message = `Saving ${result.auditLogs.length} audit logs...`;
    scrapeStatus.progress = 80;

    const savedCount = await saveAuditLogsToDatabase(result.auditLogs, sessionId);

    // Update final status
    scrapeStatus.isRunning = false;
    scrapeStatus.lastScrapeAt = new Date();
    scrapeStatus.lastScrapeResult = "success";
    scrapeStatus.progress = 100;
    scrapeStatus.message = `Scraped ${result.auditLogs.length} logs, saved ${savedCount}`;
    scrapeStatus.currentSessionId = null;

    // Update session record
    await BiginScrapeSession.updateOne(
      { sessionId },
      {
        status: "completed",
        progress: 100,
        progressMessage: scrapeStatus.message,
        logsScraped: result.auditLogs.length,
        logsStored: savedCount,
        completedAt: new Date(),
      }
    );

    console.log(`✅ Scrape completed: ${result.auditLogs.length} logs`);
  } catch (error) {
    console.error("❌ Scrape failed:", error);
    scrapeStatus.isRunning = false;
    scrapeStatus.lastScrapeAt = new Date();
    scrapeStatus.lastScrapeResult = "failed";
    scrapeStatus.progress = 0;
    scrapeStatus.message = error.message || "Scrape failed";
    scrapeStatus.currentSessionId = null;

    // Update session record
    await BiginScrapeSession.updateOne(
      { sessionId },
      {
        status: "failed",
        error: error.message,
        completedAt: new Date(),
      }
    ).catch(() => {});
  }
}

/**
 * Save scraped audit logs to database
 */
async function saveAuditLogsToDatabase(auditLogs, sessionId) {
  console.log(`💾 Saving ${auditLogs.length} audit logs to database...`);

  let saved = 0;
  let skipped = 0;

  for (const log of auditLogs) {
    try {
      // Parse timestamp
      let timestamp = new Date();
      if (log.timestamp) {
        const parsed = new Date(log.timestamp);
        if (!isNaN(parsed.getTime())) {
          timestamp = parsed;
        }
      }

      const logData = {
        biginId: log.id || null,
        timestamp,
        user: log.user || "Unknown",
        userEmail: log.userEmail || null,
        action: log.action || "Unknown",
        module: log.module || null,
        recordName: log.recordName || null,
        recordId: log.recordId || null,
        details: log.details || null,
        ipAddress: log.ipAddress || null,
        rawData: log,
        scrapeSessionId: sessionId,
        scrapedAt: new Date(),
      };

      // Check for duplicate by biginId or timestamp+user+action combination
      const existingFilter = log.id
        ? { biginId: log.id }
        : {
            timestamp,
            user: logData.user,
            action: logData.action,
            module: logData.module,
          };

      const existing = await BiginAuditLog.findOne(existingFilter);

      if (!existing) {
        await BiginAuditLog.create(logData);
        saved++;
      } else {
        skipped++;
      }
    } catch (err) {
      console.error(`Error saving audit log:`, err.message);
    }
  }

  console.log(`✅ Save complete: ${saved} new, ${skipped} skipped (duplicates)`);
  return saved;
}

/**
 * Get audit log statistics
 */
export const getAuditStats = async (req, res) => {
  try {
    const total = await BiginAuditLog.countDocuments();

    // Get unique users
    const users = await BiginAuditLog.distinct("user");

    // Get unique actions
    const actions = await BiginAuditLog.distinct("action");

    // Get unique modules
    const modules = await BiginAuditLog.distinct("module");

    // Get logs from last 24 hours
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const last24Hours = await BiginAuditLog.countDocuments({
      timestamp: { $gte: oneDayAgo },
    });

    // Get logs from last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const last7Days = await BiginAuditLog.countDocuments({
      timestamp: { $gte: sevenDaysAgo },
    });

    // Get action breakdown
    const actionBreakdown = await BiginAuditLog.aggregate([
      { $group: { _id: "$action", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    // Get user activity breakdown
    const userBreakdown = await BiginAuditLog.aggregate([
      { $group: { _id: "$user", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    res.json({
      success: true,
      data: {
        total,
        uniqueUsers: users.length,
        uniqueActions: actions.length,
        uniqueModules: modules.length,
        last24Hours,
        last7Days,
        users: users.filter((u) => u).sort(),
        actions: actions.filter((a) => a).sort(),
        modules: modules.filter((m) => m).sort(),
        actionBreakdown: actionBreakdown.map((a) => ({
          action: a._id || "Unknown",
          count: a.count,
        })),
        userBreakdown: userBreakdown.map((u) => ({
          user: u._id || "Unknown",
          count: u.count,
        })),
      },
    });
  } catch (error) {
    console.error("Error getting audit stats:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get audit stats",
    });
  }
};

/**
 * Get scrape session history
 */
export const getScrapeHistory = async (req, res) => {
  try {
    const { limit = 10, skip = 0 } = req.query;

    const total = await BiginScrapeSession.countDocuments();
    const sessions = await BiginScrapeSession.find()
      .sort({ createdAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: sessions,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
        hasMore: parseInt(skip) + sessions.length < total,
      },
    });
  } catch (error) {
    console.error("Error getting scrape history:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get scrape history",
    });
  }
};

/**
 * Upload and parse CSV file with audit logs
 * CSV columns: Done By, Action, Module, Record Name, Related Module, Related Name, Account Name, Audited Time, Pipeline
 */
export const uploadCsv = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No CSV file provided",
      });
    }

    console.log("📤 Processing CSV upload...");

    // Parse CSV content
    const csvContent = req.file.buffer.toString("utf-8");

    let records;
    try {
      records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        error: "Failed to parse CSV file: " + parseError.message,
      });
    }

    if (!records || records.length === 0) {
      return res.status(400).json({
        success: false,
        error: "CSV file is empty or has no valid rows",
      });
    }

    console.log(`📊 Found ${records.length} rows in CSV`);

    // Create upload session
    const sessionId = uuidv4();
    await BiginScrapeSession.create({
      sessionId,
      status: "completed",
      startedAt: new Date(),
      completedAt: new Date(),
      triggeredBy: "csv-upload",
      logsScraped: records.length,
    });

    // Map CSV columns to our schema
    // CSV columns: Done By, Action, Module, Record Name, Related Module, Related Name, Account Name, Audited Time, Pipeline
    let saved = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of records) {
      try {
        // Get values from CSV columns (handle various column name formats)
        const doneBy = row["Done By"] || row["DoneBy"] || row["done by"] || row["User"] || "";
        const action = row["Action"] || row["action"] || "";
        const module = row["Module"] || row["module"] || "";
        const recordName = row["Record Name"] || row["RecordName"] || row["record name"] || "";
        const relatedModule = row["Related Module"] || row["RelatedModule"] || row["related module"] || "";
        const relatedName = row["Related Name"] || row["RelatedName"] || row["related name"] || "";
        const accountName = row["Account Name"] || row["AccountName"] || row["account name"] || "";
        const auditedTime = row["Audited Time"] || row["AuditedTime"] || row["audited time"] || row["Audited"] || row["Time"] || "";
        const pipeline = row["Pipeline"] || row["pipeline"] || "";

        // Skip rows without essential data
        if (!doneBy && !action) {
          skipped++;
          continue;
        }

        // Parse timestamp - handle format like "05/21/2026 12:49 PM"
        let timestamp = new Date();
        if (auditedTime) {
          const parsed = parseAuditedTime(auditedTime);
          if (parsed && !isNaN(parsed.getTime())) {
            timestamp = parsed;
          }
        }

        // Build details string from related info
        let details = "";
        if (relatedName) {
          details = relatedName;
        }
        if (accountName && accountName !== relatedName) {
          details = details ? `${details} | Account: ${accountName}` : `Account: ${accountName}`;
        }
        if (pipeline) {
          details = details ? `${details} | Pipeline: ${pipeline}` : `Pipeline: ${pipeline}`;
        }

        const logData = {
          biginId: null,
          timestamp,
          user: doneBy || "Unknown",
          userEmail: null,
          action: action || "Unknown",
          module: module || null,
          recordName: recordName || null,
          recordId: null,
          details: details || null,
          ipAddress: null,
          rawData: {
            doneBy,
            action,
            module,
            recordName,
            relatedModule,
            relatedName,
            accountName,
            auditedTime,
            pipeline,
          },
          scrapeSessionId: sessionId,
          scrapedAt: new Date(),
        };

        // Check for duplicate by timestamp+user+action+module+recordName
        const existingFilter = {
          timestamp,
          user: logData.user,
          action: logData.action,
          module: logData.module,
          recordName: logData.recordName,
        };

        const existing = await BiginAuditLog.findOne(existingFilter);

        if (!existing) {
          await BiginAuditLog.create(logData);
          saved++;
        } else {
          skipped++;
        }
      } catch (err) {
        console.error("Error processing CSV row:", err.message);
        errors++;
      }
    }

    // Update session with final counts
    await BiginScrapeSession.updateOne(
      { sessionId },
      {
        logsStored: saved,
        progressMessage: `Imported ${saved} logs, ${skipped} skipped, ${errors} errors`,
      }
    );

    console.log(`✅ CSV upload complete: ${saved} saved, ${skipped} skipped, ${errors} errors`);

    res.json({
      success: true,
      message: `Successfully imported ${saved} audit logs`,
      data: {
        totalRows: records.length,
        saved,
        skipped,
        errors,
        sessionId,
      },
    });
  } catch (error) {
    console.error("Error uploading CSV:", error);
    res.status(500).json({
      success: false,
      error: "Failed to process CSV file: " + error.message,
    });
  }
};

/**
 * Parse audited time from various formats
 * Handles formats like: "05/21/2026 12:49 PM", "05/21/20", "2026-05-21T12:49:00"
 */
function parseAuditedTime(timeStr) {
  if (!timeStr) return null;

  // Try standard Date parsing first
  let parsed = new Date(timeStr);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  // Try MM/DD/YYYY HH:MM AM/PM format
  const match = timeStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (match) {
    let [, month, day, year, hours, minutes, ampm] = match;

    // Handle 2-digit year
    if (year.length === 2) {
      year = parseInt(year) > 50 ? `19${year}` : `20${year}`;
    }

    hours = parseInt(hours);
    if (ampm) {
      if (ampm.toUpperCase() === "PM" && hours !== 12) {
        hours += 12;
      } else if (ampm.toUpperCase() === "AM" && hours === 12) {
        hours = 0;
      }
    }

    return new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      hours,
      parseInt(minutes)
    );
  }

  // Try MM/DD/YY format (date only)
  const dateOnly = timeStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (dateOnly) {
    let [, month, day, year] = dateOnly;
    if (year.length === 2) {
      year = parseInt(year) > 50 ? `19${year}` : `20${year}`;
    }
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }

  return null;
}
