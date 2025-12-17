// src/routes/adminAuthRoutes.js
import { Router } from "express";
import {
  adminLogin,
  changeAdminPassword,
  getAdminProfile,
  createAdminAccount,
  getAdminDashboard,
  getAdminRecentDocuments,
} from "../controllers/adminAuthController.js";
import { requireAdminAuth } from "../middleware/adminAuth.js";

const router = Router();

// Login (no token)
router.post("/login", adminLogin);

// Authenticated routes
router.get("/me", requireAdminAuth, getAdminProfile);
router.post("/change-password", requireAdminAuth, changeAdminPassword);
router.post("/create", createAdminAccount);

// New admin dashboard routes
router.get("/dashboard", requireAdminAuth, getAdminDashboard);
router.get("/recent-documents", requireAdminAuth, getAdminRecentDocuments);

export default router;
