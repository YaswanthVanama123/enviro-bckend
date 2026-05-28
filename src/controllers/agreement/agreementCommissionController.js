/**
 * Agreement Commission Controller
 * Handles agreement-based commission calculations
 */

import mongoose from "mongoose";
import { CustomerHeaderDoc } from "../../models/agreement/index.js";

export async function getUserCommissions(req, res) {
  try {
    const { userId } = req.params;
    const { startDate, endDate, status } = req.query;

    const filter = { createdBy: userId, isDeleted: { $ne: true } };
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const agreements = await CustomerHeaderDoc.find(filter)
      .select({ _id: 1, 'payload.headerTitle': 1, 'payload.summary.totalMonthlyRevenue': 1, status: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .lean();

    const totalRevenue = agreements.reduce((sum, a) => sum + (a.payload?.summary?.totalMonthlyRevenue || 0), 0);

    res.json({
      success: true,
      userId,
      totalAgreements: agreements.length,
      totalRevenue,
      agreements: agreements.map(a => ({
        id: a._id,
        title: a.payload?.headerTitle || 'Untitled',
        revenue: a.payload?.summary?.totalMonthlyRevenue || 0,
        status: a.status,
        createdAt: a.createdAt
      }))
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

    const results = await CustomerHeaderDoc.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$createdBy',
          totalAgreements: { $sum: 1 },
          // Try multiple fields for revenue calculation
          totalRevenue: {
            $sum: {
              $ifNull: [
                '$payload.summary.serviceAgreementTotal',
                { $ifNull: ['$payload.summary.totalMonthlyRevenue', 0] }
              ]
            }
          },
          // Count by status
          draftCount: { $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] } },
          savedCount: { $sum: { $cond: [{ $eq: ['$status', 'saved'] }, 1, 0] } },
          pendingCount: { $sum: { $cond: [{ $eq: ['$status', 'pending_approval'] }, 1, 0] } },
          approvedCount: {
            $sum: {
              $cond: [
                { $or: [{ $eq: ['$status', 'approved_salesman'] }, { $eq: ['$status', 'approved_admin'] }] },
                1,
                0
              ]
            }
          },
          activeCount: {
            $sum: {
              $cond: [
                { $or: [{ $eq: ['$status', 'active'] }, { $eq: ['$status', 'finalized'] }] },
                1,
                0
              ]
            }
          }
        }
      },
      { $sort: { totalRevenue: -1 } }
    ]);

    // Filter out any results where _id is null, empty, or undefined
    const filteredResults = results.filter(r => r._id && r._id.trim && r._id.trim() !== '');

    res.json({
      success: true,
      totalEmployees: filteredResults.length,
      employees: filteredResults.map(r => ({
        userId: r._id,
        totalAgreements: r.totalAgreements,
        totalRevenue: r.totalRevenue,
        statusCounts: {
          draft: r.draftCount,
          saved: r.savedCount,
          pending_approval: r.pendingCount,
          approved: r.approvedCount,
          active: r.activeCount
        }
      }))
    });
  } catch (err) {
    console.error("getAllEmployeesCommissions error:", err);
    res.status(500).json({ success: false, error: "Failed to get all employees commissions", detail: err?.message });
  }
}

export async function getEmployeeCommissions(req, res) {
  try {
    // Route param is :username
    const { username } = req.params;
    const { startDate, endDate, status } = req.query;

    const filter = { createdBy: username, isDeleted: { $ne: true } };
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    // Fetch all agreements for this employee
    const agreements = await CustomerHeaderDoc.find(filter)
      .select({
        _id: 1,
        'payload.headerTitle': 1,
        'payload.summary': 1,
        'payload.contractMonths': 1,
        'payload.startDate': 1,
        status: 1,
        createdAt: 1
      })
      .sort({ createdAt: -1 })
      .lean();

    // Calculate totals and commission data
    let totalMonthlyCommission = 0;
    let totalContractCommission = 0;
    let totalContractValue = 0;
    const commissionRate = 6; // Default 6% commission rate

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
      const contractMonths = a.payload?.contractMonths || summary.contractMonths || 12;
      const monthlyValue = summary.serviceAgreementTotal || summary.totalMonthlyRevenue || 0;
      const contractValue = monthlyValue * contractMonths;
      const monthlyCommission = monthlyValue * (commissionRate / 100);
      const totalCommission = monthlyCommission * contractMonths;

      totalMonthlyCommission += monthlyCommission;
      totalContractCommission += totalCommission;
      totalContractValue += contractValue;

      // Map status for counting
      let statusKey = 'draft';
      if (a.status === 'saved') statusKey = 'saved';
      else if (a.status === 'pending_approval') statusKey = 'pending';
      else if (a.status === 'approved_salesman' || a.status === 'approved_admin') statusKey = 'approved';
      else if (a.status === 'active' || a.status === 'finalized') statusKey = 'active';

      byStatus[statusKey].count += 1;
      byStatus[statusKey].commission += totalCommission;

      return {
        id: a._id.toString(),
        title: a.payload?.headerTitle || 'Untitled',
        status: a.status,
        createdAt: a.createdAt,
        startDate: a.payload?.startDate || summary.startDate || null,
        contractMonths,
        monthlyValue,
        contractValue,
        commission: {
          rate: commissionRate,
          monthly: monthlyCommission,
          total: totalCommission,
          breakdown: {
            baseRate: commissionRate,
            agreementTerm: `${contractMonths} months`,
            multiplier: 100,
            accountTypeAdjustment: 0,
            greenlineBonus: 0,
            insideSalesDeduction: 0
          }
        }
      };
    });

    res.json({
      success: true,
      employee: username,
      totals: {
        totalAgreements: agreements.length,
        totalMonthlyCommission,
        totalContractCommission,
        totalContractValue,
        averageCommissionRate: commissionRate
      },
      byStatus,
      commissions
    });
  } catch (err) {
    console.error("getEmployeeCommissions error:", err);
    res.status(500).json({ success: false, error: "Failed to get employee commissions", detail: err?.message });
  }
}
