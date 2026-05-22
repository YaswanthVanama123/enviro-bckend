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

// Sales Person Schema - for tracking sales reps and their quotas
const SalesPersonSchema = new Schema(
  {
    // Basic info
    employeeId: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    phone: String,
    department: {
      type: String,
      default: "Sales",
    },
    role: {
      type: String,
      enum: ["field_sales", "inside_sales", "account_manager", "sales_manager"],
      default: "field_sales",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Quota configuration
    quota: {
      // Monthly quota target in dollars
      monthlyTarget: {
        type: Number,
        required: true,
        default: 50000,
      },
      // Effective date for this quota
      effectiveDate: {
        type: Date,
        default: Date.now,
      },
      // Quota period type
      periodType: {
        type: String,
        enum: ["monthly", "quarterly", "annual"],
        default: "monthly",
      },
    },
    // Manager reference (for hierarchical reporting)
    managerId: {
      type: String,
      default: null,
    },
    // Territory/region assignment
    territory: String,
    // Hire date for tenure calculations
    hireDate: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Agreement Schema - for tracking each deal/agreement
const AgreementSchema = new Schema(
  {
    // Agreement identification
    agreementNumber: {
      type: String,
      required: true,
      unique: true,
    },
    // Customer info
    customer: {
      name: {
        type: String,
        required: true,
      },
      id: String,
      address: String,
      city: String,
      state: String,
      zipCode: String,
    },
    // Sales person who closed the deal
    salesPerson: {
      id: {
        type: String,
        required: true,
        ref: "SalesPerson",
      },
      name: {
        type: String,
        required: true,
      },
    },
    // Inside sales involvement
    insideSales: {
      involved: {
        type: Boolean,
        default: false,
      },
      personId: String,
      personName: String,
    },
    // Agreement details
    agreementTerm: {
      type: String,
      enum: ["3-year", "1-year", "MTM-with-install", "MTM-no-install"],
      required: true,
    },
    termMonths: {
      type: Number,
      required: true,
    },
    // Financial details
    monthlyValue: {
      type: Number,
      required: true,
    },
    totalContractValue: {
      type: Number,
      required: true,
    },
    perVisitRevenue: Number,
    // Account classification
    accountType: {
      type: String,
      enum: ["Anchor", "Bread5", "Bread15", "Pit"],
      required: true,
    },
    pricingLine: {
      type: String,
      enum: ["Redline", "Greenline"],
      default: "Redline",
    },
    // Business type
    businessType: {
      type: String,
      enum: ["new", "renewal"],
      default: "new",
    },
    yearsAsCustomer: {
      type: Number,
      default: 0,
    },
    // Distance data (from RouteSTAR)
    distanceToAnchor: {
      miles: Number,
      drivingTimeMinutes: Number,
      nearestAnchorId: String,
      nearestAnchorName: String,
    },
    // Commission calculation snapshot
    commission: {
      quotaLevelAtTime: {
        type: String,
        enum: ["below", "above", "double"],
        required: true,
      },
      effectiveBaseRate: Number,
      finalCommissionRate: Number,
      monthlyCommission: Number,
      annualCommission: Number,
      totalCommission: Number,
      breakdown: {
        baseRate: Number,
        agreementMultiplier: Number,
        accountTypeAdjustment: Number,
        greenlineBonus: Number,
        renewalBonus: Number,
        insideSalesDeduction: Number,
      },
    },
    // Agreement dates
    startDate: {
      type: Date,
      required: true,
    },
    endDate: Date,
    signedDate: {
      type: Date,
      default: Date.now,
    },
    // Status tracking
    status: {
      type: String,
      enum: ["draft", "pending_approval", "approved", "active", "completed", "cancelled"],
      default: "draft",
    },
    // Approval workflow
    approvedBy: String,
    approvedAt: Date,
    // Notes
    notes: String,
  },
  {
    timestamps: true,
  }
);

// Quota Period Schema - for tracking quota performance over time
const QuotaPeriodSchema = new Schema(
  {
    salesPersonId: {
      type: String,
      required: true,
      ref: "SalesPerson",
    },
    salesPersonName: {
      type: String,
      required: true,
    },
    // Period definition
    periodType: {
      type: String,
      enum: ["monthly", "quarterly", "annual"],
      required: true,
    },
    periodStart: {
      type: Date,
      required: true,
    },
    periodEnd: {
      type: Date,
      required: true,
    },
    // Period label (e.g., "January 2024", "Q1 2024")
    periodLabel: {
      type: String,
      required: true,
    },
    // Quota target for this period
    quotaTarget: {
      type: Number,
      required: true,
    },
    // Actual performance
    actualSales: {
      type: Number,
      default: 0,
    },
    // Agreement counts
    agreementCount: {
      type: Number,
      default: 0,
    },
    newBusinessCount: {
      type: Number,
      default: 0,
    },
    renewalCount: {
      type: Number,
      default: 0,
    },
    // Calculated quota level
    quotaLevel: {
      type: String,
      enum: ["below", "above", "double"],
      default: "below",
    },
    quotaPercentage: {
      type: Number,
      default: 0,
    },
    // Commission totals for this period
    totalCommissionEarned: {
      type: Number,
      default: 0,
    },
    // Status
    status: {
      type: String,
      enum: ["in_progress", "closed", "finalized"],
      default: "in_progress",
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
SalesPersonSchema.index({ employeeId: 1 });
SalesPersonSchema.index({ email: 1 });
SalesPersonSchema.index({ isActive: 1, name: 1 });
AgreementSchema.index({ "salesPerson.id": 1, signedDate: -1 });
AgreementSchema.index({ agreementNumber: 1 });
AgreementSchema.index({ status: 1, startDate: -1 });
AgreementSchema.index({ "customer.name": 1 });
QuotaPeriodSchema.index({ salesPersonId: 1, periodStart: -1 });
QuotaPeriodSchema.index({ periodType: 1, periodStart: 1 });

export const CommissionRules = model("CommissionRules", CommissionRulesSchema);
export const CommissionRecord = model("CommissionRecord", CommissionRecordSchema);
export const SalesPerson = model("SalesPerson", SalesPersonSchema);
export const Agreement = model("Agreement", AgreementSchema);
export const QuotaPeriod = model("QuotaPeriod", QuotaPeriodSchema);

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
