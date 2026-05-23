/**
 * MapDistance Models
 * Efficient schema design to minimize storage:
 * - MapDistanceRecord: Individual distance records linked to customer by reference
 * - MapDistanceSyncJob: Tracks sync operations
 * - Uses numeric codes for repeated values (frequency, dayOfWeek) to save space
 */

import mongoose from "mongoose";

/**
 * Frequency Enum Mapping
 * Stored as numbers, mapped to strings when reading
 */
export const FREQUENCY_MAP = {
  1: 'Weekly',
  2: 'Bi-Weekly',
  3: 'Monthly',
  4: 'Quarterly',
  5: 'Bi-Annual',
  6: 'Annual',
  7: 'One Time',
  8: 'EOW Odd',
  9: 'EOW Even',
  10: 'Every 4 Weeks',
  11: 'Every 6 Weeks',
  12: 'Every 8 Weeks',
  0: 'Unknown'
};

// Reverse mapping for saving
export const FREQUENCY_REVERSE_MAP = Object.fromEntries(
  Object.entries(FREQUENCY_MAP).map(([k, v]) => [v.toLowerCase(), parseInt(k)])
);

/**
 * Day of Week Enum Mapping
 * Standard: 0=Sunday, 1=Monday, etc.
 */
export const DAY_OF_WEEK_MAP = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Unknown'
};

// Reverse mapping for saving
export const DAY_OF_WEEK_REVERSE_MAP = Object.fromEntries(
  Object.entries(DAY_OF_WEEK_MAP).map(([k, v]) => [v.toLowerCase(), parseInt(k)])
);

/**
 * MapDistanceRecord Schema
 * Stores distance data with minimal redundancy:
 * - Links to RouteStarCustomer by ObjectId (not storing customer name again)
 * - Uses numeric codes for frequency and dayOfWeek to save space
 */
const MapDistanceRecordSchema = new mongoose.Schema(
  {
    // Reference to SOURCE customer - the customer we searched for
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RouteStarCustomer",
      required: true,
      index: true,
    },
    // DESTINATION customer name - the customer in the distance row
    destinationCustomerName: {
      type: String,
      trim: true,
      index: true,
    },
    // Assigned technician/driver (kept as string - usually short like "NRV1")
    assignedTo: {
      type: String,
      trim: true,
    },
    // Service frequency - stored as number, mapped to string when reading
    frequency: {
      type: Number,
      default: 0,
      index: true,
    },
    // Service date
    serviceDate: {
      type: Date,
      index: true,
    },
    // Day of week - stored as number (0-6), mapped to string when reading
    dayOfWeek: {
      type: Number,
      default: 7,
    },
    // Stop number on route
    stopNumber: {
      type: Number,
    },
    // Distance in miles (stored as integer = miles * 1000000 for precision without float)
    distanceMiles: {
      type: Number,
      index: true,
    },
    // Sync job that created this record
    syncJobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MapDistanceSyncJob",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient queries
MapDistanceRecordSchema.index({ customerId: 1, serviceDate: -1 });
MapDistanceRecordSchema.index({ assignedTo: 1, serviceDate: -1 });

/**
 * MapDistanceSyncJob Schema
 * Tracks sync operations for progress and history
 */
const MapDistanceSyncJobSchema = new mongoose.Schema(
  {
    // Job type: single_fetch, full_sync, update_sync
    jobType: {
      type: String,
      enum: ["single_fetch", "full_sync", "update_sync"],
      default: "full_sync",
      index: true,
    },
    // Sync status
    status: {
      type: String,
      enum: ["pending", "running", "completed", "failed", "cancelled", "paused"],
      default: "pending",
      index: true,
    },
    // Customer IDs to process (for resume capability)
    customerIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "RouteStarCustomer"
    }],
    // Customer IDs that have been processed
    processedCustomerIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "RouteStarCustomer"
    }],
    // Progress tracking
    totalCustomers: {
      type: Number,
      default: 0,
    },
    processedCustomers: {
      type: Number,
      default: 0,
    },
    successfulCustomers: {
      type: Number,
      default: 0,
    },
    failedCustomers: {
      type: Number,
      default: 0,
    },
    // Current customer being processed
    currentCustomerName: {
      type: String,
      trim: true,
    },
    // Records created in this sync
    recordsCreated: {
      type: Number,
      default: 0,
    },
    // Fetched data (for single_fetch jobs - stores the raw data for display)
    fetchedData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    // Timestamps
    startedAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
    // Last activity timestamp (for detecting stale jobs)
    lastActivityAt: {
      type: Date,
      default: Date.now,
    },
    // Error log (only store last few errors to save space)
    errors: [{
      customerName: String,
      error: String,
      timestamp: { type: Date, default: Date.now }
    }],
    // Who started the sync
    startedBy: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Limit errors array to last 50 entries to save storage
MapDistanceSyncJobSchema.pre('save', function(next) {
  if (this.errors && this.errors.length > 50) {
    this.errors = this.errors.slice(-50);
  }
  next();
});

const MapDistanceRecord = mongoose.model("MapDistanceRecord", MapDistanceRecordSchema);
const MapDistanceSyncJob = mongoose.model("MapDistanceSyncJob", MapDistanceSyncJobSchema);

export { MapDistanceRecord, MapDistanceSyncJob };
export default { MapDistanceRecord, MapDistanceSyncJob };
