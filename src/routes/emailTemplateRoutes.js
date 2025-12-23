// src/routes/emailTemplateRoutes.js
import { Router } from 'express';
import {
  getActiveTemplate,
  updateTemplate,
  testTemplate
} from '../controllers/emailTemplateController.js';

const router = Router();

/**
 * Email Template Routes
 *
 * All routes are prefixed with /api/email-template
 */

// GET /api/email-template/active - Get active email template
router.get('/active', getActiveTemplate);

// PUT /api/email-template - Update email template
router.put('/', updateTemplate);

// GET /api/email-template/test - Test template system
router.get('/test', testTemplate);

export default router;
