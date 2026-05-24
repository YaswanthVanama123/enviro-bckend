/**
 * Bigin Audit Log Controller
 * Handles fetching and managing audit logs from Zoho Bigin
 */

import BiginAuditLog from "../models/BiginAuditLog.js";
import BiginScrapeSession from "../models/BiginScrapeSession.js";
import CustomerHeaderDoc from "../models/CustomerHeaderDoc.js";
import ZohoMapping from "../models/ZohoMapping.js";
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
      pipeline,
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
    if (pipeline) {
      // Search for pipeline in multiple fields
      filter.$or = filter.$or || [];
      const pipelineConditions = [
        { "rawData.pipeline": { $regex: pipeline, $options: "i" } },
        { details: { $regex: `Pipeline:\\s*${pipeline}`, $options: "i" } },
        { module: { $regex: pipeline, $options: "i" } },
      ];
      // If there's already an $or from search, we need to combine with $and
      if (filter.$or.length > 0) {
        const existingOr = filter.$or;
        delete filter.$or;
        filter.$and = [
          { $or: existingOr },
          { $or: pipelineConditions }
        ];
      } else {
        filter.$or = pipelineConditions;
      }
    }
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
 * Only stores Lisa Rothwell's records
 */
async function saveAuditLogsToDatabase(auditLogs, sessionId) {
  console.log(`💾 Processing ${auditLogs.length} audit logs (storing only Lisa Rothwell's records)...`);

  let saved = 0;
  let skipped = 0;
  let skippedNonLisa = 0;

  for (const log of auditLogs) {
    try {
      // Get user name
      const userName = (log.user || "Unknown").trim();

      // Only store Lisa Rothwell's records
      if (userName !== "Lisa Rothwell") {
        skippedNonLisa++;
        continue;
      }

      // Handle timestamp - it may already be a Date object from the scraper
      let timestamp;
      if (log.timestamp instanceof Date) {
        timestamp = log.timestamp;
      } else if (log.timestamp) {
        const parsed = new Date(log.timestamp);
        timestamp = !isNaN(parsed.getTime()) ? parsed : new Date();
      } else {
        timestamp = new Date();
      }

      const logData = {
        biginId: log.id || log.recordId || null,
        timestamp,
        user: userName,
        userEmail: log.userEmail || null,
        action: (log.action || "Unknown").trim(),
        module: log.module?.trim() || null,
        recordName: log.recordName?.trim() || null,
        recordId: log.recordId || null,
        details: log.details || null,
        ipAddress: log.ipAddress || null,
        rawData: log.rawData || log,
        scrapeSessionId: sessionId,
        scrapedAt: new Date(),
      };

      // Check for duplicate - use time range to handle slight differences
      const timeStart = new Date(timestamp.getTime() - 60000); // 1 minute before
      const timeEnd = new Date(timestamp.getTime() + 60000); // 1 minute after

      const existingFilter = {
        timestamp: { $gte: timeStart, $lte: timeEnd },
        user: logData.user,
        action: logData.action,
      };

      // Add recordName to filter if it exists
      if (logData.recordName) {
        existingFilter.recordName = logData.recordName;
      }

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

  console.log(`✅ Save complete: ${saved} new Lisa Rothwell records, ${skipped} duplicates skipped, ${skippedNonLisa} non-Lisa skipped`);
  return saved;
}

/**
 * Get audit log statistics
 */
export const getAuditStats = async (req, res) => {
  try {
    const total = await BiginAuditLog.countDocuments();

    // Get collection storage size using aggregate
    let storageSize = 0;
    try {
      const result = await BiginAuditLog.aggregate([
        {
          $group: {
            _id: null,
            totalSize: { $sum: { $bsonSize: "$$ROOT" } }
          }
        }
      ]);
      storageSize = result[0]?.totalSize || 0;
    } catch (statsError) {
      console.error("Error getting collection stats:", statsError.message);
    }

    // Get unique users
    const users = await BiginAuditLog.distinct("user");

    // Get unique actions
    const actions = await BiginAuditLog.distinct("action");

    // Get unique modules
    const modules = await BiginAuditLog.distinct("module");

    // Get unique pipelines from multiple sources
    // 1. From rawData.pipeline (CSV uploads)
    const rawPipelines = await BiginAuditLog.distinct("rawData.pipeline");

    // 2. Extract pipeline names from details field (e.g., "Pipeline: Sales Pipeline")
    const logsWithPipelineDetails = await BiginAuditLog.find({
      details: { $regex: /Pipeline:\s*([^|]+)/i }
    }).select("details").lean();

    const detailsPipelines = logsWithPipelineDetails
      .map(log => {
        const match = log.details?.match(/Pipeline:\s*([^|]+)/i);
        return match ? match[1].trim() : null;
      })
      .filter(p => p);

    // 3. Get modules that are pipeline-related (like "Sales Pipeline Deal")
    const pipelineModules = await BiginAuditLog.distinct("module", {
      module: { $regex: /pipeline/i }
    });

    // Combine all pipeline sources
    const allPipelines = [...new Set([
      ...rawPipelines.filter(p => p),
      ...detailsPipelines,
      ...pipelineModules.filter(p => p)
    ])];

    const pipelines = allPipelines;

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
        storageSize,
        uniqueUsers: users.length,
        uniqueActions: actions.length,
        uniqueModules: modules.length,
        last24Hours,
        last7Days,
        users: users.filter((u) => u).sort(),
        actions: actions.filter((a) => a).sort(),
        modules: modules.filter((m) => m).sort(),
        pipelines: pipelines.filter((p) => p).sort(),
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
    // Only store Lisa Rothwell's records
    let saved = 0;
    let skipped = 0;
    let skippedNonLisa = 0;
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

        // Only store Lisa Rothwell's records
        const userName = doneBy.trim();
        if (userName !== "Lisa Rothwell") {
          skippedNonLisa++;
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
          user: userName,
          userEmail: null,
          action: action.trim() || "Unknown",
          module: module.trim() || null,
          recordName: recordName.trim() || null,
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

        // Check for duplicate - use time range to handle slight differences
        // Look for logs within 1 minute of this timestamp with same user/action/recordName
        const timeStart = new Date(timestamp.getTime() - 60000); // 1 minute before
        const timeEnd = new Date(timestamp.getTime() + 60000); // 1 minute after

        const existingFilter = {
          timestamp: { $gte: timeStart, $lte: timeEnd },
          user: logData.user,
          action: logData.action,
        };

        // Add recordName to filter if it exists
        if (logData.recordName) {
          existingFilter.recordName = logData.recordName;
        }

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
        progressMessage: `Imported ${saved} Lisa Rothwell logs, ${skipped + skippedNonLisa} skipped (${skippedNonLisa} non-Lisa), ${errors} errors`,
      }
    );

    console.log(`✅ CSV upload complete: ${saved} saved, ${skipped} duplicates skipped, ${skippedNonLisa} non-Lisa skipped, ${errors} errors`);

    res.json({
      success: true,
      message: `Successfully imported ${saved} Lisa Rothwell audit logs (${skippedNonLisa} non-Lisa records skipped)`,
      data: {
        totalRows: records.length,
        saved,
        skipped: skipped + skippedNonLisa,
        skippedDuplicates: skipped,
        skippedNonLisa,
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

/**
 * Delete all audit logs
 */
export const deleteAllAuditLogs = async (req, res) => {
  try {
    console.log("🗑️ Deleting all audit logs...");

    // Get count before deletion
    const count = await BiginAuditLog.countDocuments();

    // Delete all audit logs
    const result = await BiginAuditLog.deleteMany({});

    // Also delete all scrape sessions
    await BiginScrapeSession.deleteMany({});

    // Reset scrape status
    scrapeStatus = {
      isRunning: false,
      lastScrapeAt: null,
      lastScrapeResult: null,
      progress: 0,
      message: "",
      currentSessionId: null,
    };

    console.log(`✅ Deleted ${result.deletedCount} audit logs`);

    res.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} audit logs`,
      data: {
        deletedCount: result.deletedCount,
        previousCount: count,
      },
    });
  } catch (error) {
    console.error("Error deleting audit logs:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete audit logs",
    });
  }
};

/**
 * Delete unnecessary audit logs (all except Lisa Rothwell's records)
 */
export const deleteUnnecessaryData = async (req, res) => {
  try {
    console.log("🗑️ Deleting unnecessary audit logs (keeping Lisa Rothwell's records)...");

    // Get counts before deletion
    const totalCount = await BiginAuditLog.countDocuments();
    const lisaCount = await BiginAuditLog.countDocuments({ user: "Lisa Rothwell" });
    const toDeleteCount = totalCount - lisaCount;

    // Delete all audit logs except Lisa Rothwell's
    const result = await BiginAuditLog.deleteMany({ user: { $ne: "Lisa Rothwell" } });

    console.log(`✅ Deleted ${result.deletedCount} unnecessary audit logs, kept ${lisaCount} Lisa Rothwell records`);

    res.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} audit logs (kept ${lisaCount} Lisa Rothwell records)`,
      data: {
        deletedCount: result.deletedCount,
        keptCount: lisaCount,
        previousTotal: totalCount,
      },
    });
  } catch (error) {
    console.error("Error deleting unnecessary audit logs:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete unnecessary audit logs",
    });
  }
};

/**
 * Check if a salesperson has Inside Sales eligibility
 * Used to determine if "Inside Sales" checkbox should be checked
 *
 * Logic:
 * 1. Get all agreements created by this salesperson (all time)
 * 2. Extract all Bigin IDs (zoho.bigin.dealId) from those agreements
 * 3. Check if ANY of those Bigin IDs appear in Lisa Rothwell's audit history (recordId field) within 1 year
 * 4. If found → isInsideSales = true
 */
export const checkInsideSalesEligibility = async (req, res) => {
  try {
    const { salespersonName } = req.query;

    if (!salespersonName) {
      return res.status(400).json({
        success: false,
        error: "salespersonName is required",
      });
    }

    console.log(`🔍 Checking inside sales eligibility for salesperson: ${salespersonName}`);

    // Step 1: Get ALL agreements created by this salesperson (case-insensitive)
    const allAgreementsByUser = await CustomerHeaderDoc.find({
      createdBy: { $regex: new RegExp(`^${salespersonName}$`, 'i') },
      isDeleted: { $ne: true },
    }).select("_id payload.headerTitle createdAt createdBy zoho.bigin.dealId").lean();

    console.log(`📋 Total agreements by ${salespersonName}: ${allAgreementsByUser.length}`);

    if (allAgreementsByUser.length === 0) {
      return res.json({
        success: true,
        data: {
          salespersonName,
          isInsideSales: false,
          matchCount: 0,
          totalAgreementsByUser: 0,
          agreementCount: 0,
          biginIdCount: 0,
          allBiginIds: [],
          agreementDetails: [],
          matchedBiginIds: [],
          matchDetails: [],
          message: "No agreements found for this salesperson",
        },
      });
    }

    // Step 2: Get Bigin deal IDs from ZohoMapping collection (this is where they're stored)
    const agreementIds = allAgreementsByUser.map(a => a._id);
    const zohoMappings = await ZohoMapping.find({
      agreementId: { $in: agreementIds },
    }).select("agreementId zohoDeal.id zohoDeal.name").lean();

    console.log(`📊 Found ${zohoMappings.length} ZohoMappings for ${allAgreementsByUser.length} agreements`);

    // Create a map of agreementId -> dealId
    const mappingByAgreementId = {};
    zohoMappings.forEach(m => {
      mappingByAgreementId[m.agreementId.toString()] = {
        dealId: m.zohoDeal?.id,
        dealName: m.zohoDeal?.name,
      };
    });

    // Step 3: Build agreement details with Bigin IDs
    const agreementDetails = allAgreementsByUser.map(a => {
      const mapping = mappingByAgreementId[a._id.toString()];
      // Try ZohoMapping first, then fall back to CustomerHeaderDoc.zoho.bigin.dealId
      const biginId = mapping?.dealId || a.zoho?.bigin?.dealId || null;
      return {
        agreementId: a._id.toString(),
        biginId: biginId,
        title: a.payload?.headerTitle || 'Untitled',
        createdAt: a.createdAt,
        createdBy: a.createdBy,
        dealName: mapping?.dealName || null,
      };
    });

    const agreementsWithBiginIds = agreementDetails.filter(a => a.biginId && a.biginId.trim() !== "");
    const biginIds = agreementsWithBiginIds.map(a => a.biginId);

    console.log(`📊 Extracted ${biginIds.length} Bigin IDs from ${allAgreementsByUser.length} agreements:`, biginIds.slice(0, 5));

    if (biginIds.length === 0) {
      return res.json({
        success: true,
        data: {
          salespersonName,
          isInsideSales: false,
          matchCount: 0,
          totalAgreementsByUser: allAgreementsByUser.length,
          agreementCount: 0,
          biginIdCount: 0,
          allBiginIds: [],
          agreementDetails: agreementDetails.slice(0, 20),
          matchedBiginIds: [],
          matchDetails: [],
          message: `Found ${allAgreementsByUser.length} agreements but none have been uploaded to Bigin yet`,
        },
      });
    }

    // Step 4: Calculate date 1 year ago
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    // Step 5: Check if any of those Bigin IDs appear in Lisa Rothwell's audit records within 1 year
    // Check recordId, recordName, and biginId fields (the ID might be in any of these)
    const matchingRecords = await BiginAuditLog.find({
      user: "Lisa Rothwell",
      timestamp: { $gte: oneYearAgo },
      $or: [
        { recordId: { $in: biginIds } },
        { recordName: { $in: biginIds } },
        { biginId: { $in: biginIds } },
      ],
    }).limit(20);

    const isInsideSales = matchingRecords.length > 0;

    // Find which agreement(s) matched
    const matchedBiginIds = new Set();
    matchingRecords.forEach(r => {
      if (biginIds.includes(r.recordId)) matchedBiginIds.add(r.recordId);
      if (biginIds.includes(r.recordName)) matchedBiginIds.add(r.recordName);
      if (biginIds.includes(r.biginId)) matchedBiginIds.add(r.biginId);
    });

    console.log(`✅ Inside sales eligibility for ${salespersonName}: ${isInsideSales} (${matchingRecords.length} audit records found)`);

    res.json({
      success: true,
      data: {
        salespersonName,
        isInsideSales,
        matchCount: matchingRecords.length,
        totalAgreementsByUser: allAgreementsByUser.length,
        agreementCount: agreementsWithBiginIds.length,
        biginIdCount: biginIds.length,
        allBiginIds: biginIds,
        agreementDetails: agreementDetails.slice(0, 20), // Limit to 20 for display
        matchedBiginIds: Array.from(matchedBiginIds),
        matchDetails: matchingRecords.slice(0, 5).map(r => ({
          recordId: r.recordId,
          recordName: r.recordName,
          action: r.action,
          timestamp: r.timestamp,
          module: r.module,
        })),
      },
    });
  } catch (error) {
    console.error("Error checking inside sales eligibility:", error);
    res.status(500).json({
      success: false,
      error: "Failed to check inside sales eligibility",
    });
  }
};
