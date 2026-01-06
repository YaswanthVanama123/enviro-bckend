// src/routes/serviceAgreementTemplateRoutes.js
import express from 'express';
import { getActiveTemplate, updateTemplate } from '../controllers/serviceAgreementTemplateController.js';

const router = express.Router();

/**
 * GET /api/service-agreement-template/active
 * Get the active service agreement template
 */
router.get('/active', getActiveTemplate);

/**
 * PUT /api/service-agreement-template
 * Update the service agreement template
 */
router.put('/', updateTemplate);

export default router;
