// src/validations/serviceConfigValidation.js
import Joi from "joi";

// Base object for create/replace
const baseSchema = {
  serviceId: Joi.string().trim().required(),
  version: Joi.string().trim().required(),

  label: Joi.string().allow("").optional(),
  description: Joi.string().allow("").optional(),

  // pricing config JSON (kept flexible)
  config: Joi.object().unknown(true).required(),

  // default form state JSON
  defaultFormState: Joi.object().unknown(true).optional(),

  isActive: Joi.boolean().optional(),
  adminByDisplay: Joi.boolean().optional(), // ✅ Added missing field
  tags: Joi.array().items(Joi.string()).optional(),
};

const createServiceConfigSchema = Joi.object(baseSchema);

const replaceServiceConfigSchema = Joi.object(baseSchema);

const partialUpdateServiceConfigSchema = Joi.object({
  serviceId: Joi.string().trim().optional(),
  version: Joi.string().trim().optional(),
  label: Joi.string().allow("").optional(),
  description: Joi.string().allow("").optional(),
  config: Joi.object().unknown(true).optional(),
  defaultFormState: Joi.object().unknown(true).optional(),
  isActive: Joi.boolean().optional(),
  adminByDisplay: Joi.boolean().optional(), // ✅ Added missing field
  tags: Joi.array().items(Joi.string()).optional(),
}).min(1); // at least one field must be present

export function validateCreateServiceConfig(payload) {
  return createServiceConfigSchema.validate(payload, { abortEarly: false });
}

export function validateReplaceServiceConfig(payload) {
  return replaceServiceConfigSchema.validate(payload, { abortEarly: false });
}

export function validatePartialUpdateServiceConfig(payload) {
  return partialUpdateServiceConfigSchema.validate(payload, {
    abortEarly: false,
  });
}
