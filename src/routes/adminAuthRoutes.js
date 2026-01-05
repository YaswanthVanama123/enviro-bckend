// src/routes/adminAuthRoutes.js
import { Router } from "express";
import {
  adminLogin,
  changeAdminPassword,
  getAdminProfile,
  createAdminAccount,
  getAdminDashboard,
  getAdminRecentDocuments,
  getAdminDashboardStatusCounts,
  resetAdminPassword,
} from "../controllers/adminAuthController.js";
import { requireAdminAuth } from "../middleware/adminAuth.js";

const router = Router();

// Public routes (no authentication required)
router.post("/login", adminLogin);
router.post("/reset-password", resetAdminPassword);

// Authenticated routes
router.get("/me", requireAdminAuth, getAdminProfile);
router.post("/change-password", requireAdminAuth, changeAdminPassword);
router.post("/create", createAdminAccount);

// New admin dashboard routes
router.get("/dashboard", requireAdminAuth, getAdminDashboard);
router.get("/recent-documents", requireAdminAuth, getAdminRecentDocuments);
router.get("/dashboard/status-counts", requireAdminAuth, getAdminDashboardStatusCounts);

export default router;
