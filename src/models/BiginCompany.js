/**
 * Bigin Company Model
 * Stores company data fetched from Zoho Bigin CRM
 */

import mongoose from "mongoose";

const BiginCompanySchema = new mongoose.Schema(
  {
    // Bigin-specific fields
    biginId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    companyName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    // Contact information
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    website: {
      type: String,
      trim: true,
    },
    // Address
    street: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    state: {
      type: String,
      trim: true,
    },
    zipCode: {
      type: String,
      trim: true,
    },
    country: {
      type: String,
      trim: true,
    },
    // Business details
    industry: {
      type: String,
      trim: true,
    },
    accountType: {
      type: String,
      trim: true,
    },
    owner: {
      type: String,
      trim: true,
    },
    ownerEmail: {
      type: String,
      trim: true,
    },
    // Pipeline info
    pipeline: {
      type: String,
      trim: true,
    },
    stage: {
      type: String,
      trim: true,
    },
    // Additional info
    description: {
      type: String,
      trim: true,
    },
    tags: [{
      type: String,
      trim: true,
    }],
    // Bigin timestamps
    biginCreatedAt: {
      type: Date,
    },
    biginModifiedAt: {
      type: Date,
    },
    // Raw data from Bigin for reference
    rawData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    // Sync tracking
    lastSyncedAt: {
      type: Date,
      default: Date.now,
    },
    syncSessionId: {
      type: String,
    },
  },
  {
    timestamps: true,
    collection: "bigin_companies",
  }
);

// Compound index for searching
BiginCompanySchema.index({ companyName: "text", email: "text", city: "text" });

export default mongoose.model("BiginCompany", BiginCompanySchema);
