/**
 * Agreement Commission Controller
 * Handles agreement-based commission calculations
 */

import mongoose from "mongoose";
import { CustomerHeaderDoc } from "../../models/agreement/index.js";

export async function getUserCommissions(req, res) {
  try {
    // Get username from the authenticated user (set by requireAuth middleware)
    const username = req.user?.username;

    if (!username) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const { startDate, endDate, status } = req.query;

    const filter = { createdBy: username, isDeleted: { $ne: true } };
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    // Fetch all agreements for this user - include commission data
    const agreements = await CustomerHeaderDoc.find(filter)
      .select({
        _id: 1,
        'payload.headerTitle': 1,
        'payload.summary': 1,
        'payload.agreement.startDate': 1,
        'payload.commission': 1,
        status: 1,
        createdAt: 1
      })
      .sort({ createdAt: -1 })
      .lean();

    // Calculate totals using saved commission data
    let totalWeeklyCommission = 0;
    let totalAnnualCommission = 0;
    let totalContractCommission = 0;
    let totalContractValue = 0;
    let totalRateSum = 0;
    let agreementsWithCommission = 0;

    // Status breakdown
    const byStatus = {
      draft: { count: 0, commission: 0 },
      saved: { count: 0, commission: 0 },
      pending: { count: 0, commission: 0 },
      approved: { count: 0, commission: 0 },
      active: { count: 0, commission: 0 }
    };

    const commissions = agreements.map(a => {
      const summary = a.payload?.summary || {};
      const savedCommission = a.payload?.commission || {};
      const contractMonths = summary.contractMonths || 12;

      // Use saved commission data if available, otherwise fall back to basic calculation
      const hasSavedCommission = savedCommission.annualCommission !== undefined ||
                                  savedCommission.weeklyCommission !== undefined ||
                                  savedCommission.contractCommission !== undefined;

      let weeklyCommission = 0;
      let annualCommission = 0;
      let contractCommission = 0;
      let finalRate = 6;
      let breakdown = {};

      if (hasSavedCommission) {
        // Use saved commission data from the agreement
        weeklyCommission = savedCommission.weeklyCommission || 0;
        annualCommission = savedCommission.annualCommission || 0;
        contractCommission = savedCommission.contractCommission || (annualCommission * (contractMonths / 12));
        finalRate = savedCommission.finalCommissionRate || savedCommission.input?.baseRate || 6;
        breakdown = savedCommission.breakdown || {};

        console.log(`[COMMISSION] Agreement ${a._id}: Using saved commission - annual: $${annualCommission.toFixed(2)}, rate: ${finalRate}%`);
      } else {
        // Fallback: basic calculation (for older agreements without saved commission)
        const monthlyValue = summary.serviceAgreementTotal || 0;
        const monthlyCommission = monthlyValue * 0.06;
        weeklyCommission = monthlyCommission / 4.33;
        annualCommission = monthlyCommission * 12;
        contractCommission = monthlyCommission * contractMonths;
        finalRate = 6;
        breakdown = {
          baseRate: 6,
          agreementMultiplier: 100,
          accountTypeAdjustment: 0,
          greenlineBonus: 0,
          insideSalesDeduction: 0
        };

        console.log(`[COMMISSION] Agreement ${a._id}: Using fallback calculation - annual: $${annualCommission.toFixed(2)}`);
      }

      // Get contract value from summary
      const monthlyValue = summary.serviceAgreementTotal || 0;
      const contractValue = monthlyValue * contractMonths;

      totalWeeklyCommission += weeklyCommission;
      totalAnnualCommission += annualCommission;
      totalContractCommission += contractCommission;
      totalContractValue += contractValue;

      if (finalRate > 0) {
        totalRateSum += finalRate;
        agreementsWithCommission++;
      }

      // Map status for counting
      let statusKey = 'draft';
      if (a.status === 'saved') statusKey = 'saved';
      else if (a.status === 'pending_approval') statusKey = 'pending';
      else if (a.status === 'approved_salesman' || a.status === 'approved_admin') statusKey = 'approved';
      else if (a.status === 'active' || a.status === 'finalized') statusKey = 'active';

      byStatus[statusKey].count += 1;
      byStatus[statusKey].commission += contractCommission;

      return {
        id: a._id.toString(),
        title: a.payload?.headerTitle || 'Untitled',
        status: a.status,
        createdAt: a.createdAt,
        startDate: a.payload?.agreement?.startDate || summary.startDate || null,
        contractMonths,
        monthlyValue,
        contractValue,
        commission: {
          rate: finalRate,
          weekly: weeklyCommission,
          monthly: annualCommission / 12,
          annual: annualCommission,
          total: contractCommission,
          breakdown: {
            baseRate: breakdown.baseRate || finalRate,
            agreementTerm: `${contractMonths} months`,
            multiplier: breakdown.agreementMultiplier || 100,
            accountTypeAdjustment: breakdown.accountTypeAdjustment || 0,
            greenlineBonus: breakdown.greenlineBonus || 0,
            insideSalesDeduction: breakdown.insideSalesDeduction || 0
          }
        }
      };
    });

    const averageRate = agreementsWithCommission > 0 ? totalRateSum / agreementsWithCommission : 6;

    res.json({
      success: true,
      user: username,
      totals: {
        totalAgreements: agreements.length,
        totalWeeklyCommission,
        totalMonthlyCommission: totalAnnualCommission / 12,
        totalAnnualCommission,
        totalContractCommission,
        totalContractValue,
        averageCommissionRate: averageRate
      },
      byStatus,
      commissions
    });
  } catch (err) {
    console.error("getUserCommissions error:", err);
    res.status(500).json({ success: false, error: "Failed to get user commissions", detail: err?.message });
  }
}

export async function getAllEmployeesCommissions(req, res) {
  try {
    const { startDate, endDate, status } = req.query;

    const matchFilter = { isDeleted: { $ne: true }, createdBy: { $ne: null, $exists: true, $ne: '' } };
    if (status) matchFilter.status = status;
    if (startDate || endDate) {
      matchFilter.createdAt = {};
      if (startDate) matchFilter.createdAt.$gte = new Date(startDate);
      if (endDate) matchFilter.createdAt.$lte = new Date(endDate);
    }

    // Fetch all agreements with commission data
    const agreements = await CustomerHeaderDoc.find(matchFilter)
      .select({
        _id: 1,
        createdBy: 1,
        status: 1,
        'payload.summary': 1,
        'payload.commission': 1
      })
      .lean();

    // Group by employee and calculate totals
    const employeeMap = new Map();

    agreements.forEach(a => {
      const username = a.createdBy;
      if (!username || !username.trim()) return;

      if (!employeeMap.has(username)) {
        employeeMap.set(username, {
          userId: username,
          totalAgreements: 0,
          totalRevenue: 0,
          totalCommission: 0,
          statusCounts: {
            draft: 0,
            saved: 0,
            pending_approval: 0,
            approved: 0,
            active: 0
          }
        });
      }

      const emp = employeeMap.get(username);
      const summary = a.payload?.summary || {};
      const savedCommission = a.payload?.commission || {};

      // Get monthly value
      const monthlyValue = summary.serviceAgreementTotal || summary.totalMonthlyRevenue || 0;

      emp.totalAgreements++;
      emp.totalRevenue += monthlyValue;

      // Use annualCommission from saved data (same as My Commissions screen)
      let annualCommission = 0;
      if (savedCommission.annualCommission !== undefined) {
        annualCommission = savedCommission.annualCommission || 0;
      } else {
        // Fallback: 6% of annual revenue
        annualCommission = monthlyValue * 12 * 0.06;
      }
      emp.totalCommission += annualCommission;

      // Count by status
      if (a.status === 'draft') emp.statusCounts.draft++;
      else if (a.status === 'saved') emp.statusCounts.saved++;
      else if (a.status === 'pending_approval') emp.statusCounts.pending_approval++;
      else if (a.status === 'approved_salesman' || a.status === 'approved_admin') emp.statusCounts.approved++;
      else if (a.status === 'active' || a.status === 'finalized') emp.statusCounts.active++;
    });

    // Convert to array and sort by commission
    const employees = Array.from(employeeMap.values())
      .sort((a, b) => b.totalCommission - a.totalCommission);

    res.json({
      success: true,
      totalEmployees: employees.length,
      employees
    });
  } catch (err) {
    console.error("getAllEmployeesCommissions error:", err);
    res.status(500).json({ success: false, error: "Failed to get all employees commissions", detail: err?.message });
  }
}

export async function getEmployeeCommissions(req, res) {
  try {
    // Route param is :username - same logic as getUserCommissions but for admin viewing any employee
    const username = req.params.username;

    if (!username) {
      return res.status(400).json({ success: false, error: 'Username is required' });
    }

    const { startDate, endDate, status } = req.query;

    const filter = { createdBy: username, isDeleted: { $ne: true } };
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    // Fetch all agreements for this user - include commission data (same as getUserCommissions)
    const agreements = await CustomerHeaderDoc.find(filter)
      .select({
        _id: 1,
        'payload.headerTitle': 1,
        'payload.summary': 1,
        'payload.agreement.startDate': 1,
        'payload.commission': 1,
        status: 1,
        createdAt: 1
      })
      .sort({ createdAt: -1 })
      .lean();

    // Calculate totals using saved commission data (same logic as getUserCommissions)
    let totalWeeklyCommission = 0;
    let totalAnnualCommission = 0;
    let totalContractCommission = 0;
    let totalContractValue = 0;
    let totalRateSum = 0;
    let agreementsWithCommission = 0;

    // Status breakdown
    const byStatus = {
      draft: { count: 0, commission: 0 },
      saved: { count: 0, commission: 0 },
      pending: { count: 0, commission: 0 },
      approved: { count: 0, commission: 0 },
      active: { count: 0, commission: 0 }
    };

    const commissions = agreements.map(a => {
      const summary = a.payload?.summary || {};
      const savedCommission = a.payload?.commission || {};
      const contractMonths = summary.contractMonths || 12;

      // Use saved commission data if available, otherwise fall back to basic calculation
      const hasSavedCommission = savedCommission.annualCommission !== undefined ||
                                  savedCommission.weeklyCommission !== undefined ||
                                  savedCommission.contractCommission !== undefined;

      let weeklyCommission = 0;
      let annualCommission = 0;
      let contractCommission = 0;
      let finalRate = 6;
      let breakdown = {};

      if (hasSavedCommission) {
        // Use saved commission data from the agreement
        weeklyCommission = savedCommission.weeklyCommission || 0;
        annualCommission = savedCommission.annualCommission || 0;
        contractCommission = savedCommission.contractCommission || (annualCommission * (contractMonths / 12));
        finalRate = savedCommission.finalCommissionRate || savedCommission.input?.baseRate || 6;
        breakdown = savedCommission.breakdown || {};
      } else {
        // Fallback: basic calculation (for older agreements without saved commission)
        const monthlyValue = summary.serviceAgreementTotal || 0;
        const monthlyCommission = monthlyValue * 0.06;
        weeklyCommission = monthlyCommission / 4.33;
        annualCommission = monthlyCommission * 12;
        contractCommission = monthlyCommission * contractMonths;
        finalRate = 6;
        breakdown = {
          baseRate: 6,
          agreementMultiplier: 100,
          accountTypeAdjustment: 0,
          greenlineBonus: 0,
          insideSalesDeduction: 0
        };
      }

      // Get contract value from summary
      const monthlyValue = summary.serviceAgreementTotal || 0;
      const contractValue = monthlyValue * contractMonths;

      totalWeeklyCommission += weeklyCommission;
      totalAnnualCommission += annualCommission;
      totalContractCommission += contractCommission;
      totalContractValue += contractValue;

      if (finalRate > 0) {
        totalRateSum += finalRate;
        agreementsWithCommission++;
      }

      // Map status for counting - use annualCommission for status totals (same as My Commissions)
      let statusKey = 'draft';
      if (a.status === 'saved') statusKey = 'saved';
      else if (a.status === 'pending_approval') statusKey = 'pending';
      else if (a.status === 'approved_salesman' || a.status === 'approved_admin') statusKey = 'approved';
      else if (a.status === 'active' || a.status === 'finalized') statusKey = 'active';

      byStatus[statusKey].count += 1;
      byStatus[statusKey].commission += annualCommission;

      return {
        id: a._id.toString(),
        title: a.payload?.headerTitle || 'Untitled',
        status: a.status,
        createdAt: a.createdAt,
        startDate: a.payload?.agreement?.startDate || summary.startDate || null,
        contractMonths,
        monthlyValue,
        contractValue,
        commission: {
          rate: finalRate,
          weekly: weeklyCommission,
          monthly: annualCommission / 12,
          annual: annualCommission,
          total: annualCommission, // Use annual commission as the display total (matches My Commissions)
          breakdown: {
            baseRate: breakdown.baseRate || finalRate,
            agreementTerm: `${contractMonths} months`,
            multiplier: breakdown.agreementMultiplier || 100,
            accountTypeAdjustment: breakdown.accountTypeAdjustment || 0,
            greenlineBonus: breakdown.greenlineBonus || 0,
            insideSalesDeduction: breakdown.insideSalesDeduction || 0
          }
        }
      };
    });

    const averageRate = agreementsWithCommission > 0 ? totalRateSum / agreementsWithCommission : 6;

    res.json({
      success: true,
      employee: username,
      totals: {
        totalAgreements: agreements.length,
        totalWeeklyCommission,
        totalMonthlyCommission: totalAnnualCommission / 12,
        totalAnnualCommission,
        totalContractCommission: totalAnnualCommission, // Use annual as the main display total
        totalContractValue,
        averageCommissionRate: averageRate
      },
      byStatus,
      commissions
    });
  } catch (err) {
    console.error("getEmployeeCommissions error:", err);
    res.status(500).json({ success: false, error: "Failed to get employee commissions", detail: err?.message });
  }
}
