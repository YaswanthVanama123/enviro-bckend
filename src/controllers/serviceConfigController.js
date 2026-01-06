// src/controllers/serviceConfigController.js
import {
  validateCreateServiceConfig,
  validateReplaceServiceConfig,
  validatePartialUpdateServiceConfig,
} from "../validations/serviceConfigValidation.js";

import mongoose from "mongoose";
import ServiceAgreementTemplate from '../models/ServiceAgreementTemplate.js';

import {
  createServiceConfig,
  getAllServiceConfigs,
  getServiceConfigById,
  getActiveServiceConfigs,
  getLatestConfigForService,
  replaceServiceConfig,
  mergeServiceConfig,
  deleteServiceConfig,
  deleteServiceConfigsByServiceId,
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

// ⚡ OPTIMIZED: Get all service pricing data + service agreement template (used by form-filling page)
export async function getAllServicePricingController(req, res, next) {
  try {
    const startTime = Date.now();
    console.log('⚡ [GET-ALL-PRICING] Starting optimized query...');

    // ⚡ OPTIMIZED: Fetch both service configs and service agreement template in parallel
    const [allConfigs, serviceAgreementTemplate] = await Promise.all([
      getAllServiceConfigs({}),
      ServiceAgreementTemplate.findOne({ isActive: true })
        .select('-__v')
        .lean()
        .exec()
    ]);

    // ⚡ If no template exists, create default one
    let template = serviceAgreementTemplate;
    if (!template) {
      console.log('📝 [GET-ALL-PRICING] No template found, creating default...');
      const newTemplate = await ServiceAgreementTemplate.create({
        name: 'default',
        isActive: true
      });
      template = newTemplate.toObject();
    }

    // ⚡ OPTIMIZED: Transform to focus on pricing data only (exclude heavy fields)
    const pricingData = allConfigs.map(config => ({
      serviceId: config.serviceId,
      label: config.label,
      isActive: config.isActive,
      config: config.config,           // Contains pricing information
      defaultFormState: config.defaultFormState,
      version: config.version
    }));

    const queryTime = Date.now() - startTime;
    console.log(`⚡ [GET-ALL-PRICING] Returned ${pricingData.length} configs + service agreement template in ${queryTime}ms`);

    // ⚡ Return both service configs and service agreement template in one response
    res.json({
      serviceConfigs: pricingData,
      serviceAgreementTemplate: {
        id: template._id,
        name: template.name,
        term1: template.term1,
        term2: template.term2,
        term3: template.term3,
        term4: template.term4,
        term5: template.term5,
        term6: template.term6,
        term7: template.term7,
        noteText: template.noteText,
        titleText: template.titleText,
        subtitleText: template.subtitleText,
        retainDispensersLabel: template.retainDispensersLabel,
        disposeDispensersLabel: template.disposeDispensersLabel,
        emSalesRepLabel: template.emSalesRepLabel,
        insideSalesRepLabel: template.insideSalesRepLabel,
        authorityText: template.authorityText,
        customerContactLabel: template.customerContactLabel,
        customerSignatureLabel: template.customerSignatureLabel,
        customerDateLabel: template.customerDateLabel,
        emFranchiseeLabel: template.emFranchiseeLabel,
        emSignatureLabel: template.emSignatureLabel,
        emDateLabel: template.emDateLabel,
        pageNumberText: template.pageNumberText,
        isActive: template.isActive,
        updatedAt: template.updatedAt
      }
    });
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

export async function deleteServiceConfigController(req, res, next) {
  try {
    const { id } = req.params;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid ID format. Expected MongoDB ObjectId.",
        hint: "If you want to delete by serviceId (e.g., 'refreshPowerScrub'), use DELETE /api/service-configs/service/:serviceId"
      });
    }

    const deleted = await deleteServiceConfig(id);

    if (!deleted) {
      return res.status(404).json({ message: "ServiceConfig not found" });
    }

    res.json({
      success: true,
      message: "ServiceConfig deleted successfully",
      deletedId: id,
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteServiceConfigsByServiceIdController(req, res, next) {
  try {
    const { serviceId } = req.params;

    if (!serviceId || serviceId.trim() === '') {
      return res.status(400).json({
        message: "serviceId parameter is required"
      });
    }

    const result = await deleteServiceConfigsByServiceId(serviceId);

    if (result.deletedCount === 0) {
      return res.status(404).json({
        message: `No service configs found for serviceId: ${serviceId}`
      });
    }

    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} service config(s) for serviceId: ${serviceId}`,
      serviceId: serviceId,
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    next(err);
  }
}
