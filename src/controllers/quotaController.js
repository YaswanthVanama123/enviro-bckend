/**
 * Quota Tracking Controller
 * Handles sales person management, agreements, and quota tracking
 * Uses Employee model from User Management for sales persons
 */

import mongoose from "mongoose";
import Employee from "../models/Employee.js";
import {
  Agreement,
  QuotaPeriod,
  CommissionRules,
  DEFAULT_COMMISSION_RULES,
} from "../models/CommissionModels.js";

// Helper: Check if string is valid ObjectId
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id;
}

// Helper: Build query for finding employee by id or username
function buildEmployeeQuery(id) {
  if (isValidObjectId(id)) {
    return { $or: [{ _id: id }, { username: id }] };
  }
  return { username: id };
}

// Helper: Generate agreement number
function generateAgreementNumber() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `AGR-${timestamp}-${random}`;
}

// Helper: Calculate quota level from percentage
function calculateQuotaLevel(percentage) {
  if (percentage >= 200) return "double";
  if (percentage >= 100) return "above";
  return "below";
}

// Helper: Get period boundaries
function getPeriodBoundaries(date, periodType) {
  const d = new Date(date);
  let start, end, label;

  if (periodType === "monthly") {
    start = new Date(d.getFullYear(), d.getMonth(), 1);
    end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    label = d.toLocaleString("default", { month: "long", year: "numeric" });
  } else if (periodType === "quarterly") {
    const quarter = Math.floor(d.getMonth() / 3);
    start = new Date(d.getFullYear(), quarter * 3, 1);
    end = new Date(d.getFullYear(), quarter * 3 + 3, 0, 23, 59, 59, 999);
    label = `Q${quarter + 1} ${d.getFullYear()}`;
  } else {
    start = new Date(d.getFullYear(), 0, 1);
    end = new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999);
    label = d.getFullYear().toString();
  }

  return { start, end, label };
}

// Helper: Calculate commission for an agreement
async function calculateAgreementCommission(agreementData, quotaLevel) {
  // Get active commission rules
  let rules = await CommissionRules.findOne({ isActive: true });
  if (!rules) {
    rules = DEFAULT_COMMISSION_RULES;
  }

  const baseRate = rules.quotaRates[quotaLevel] || 3;
  const agreementMultiplier = rules.agreementMultipliers[agreementData.agreementTerm] || 100;
  const accountTypeAdjustment = rules.accountTypeAdjustments[agreementData.accountType] || 0;
  const greenlineBonus = agreementData.pricingLine === "Greenline" ? rules.greenlineBonus : 0;
  const renewalBonus =
    agreementData.businessType === "renewal" &&
    agreementData.yearsAsCustomer >= rules.renewalMinYears
      ? rules.renewalBonusRate
      : 0;
  const insideSalesDeduction = agreementData.insideSales?.involved
    ? rules.insideSalesDeduction
    : 0;

  const effectiveBaseRate =
    baseRate + accountTypeAdjustment + greenlineBonus + renewalBonus + insideSalesDeduction;
  const finalCommissionRate = effectiveBaseRate * (agreementMultiplier / 100);
  const monthlyCommission = agreementData.monthlyValue * (finalCommissionRate / 100);
  const annualCommission = monthlyCommission * 12;
  const totalCommission = monthlyCommission * agreementData.termMonths;

  return {
    quotaLevelAtTime: quotaLevel,
    effectiveBaseRate,
    finalCommissionRate,
    monthlyCommission,
    annualCommission,
    totalCommission,
    breakdown: {
      baseRate,
      agreementMultiplier,
      accountTypeAdjustment,
      greenlineBonus,
      renewalBonus,
      insideSalesDeduction,
    },
  };
}

// ============================================================
// SALES PERSON MANAGEMENT (Using Employee model)
// ============================================================

/**
 * Get all sales persons (employees)
 */
export const getAllSalesPersons = async (req, res) => {
  try {
    const { active, role, search } = req.query;
    const filter = {};

    if (active !== undefined) {
      filter.isActive = active === "true";
    }
    if (role && role !== "all") {
      filter.salesRole = role;
    }
    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { username: { $regex: search, $options: "i" } },
      ];
    }

    const employees = await Employee.find(filter)
      .select("-passwordHash")
      .sort({ fullName: 1 });

    // Map to expected format for frontend
    const salesPersons = employees.map((emp) => ({
      _id: emp._id,
      employeeId: emp.username,
      name: emp.fullName,
      email: emp.email || "",
      phone: emp.phone || "",
      department: "Sales",
      role: emp.salesRole || "field_sales",
      isActive: emp.isActive,
      quota: {
        monthlyTarget: emp.quota?.monthlyTarget || 50000,
        effectiveDate: emp.quota?.effectiveDate || emp.createdAt,
        periodType: emp.quota?.periodType || "monthly",
      },
      managerId: emp.managerId,
      territory: emp.territory || "",
      hireDate: emp.hireDate || emp.createdAt,
      createdAt: emp.createdAt,
      updatedAt: emp.updatedAt,
    }));

    res.json({
      success: true,
      data: salesPersons,
      count: salesPersons.length,
    });
  } catch (error) {
    console.error("Error fetching sales persons:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch sales persons",
    });
  }
};

/**
 * Get a single sales person by ID (employee)
 */
export const getSalesPersonById = async (req, res) => {
  try {
    const { id } = req.params;
    const employee = await Employee.findOne(buildEmployeeQuery(id)).select("-passwordHash");

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: "Sales person not found",
      });
    }

    // Map to expected format
    const salesPerson = {
      _id: employee._id,
      employeeId: employee.username,
      name: employee.fullName,
      email: employee.email || "",
      phone: employee.phone || "",
      department: "Sales",
      role: employee.salesRole || "field_sales",
      isActive: employee.isActive,
      quota: {
        monthlyTarget: employee.quota?.monthlyTarget || 50000,
        effectiveDate: employee.quota?.effectiveDate || employee.createdAt,
        periodType: employee.quota?.periodType || "monthly",
      },
      managerId: employee.managerId,
      territory: employee.territory || "",
      hireDate: employee.hireDate || employee.createdAt,
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt,
    };

    res.json({
      success: true,
      data: salesPerson,
    });
  } catch (error) {
    console.error("Error fetching sales person:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch sales person",
    });
  }
};

/**
 * Create a new sales person - redirects to user management
 * Sales persons are created through User Management
 */
export const createSalesPerson = async (req, res) => {
  res.status(400).json({
    success: false,
    error: "Sales persons are managed through User Management. Please create an employee there first.",
  });
};

/**
 * Update a sales person (employee quota/sales fields)
 */
export const updateSalesPerson = async (req, res) => {
  try {
    const { id } = req.params;
    const { salesRole, territory, managerId, phone } = req.body;

    const employee = await Employee.findOne(buildEmployeeQuery(id));

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: "Sales person not found",
      });
    }

    // Update only sales-related fields
    if (salesRole !== undefined) employee.salesRole = salesRole;
    if (territory !== undefined) employee.territory = territory;
    if (managerId !== undefined) employee.managerId = managerId;
    if (phone !== undefined) employee.phone = phone;

    await employee.save();

    // Return mapped format
    const salesPerson = {
      _id: employee._id,
      employeeId: employee.username,
      name: employee.fullName,
      email: employee.email || "",
      phone: employee.phone || "",
      department: "Sales",
      role: employee.salesRole || "field_sales",
      isActive: employee.isActive,
      quota: {
        monthlyTarget: employee.quota?.monthlyTarget || 50000,
        effectiveDate: employee.quota?.effectiveDate || employee.createdAt,
        periodType: employee.quota?.periodType || "monthly",
      },
      managerId: employee.managerId,
      territory: employee.territory || "",
      hireDate: employee.hireDate || employee.createdAt,
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt,
    };

    res.json({
      success: true,
      data: salesPerson,
      message: "Sales person updated successfully",
    });
  } catch (error) {
    console.error("Error updating sales person:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update sales person",
    });
  }
};

/**
 * Update sales person quota
 */
export const updateSalesPersonQuota = async (req, res) => {
  try {
    const { id } = req.params;
    const { monthlyTarget, periodType, effectiveDate } = req.body;

    const employee = await Employee.findOne(buildEmployeeQuery(id));

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: "Sales person not found",
      });
    }

    // Update quota
    if (!employee.quota) {
      employee.quota = {};
    }
    if (monthlyTarget !== undefined) employee.quota.monthlyTarget = monthlyTarget;
    if (periodType !== undefined) employee.quota.periodType = periodType;
    if (effectiveDate !== undefined) employee.quota.effectiveDate = effectiveDate;

    await employee.save();

    // Return mapped format
    const salesPerson = {
      _id: employee._id,
      employeeId: employee.username,
      name: employee.fullName,
      email: employee.email || "",
      phone: employee.phone || "",
      department: "Sales",
      role: employee.salesRole || "field_sales",
      isActive: employee.isActive,
      quota: {
        monthlyTarget: employee.quota?.monthlyTarget || 50000,
        effectiveDate: employee.quota?.effectiveDate || employee.createdAt,
        periodType: employee.quota?.periodType || "monthly",
      },
      managerId: employee.managerId,
      territory: employee.territory || "",
      hireDate: employee.hireDate || employee.createdAt,
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt,
    };

    res.json({
      success: true,
      data: salesPerson,
      message: "Quota updated successfully",
    });
  } catch (error) {
    console.error("Error updating quota:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update quota",
    });
  }
};

// ============================================================
// AGREEMENT MANAGEMENT
// ============================================================

/**
 * Create a new agreement
 */
export const createAgreement = async (req, res) => {
  try {
    const {
      salesPersonId,
      customer,
      insideSales,
      agreementTerm,
      termMonths,
      monthlyValue,
      perVisitRevenue,
      accountType,
      pricingLine,
      businessType,
      yearsAsCustomer,
      distanceToAnchor,
      startDate,
      endDate,
      signedDate,
      notes,
    } = req.body;

    // Get the employee (sales person)
    const employee = await Employee.findOne(buildEmployeeQuery(salesPersonId));

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: "Sales person not found",
      });
    }

    // Get or create current quota period
    const periodType = employee.quota?.periodType || "monthly";
    const { start, end, label } = getPeriodBoundaries(new Date(), periodType);

    let quotaPeriod = await QuotaPeriod.findOne({
      salesPersonId: employee.username,
      periodStart: start,
      periodType,
    });

    if (!quotaPeriod) {
      quotaPeriod = new QuotaPeriod({
        salesPersonId: employee.username,
        salesPersonName: employee.fullName,
        periodType,
        periodStart: start,
        periodEnd: end,
        periodLabel: label,
        quotaTarget: employee.quota?.monthlyTarget || 50000,
        status: "in_progress",
      });
      await quotaPeriod.save();
    }

    // Calculate current quota level
    const quotaPercentage =
      quotaPeriod.quotaTarget > 0
        ? (quotaPeriod.actualSales / quotaPeriod.quotaTarget) * 100
        : 0;
    const currentQuotaLevel = calculateQuotaLevel(quotaPercentage);

    // Calculate commission for this agreement
    const commission = await calculateAgreementCommission(
      {
        agreementTerm,
        accountType,
        pricingLine: pricingLine || "Redline",
        businessType: businessType || "new",
        yearsAsCustomer: yearsAsCustomer || 0,
        insideSales,
        monthlyValue,
        termMonths,
      },
      currentQuotaLevel
    );

    // Create agreement
    const agreement = new Agreement({
      agreementNumber: generateAgreementNumber(),
      customer,
      salesPerson: {
        id: employee.username,
        name: employee.fullName,
      },
      insideSales: insideSales || { involved: false },
      agreementTerm,
      termMonths,
      monthlyValue,
      totalContractValue: monthlyValue * termMonths,
      perVisitRevenue,
      accountType,
      pricingLine: pricingLine || "Redline",
      businessType: businessType || "new",
      yearsAsCustomer: yearsAsCustomer || 0,
      distanceToAnchor,
      commission,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      signedDate: signedDate ? new Date(signedDate) : new Date(),
      status: "active",
      notes,
    });

    await agreement.save();

    // Update quota period
    quotaPeriod.actualSales += monthlyValue;
    quotaPeriod.agreementCount += 1;
    if (businessType === "renewal") {
      quotaPeriod.renewalCount += 1;
    } else {
      quotaPeriod.newBusinessCount += 1;
    }
    quotaPeriod.totalCommissionEarned += commission.monthlyCommission;

    // Recalculate quota level
    const newPercentage =
      quotaPeriod.quotaTarget > 0
        ? (quotaPeriod.actualSales / quotaPeriod.quotaTarget) * 100
        : 0;
    quotaPeriod.quotaPercentage = newPercentage;
    quotaPeriod.quotaLevel = calculateQuotaLevel(newPercentage);

    await quotaPeriod.save();

    res.status(201).json({
      success: true,
      data: {
        agreement,
        quotaPeriod: {
          actualSales: quotaPeriod.actualSales,
          quotaTarget: quotaPeriod.quotaTarget,
          quotaPercentage: quotaPeriod.quotaPercentage,
          quotaLevel: quotaPeriod.quotaLevel,
        },
      },
      message: "Agreement created successfully",
    });
  } catch (error) {
    console.error("Error creating agreement:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create agreement",
    });
  }
};

/**
 * Get all agreements
 */
export const getAllAgreements = async (req, res) => {
  try {
    const { salesPersonId, status, startDate, endDate, limit = 50, skip = 0 } = req.query;
    const filter = {};

    if (salesPersonId) {
      filter["salesPerson.id"] = salesPersonId;
    }
    if (status) {
      filter.status = status;
    }
    if (startDate || endDate) {
      filter.signedDate = {};
      if (startDate) filter.signedDate.$gte = new Date(startDate);
      if (endDate) filter.signedDate.$lte = new Date(endDate);
    }

    const total = await Agreement.countDocuments(filter);
    const agreements = await Agreement.find(filter)
      .sort({ signedDate: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: agreements,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
        hasMore: parseInt(skip) + agreements.length < total,
      },
    });
  } catch (error) {
    console.error("Error fetching agreements:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch agreements",
    });
  }
};

/**
 * Get agreement by ID
 */
export const getAgreementById = async (req, res) => {
  try {
    const { id } = req.params;
    const agreement = await Agreement.findOne({
      $or: [{ _id: id }, { agreementNumber: id }],
    });

    if (!agreement) {
      return res.status(404).json({
        success: false,
        error: "Agreement not found",
      });
    }

    res.json({
      success: true,
      data: agreement,
    });
  } catch (error) {
    console.error("Error fetching agreement:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch agreement",
    });
  }
};

/**
 * Update agreement status
 */
export const updateAgreementStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, approvedBy } = req.body;

    const agreement = await Agreement.findById(id);

    if (!agreement) {
      return res.status(404).json({
        success: false,
        error: "Agreement not found",
      });
    }

    agreement.status = status;
    if (status === "approved" && approvedBy) {
      agreement.approvedBy = approvedBy;
      agreement.approvedAt = new Date();
    }

    await agreement.save();

    res.json({
      success: true,
      data: agreement,
      message: "Agreement status updated",
    });
  } catch (error) {
    console.error("Error updating agreement status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update agreement status",
    });
  }
};

// ============================================================
// QUOTA TRACKING
// ============================================================

/**
 * Get quota status for a sales person
 */
export const getQuotaStatus = async (req, res) => {
  try {
    const { salesPersonId } = req.params;
    const { periodType = "monthly", date } = req.query;

    // Get employee
    const employee = await Employee.findOne(buildEmployeeQuery(salesPersonId));

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: "Sales person not found",
      });
    }

    const targetDate = date ? new Date(date) : new Date();
    const { start, end, label } = getPeriodBoundaries(targetDate, periodType);

    // Get or create quota period
    let quotaPeriod = await QuotaPeriod.findOne({
      salesPersonId: employee.username,
      periodStart: start,
      periodType,
    });

    if (!quotaPeriod) {
      quotaPeriod = new QuotaPeriod({
        salesPersonId: employee.username,
        salesPersonName: employee.fullName,
        periodType,
        periodStart: start,
        periodEnd: end,
        periodLabel: label,
        quotaTarget: employee.quota?.monthlyTarget || 50000,
        status: "in_progress",
      });
      await quotaPeriod.save();
    }

    // Calculate values
    const quotaPercentage =
      quotaPeriod.quotaTarget > 0
        ? (quotaPeriod.actualSales / quotaPeriod.quotaTarget) * 100
        : 0;
    const quotaLevel = calculateQuotaLevel(quotaPercentage);

    // Get recent agreements
    const recentAgreements = await Agreement.find({
      "salesPerson.id": employee.username,
      signedDate: { $gte: start, $lte: end },
    })
      .sort({ signedDate: -1 })
      .limit(5);

    // Get commission rate for current level
    let rules = await CommissionRules.findOne({ isActive: true });
    if (!rules) {
      rules = DEFAULT_COMMISSION_RULES;
    }
    const commissionRate = rules.quotaRates[quotaLevel] || 3;

    // Calculate progress
    const toReachQuota = Math.max(0, quotaPeriod.quotaTarget - quotaPeriod.actualSales);
    const toReachDouble = Math.max(0, quotaPeriod.quotaTarget * 2 - quotaPeriod.actualSales);

    res.json({
      success: true,
      data: {
        salesPerson: {
          id: employee.username,
          name: employee.fullName,
          role: employee.salesRole || "field_sales",
        },
        period: {
          type: periodType,
          label,
          start: start.toISOString(),
          end: end.toISOString(),
        },
        quota: {
          target: quotaPeriod.quotaTarget,
          actual: quotaPeriod.actualSales,
          percentage: quotaPercentage,
          level: quotaLevel,
          commissionRate,
        },
        progress: {
          toReachQuota,
          toReachDouble,
          agreementCount: quotaPeriod.agreementCount,
          newBusinessCount: quotaPeriod.newBusinessCount,
          renewalCount: quotaPeriod.renewalCount,
        },
        commission: {
          earned: quotaPeriod.totalCommissionEarned,
        },
        recentAgreements,
      },
    });
  } catch (error) {
    console.error("Error fetching quota status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch quota status",
    });
  }
};

/**
 * Get quota history for a sales person
 */
export const getQuotaHistory = async (req, res) => {
  try {
    const { salesPersonId } = req.params;
    const { limit = 12 } = req.query;

    const quotaPeriods = await QuotaPeriod.find({ salesPersonId })
      .sort({ periodStart: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: quotaPeriods,
    });
  } catch (error) {
    console.error("Error fetching quota history:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch quota history",
    });
  }
};

/**
 * Get current quota level for commission calculation
 */
export const getCurrentQuotaLevel = async (req, res) => {
  try {
    const { salesPersonId } = req.params;

    const employee = await Employee.findOne(buildEmployeeQuery(salesPersonId));

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: "Sales person not found",
      });
    }

    const periodType = employee.quota?.periodType || "monthly";
    const { start } = getPeriodBoundaries(new Date(), periodType);

    const quotaPeriod = await QuotaPeriod.findOne({
      salesPersonId: employee.username,
      periodStart: start,
      periodType,
    });

    if (!quotaPeriod) {
      return res.json({
        success: true,
        data: {
          salesPersonId: employee.username,
          salesPersonName: employee.fullName,
          quotaLevel: "below",
          quotaPercentage: 0,
          quotaTarget: employee.quota?.monthlyTarget || 50000,
          actualSales: 0,
        },
      });
    }

    const quotaPercentage =
      quotaPeriod.quotaTarget > 0
        ? (quotaPeriod.actualSales / quotaPeriod.quotaTarget) * 100
        : 0;

    res.json({
      success: true,
      data: {
        salesPersonId: employee.username,
        salesPersonName: employee.fullName,
        quotaLevel: calculateQuotaLevel(quotaPercentage),
        quotaPercentage,
        quotaTarget: quotaPeriod.quotaTarget,
        actualSales: quotaPeriod.actualSales,
      },
    });
  } catch (error) {
    console.error("Error fetching quota level:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch quota level",
    });
  }
};

/**
 * Get leaderboard
 */
export const getLeaderboard = async (req, res) => {
  try {
    const { periodType = "monthly", date } = req.query;
    const targetDate = date ? new Date(date) : new Date();
    const { start, end, label } = getPeriodBoundaries(targetDate, periodType);

    const quotaPeriods = await QuotaPeriod.find({
      periodType,
      periodStart: start,
    }).sort({ actualSales: -1 });

    const leaderboard = quotaPeriods.map((qp, index) => ({
      rank: index + 1,
      salesPersonId: qp.salesPersonId,
      salesPersonName: qp.salesPersonName,
      actualSales: qp.actualSales,
      quotaTarget: qp.quotaTarget,
      quotaPercentage: qp.quotaPercentage,
      quotaLevel: qp.quotaLevel,
      agreementCount: qp.agreementCount,
      totalCommission: qp.totalCommissionEarned,
    }));

    res.json({
      success: true,
      data: {
        period: label,
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
        leaderboard,
      },
    });
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch leaderboard",
    });
  }
};
