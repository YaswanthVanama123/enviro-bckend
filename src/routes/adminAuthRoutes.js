// src/routes/adminAuthRoutes.js
import { Router } from "express";
import {
  adminLogin,
  changeAdminPassword,
  getAdminProfile,
  createAdminAccount,
} from "../controllers/adminAuthController.js";
import { requireAdminAuth } from "../middleware/adminAuth.js";

const router = Router();

// Login (no token)
router.post("/login", adminLogin);

// Authenticated routes
router.get("/me", requireAdminAuth, getAdminProfile);
router.post("/change-password", requireAdminAuth, changeAdminPassword);
router.post("/create", createAdminAccount);

export default router;
