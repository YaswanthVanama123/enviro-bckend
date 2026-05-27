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

    const matchFilter = { isDeleted: { $ne: true } };
    if (status) matchFilter.status = status;
    if (startDate || endDate) {
      matchFilter.createdAt = {};
      if (startDate) matchFilter.createdAt.$gte = new Date(startDate);
      if (endDate) matchFilter.createdAt.$lte = new Date(endDate);
    }

    const results = await CustomerHeaderDoc.aggregate([
      { $match: matchFilter },
      { $group: { _id: '$createdBy', totalAgreements: { $sum: 1 }, totalRevenue: { $sum: { $ifNull: ['$payload.summary.totalMonthlyRevenue', 0] } } } },
      { $sort: { totalRevenue: -1 } }
    ]);

    res.json({
      success: true,
      totalEmployees: results.length,
      employees: results.map(r => ({ userId: r._id, totalAgreements: r.totalAgreements, totalRevenue: r.totalRevenue }))
    });
  } catch (err) {
    console.error("getAllEmployeesCommissions error:", err);
    res.status(500).json({ success: false, error: "Failed to get all employees commissions", detail: err?.message });
  }
}

export async function getEmployeeCommissions(req, res) {
  try {
    const { employeeId } = req.params;
    const { startDate, endDate, status, page = 1, limit = 20 } = req.query;

    const filter = { createdBy: employeeId, isDeleted: { $ne: true } };
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const [total, agreements] = await Promise.all([
      CustomerHeaderDoc.countDocuments(filter),
      CustomerHeaderDoc.find(filter)
        .select({ _id: 1, 'payload.headerTitle': 1, 'payload.summary.totalMonthlyRevenue': 1, status: 1, createdAt: 1 })
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .lean()
    ]);

    const totalRevenue = agreements.reduce((sum, a) => sum + (a.payload?.summary?.totalMonthlyRevenue || 0), 0);

    res.json({
      success: true,
      employeeId,
      total,
      page: Number(page),
      limit: Number(limit),
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
    console.error("getEmployeeCommissions error:", err);
    res.status(500).json({ success: false, error: "Failed to get employee commissions", detail: err?.message });
  }
}
