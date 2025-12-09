// src/services/serviceConfigService.js
import ServiceConfig from "../models/ServiceConfig.js";

/**
 * Create a new service config.
 * If isActive=true, deactivates any other active configs for the same serviceId.
 */
export async function createServiceConfig(data) {
  if (data.isActive) {
    await ServiceConfig.updateMany(
      { serviceId: data.serviceId, isActive: true },
      { $set: { isActive: false } }
    );
  }

  const doc = new ServiceConfig(data);
  return doc.save();
}

/**
 * Get all configs.
 * Optionally filter by serviceId (e.g. /api/service-configs?serviceId=saniclean)
 */
export async function getAllServiceConfigs({ serviceId } = {}) {
  const filter = {};
  if (serviceId) {
    filter.serviceId = serviceId;
  }
  return ServiceConfig.find(filter).sort({ serviceId: 1, createdAt: -1 }).lean();
}

/**
 * Get a single config by Mongo _id.
 */
export async function getServiceConfigById(id) {
  return ServiceConfig.findById(id);
}

/**
 * Get active configs.
 * If serviceId is provided, returns only that service's active config (or null).
 * If not, returns array of all active configs.
 */
export async function getActiveServiceConfigs(serviceId) {
  if (serviceId) {
    return ServiceConfig.findOne({ serviceId, isActive: true })
      .sort({ updatedAt: -1 })
      .lean();
  }
  return ServiceConfig.find({ isActive: true }).sort({ serviceId: 1 }).lean();
}

/**
 * Get the latest config (whether active or not) for a service.
 */
export async function getLatestConfigForService(serviceId) {
  return ServiceConfig.findOne({ serviceId }).sort({ createdAt: -1 }).lean();
}

/**
 * Replace entire config document by id (PUT).
 */
export async function replaceServiceConfig(id, data) {
  const existing = await ServiceConfig.findById(id);
  if (!existing) return null;

  // If this one becomes active, deactivate others for same serviceId
  if (data.isActive) {
    await ServiceConfig.updateMany(
      {
        _id: { $ne: id },
        serviceId: data.serviceId || existing.serviceId,
        isActive: true,
      },
      { $set: { isActive: false } }
    );
  }

  existing.serviceId = data.serviceId;
  existing.version = data.version;
  existing.label = data.label;
  existing.description = data.description;
  existing.config = data.config;
  existing.defaultFormState = data.defaultFormState;
  existing.isActive = !!data.isActive;
  existing.adminByDisplay = data.adminByDisplay !== undefined ? !!data.adminByDisplay : true;
  existing.tags = Array.isArray(data.tags) ? data.tags : existing.tags;

  return existing.save();
}

/**
 * Merge partial update into config document by id (PUT /partial).
 * - Shallow-merge config and defaultFormState
 */
export async function mergeServiceConfig(id, partial) {
  const existing = await ServiceConfig.findById(id);
  if (!existing) return null;

  if (partial.serviceId) existing.serviceId = partial.serviceId;
  if (partial.version) existing.version = partial.version;
  if (typeof partial.label === "string") existing.label = partial.label;
  if (typeof partial.description === "string")
    existing.description = partial.description;

  if (partial.config) {
    existing.config = {
      ...(existing.config || {}),
      ...partial.config,
    };
  }

  if (partial.defaultFormState) {
    existing.defaultFormState = {
      ...(existing.defaultFormState || {}),
      ...partial.defaultFormState,
    };
  }

  if (Array.isArray(partial.tags)) {
    existing.tags = partial.tags;
  }

  if (typeof partial.isActive === "boolean") {
    existing.isActive = partial.isActive;

    if (partial.isActive) {
      await ServiceConfig.updateMany(
        {
          _id: { $ne: id },
          serviceId: existing.serviceId,
          isActive: true,
        },
        { $set: { isActive: false } }
      );
    }
  }

  // Handle adminByDisplay field
  if (typeof partial.adminByDisplay === "boolean") {
    existing.adminByDisplay = partial.adminByDisplay;
  }

  return existing.save();
}

/**
 * Delete a service config by id.
 * Returns the deleted document if successful, null if not found.
 */
export async function deleteServiceConfig(id) {
  return ServiceConfig.findByIdAndDelete(id);
}

/**
 * Delete service configs by serviceId.
 * Returns information about the deletion operation.
 */
export async function deleteServiceConfigsByServiceId(serviceId) {
  return ServiceConfig.deleteMany({ serviceId });
}
