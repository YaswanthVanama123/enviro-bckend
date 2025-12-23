// src/routes/emailRoutes.js
import { Router } from 'express';
import {
  sendEmailWithPdf,
  verifyEmailConfiguration,
  sendTestEmail
} from '../controllers/emailController.js';

const router = Router();

/**
 * Email Routes
 *
 * All routes are prefixed with /api/email
 */

// POST /api/email/send - Send email with PDF attachment
router.post('/send', sendEmailWithPdf);

// GET /api/email/verify-config - Verify email configuration
router.get('/verify-config', verifyEmailConfiguration);

// POST /api/email/send-test - Send test email
router.post('/send-test', sendTestEmail);

export default router;
