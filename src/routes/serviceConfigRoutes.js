import express from "express";
import * as serviceConfigController from "../controllers/serviceConfigController.js";

const router = express.Router();

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

// Full replace by id
router.put(
  "/:id",
  serviceConfigController.replaceServiceConfigController
);

// Partial update by id
router.put(
  "/:id/partial",
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

export default router;
