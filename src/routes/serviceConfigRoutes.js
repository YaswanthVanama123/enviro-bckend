import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import * as serviceConfigController from "../controllers/serviceConfigController.js";
import PricingChangeDetector from "../middleware/pricingChangeDetector.js";

const router = express.Router();

// ── Multer — save uploads to /uploads/service-images/ ──────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "../../../uploads/service-images");

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `svc-${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are allowed."));
  },
});

// Create new service config (for a serviceId)
router.post(
  "/",
  
  serviceConfigController.createServiceConfigController
);

// Get all configs (optionally ?serviceId=saniclean)
router.get(
  "/",
  serviceConfigController.getAllServiceConfigsController
);

// Get all active configs OR active for a specific serviceId (?serviceId=saniclean)
router.get(
  "/active",
  serviceConfigController.getActiveServiceConfigsController
);

// Get all service pricing (both active and inactive) - for frontend pricing lookup
router.get(
  "/pricing",
  serviceConfigController.getAllServicePricingController
);

// Get latest config (regardless of active) for a particular service
router.get(
  "/service/:serviceId/latest",
  serviceConfigController.getLatestConfigForServiceController
);

// Get a single config by document id
router.get(
  "/:id",
  serviceConfigController.getServiceConfigByIdController
);

// Full replace by id (with backup middleware)
router.put(
  "/:id",
  PricingChangeDetector.beforeServiceConfigUpdate,
  PricingChangeDetector.addBackupInfoToResponse,
  serviceConfigController.replaceServiceConfigController
);

// Partial update by id (with backup middleware)
router.put(
  "/:id/partial",
  PricingChangeDetector.beforeServiceConfigUpdate,
  PricingChangeDetector.addBackupInfoToResponse,
  serviceConfigController.partialUpdateServiceConfigController
);

// Delete config by id
router.delete(
  "/:id",
  serviceConfigController.deleteServiceConfigController
);

// Delete all configs for a serviceId
router.delete(
  "/service/:serviceId",
  serviceConfigController.deleteServiceConfigsByServiceIdController
);

// Upload an image for a service config
router.post(
  "/:id/upload-image",
  upload.single("image"),
  serviceConfigController.uploadServiceImageController
);

export default router;
