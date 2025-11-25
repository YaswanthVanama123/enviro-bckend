// src/controllers/serviceConfigController.js
import {
  validateCreateServiceConfig,
  validateReplaceServiceConfig,
  validatePartialUpdateServiceConfig,
} from "../validations/serviceConfigValidation.js";

import {
  createServiceConfig,
  getAllServiceConfigs,
  getServiceConfigById,
  getActiveServiceConfigs,
  getLatestConfigForService,
  replaceServiceConfig,
  mergeServiceConfig,
} from "../services/serviceConfigService.js";

export async function createServiceConfigController(req, res, next) {
  try {
    const { error, value } = validateCreateServiceConfig(req.body);
    if (error) {
      return res.status(400).json({
        message: "Validation error",
        details: error.details.map((d) => d.message),
      });
    }

    const created = await createServiceConfig(value);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

export async function getAllServiceConfigsController(req, res, next) {
  try {
    const { serviceId } = req.query;
    const result = await getAllServiceConfigs({ serviceId });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getActiveServiceConfigsController(req, res, next) {
  try {
    const { serviceId } = req.query;
    const result = await getActiveServiceConfigs(serviceId);

    if (serviceId && !result) {
      return res.status(404).json({
        message: `No active config found for serviceId=${serviceId}`,
      });
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getServiceConfigByIdController(req, res, next) {
  try {
    const { id } = req.params;
    const doc = await getServiceConfigById(id);

    if (!doc) {
      return res.status(404).json({ message: "ServiceConfig not found" });
    }

    res.json(doc);
  } catch (err) {
    next(err);
  }
}

export async function getLatestConfigForServiceController(req, res, next) {
  try {
    const { serviceId } = req.params;
    const doc = await getLatestConfigForService(serviceId);

    if (!doc) {
      return res.status(404).json({
        message: `No config found for serviceId=${serviceId}`,
      });
    }

    res.json(doc);
  } catch (err) {
    next(err);
  }
}

export async function replaceServiceConfigController(req, res, next) {
  try {
    const { id } = req.params;

    const { error, value } = validateReplaceServiceConfig(req.body);
    if (error) {
      return res.status(400).json({
        message: "Validation error",
        details: error.details.map((d) => d.message),
      });
    }

    const updated = await replaceServiceConfig(id, value);

    if (!updated) {
      return res.status(404).json({ message: "ServiceConfig not found" });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function partialUpdateServiceConfigController(req, res, next) {
  try {
    const { id } = req.params;

    const { error, value } = validatePartialUpdateServiceConfig(req.body);
    if (error) {
      return res.status(400).json({
        message: "Validation error",
        details: error.details.map((d) => d.message),
      });
    }

    const updated = await mergeServiceConfig(id, value);

    if (!updated) {
      return res.status(404).json({ message: "ServiceConfig not found" });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
}
