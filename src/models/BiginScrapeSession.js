const mongoose = require("mongoose");

/**
 * Schema for tracking Bigin audit scrape sessions
 */
const BiginScrapeSessionSchema = new mongoose.Schema(
  {
    // Session identifier
    sessionId: { type: String, required: true, unique: true },

    // Status of the scrape
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed'],
      default: 'pending'
    },

    // Progress tracking
    progress: { type: Number, default: 0, min: 0, max: 100 },
    progressMessage: { type: String, default: '' },

    // Results
    logsScraped: { type: Number, default: 0 },
    logsStored: { type: Number, default: 0 },

    // Timing
    startedAt: { type: Date },
    completedAt: { type: Date },

    // Error info if failed
    error: { type: String },
    errorDetails: { type: Object },

    // Who triggered the scrape
    triggeredBy: { type: String, default: 'manual' }
  },
  {
    timestamps: true,
    collection: 'bigin_scrape_sessions'
  }
);

BiginScrapeSessionSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("BiginScrapeSession", BiginScrapeSessionSchema);
