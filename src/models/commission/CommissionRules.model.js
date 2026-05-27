/**
 * Commission Rules Model
 * Commission calculation rules and configuration
 */

import mongoose from "mongoose";

// Quota Levels
export const QUOTA_LEVELS = {
  BELOW: "below",
  ABOVE: "above",
  DOUBLE: "double",
};

// Agreement Terms
export const AGREEMENT_TERMS = {
  THREE_YEAR: "3-year",
  ONE_YEAR: "1-year",
  MTM_WITH_INSTALL: "MTM-with-install",
  MTM_NO_INSTALL: "MTM-no-install",
};

// Account Types
export const ACCOUNT_TYPES = {
  ANCHOR: "Anchor",
  BREAD5: "Bread5",
  BREAD15: "Bread15",
  PIT: "Pit",
};

// Pricing Lines
export const PRICING_LINES = {
  REDLINE: "Redline",
  GREENLINE: "Greenline",
};

// Business Types
export const BUSINESS_TYPES = {
  NEW: "new",
  RENEWAL: "renewal",
};

const CommissionRulesSchema = new mongoose.Schema(
  {
    version: {
      type: String,
      required: true,
      default: "1.0.0",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Base commission rates by quota level (percentages)
    quotaRates: {
      below: { type: Number, default: 3 },
      above: { type: Number, default: 6 },
      double: { type: Number, default: 9 },
    },
    // Agreement term multipliers (percentages)
    agreementMultipliers: {
      "3-year": { type: Number, default: 135 },
      "1-year": { type: Number, default: 100 },
      "MTM-with-install": { type: Number, default: 100 },
      "MTM-no-install": { type: Number, default: 50 },
    },
    // Account type adjustments - percentage reduction
    accountTypeAdjustments: {
      Anchor: { type: Number, default: 0 },
      Bread5: { type: Number, default: -1 },
      Bread15: { type: Number, default: -0.5 },
      Pit: { type: Number, default: 0 },
    },
    // Greenline bonus percentage
    greenlineBonus: {
      type: Number,
      default: 1,
    },
    // Renewal bonus rate
    renewalBonusRate: {
      type: Number,
      default: 4,
    },
    // Minimum years for renewal bonus
    renewalMinYears: {
      type: Number,
      default: 2,
    },
    // Inside sales deduction
    insideSalesDeduction: {
      type: Number,
      default: -3,
    },
    // Anchor minimum monthly value threshold
    anchorMinMonthlyValue: {
      type: Number,
      default: 200,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
CommissionRulesSchema.index({ isActive: 1 });
CommissionRulesSchema.index({ version: 1 });

// Static: Get active rules
CommissionRulesSchema.statics.getActiveRules = function () {
  return this.findOne({ isActive: true }).sort({ createdAt: -1 });
};

// Default commission rules
export const DEFAULT_COMMISSION_RULES = {
  version: "1.0.0",
  isActive: true,
  quotaRates: {
    below: 3,
    above: 6,
    double: 9,
  },
  agreementMultipliers: {
    "3-year": 135,
    "1-year": 100,
    "MTM-with-install": 100,
    "MTM-no-install": 50,
  },
  accountTypeAdjustments: {
    Anchor: 0,
    Bread5: -1,
    Bread15: -0.5,
    Pit: 0,
  },
  greenlineBonus: 1,
  renewalBonusRate: 4,
  renewalMinYears: 2,
  insideSalesDeduction: -3,
  anchorMinMonthlyValue: 200,
};

const CommissionRules = mongoose.model("CommissionRules", CommissionRulesSchema);

export default CommissionRules;
