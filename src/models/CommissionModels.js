import mongoose from "mongoose";

const { Schema, model } = mongoose;

// Commission Rules Schema
const CommissionRulesSchema = new Schema(
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
    // Account type adjustments - percentage reduction for Bread locations
    accountTypeAdjustments: {
      Anchor: { type: Number, default: 0 },
      Bread5: { type: Number, default: -1 },
      Bread15: { type: Number, default: -0.5 },
      Pit: { type: Number, default: 0 },
    },
    // Greenline bonus percentage for premium pricing
    greenlineBonus: {
      type: Number,
      default: 1,
    },
    // Renewal bonus rate (percentage)
    renewalBonusRate: {
      type: Number,
      default: 4,
    },
    // Minimum years for renewal bonus
    renewalMinYears: {
      type: Number,
      default: 2,
    },
    // Inside sales deduction (negative percentage)
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

// Commission Record Schema - for saved calculations
const CommissionRecordSchema = new Schema(
  {
    // Full calculation result
    calculation: {
      input: {
        monthlyValue: Number,
        agreementTerm: String,
        accountType: String,
        pricingLine: String,
        quotaLevel: String,
        businessType: String,
        yearsAsCustomer: Number,
        isInsideSales: Boolean,
        salesPersonId: String,
        salesPersonName: String,
        customerName: String,
        notes: String,
      },
      breakdown: {
        baseRate: Number,
        agreementMultiplier: Number,
        accountTypeAdjustment: Number,
        greenlineBonus: Number,
        renewalBonus: Number,
        insideSalesDeduction: Number,
      },
      effectiveBaseRate: Number,
      finalCommissionRate: Number,
      monthlyCommission: Number,
      annualCommission: Number,
      firstYearCommission: Number,
      calculatedAt: String,
    },
    salesPersonId: {
      type: String,
      required: true,
    },
    salesPersonName: {
      type: String,
      required: true,
    },
    customerName: String,
    createdBy: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["draft", "submitted", "approved", "paid"],
      default: "draft",
    },
  },
  {
    timestamps: true,
  }
);

// Create indexes
CommissionRulesSchema.index({ isActive: 1 });
CommissionRecordSchema.index({ salesPersonId: 1, createdAt: -1 });
CommissionRecordSchema.index({ status: 1, createdAt: -1 });

export const CommissionRules = model("CommissionRules", CommissionRulesSchema);
export const CommissionRecord = model("CommissionRecord", CommissionRecordSchema);

// Default commission rules for initialization
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
