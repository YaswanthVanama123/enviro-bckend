// src/controllers/emailController.js
import { sendEmail as sendEmailService, verifyEmailConfig } from '../services/emailService.js';
import CustomerHeaderDoc from '../models/CustomerHeaderDoc.js';
import VersionPdf from '../models/VersionPdf.js';
import ManualUploadDocument from '../models/ManualUploadDocument.js';
import { compileCustomerHeader } from '../services/pdfService.js';

/**
 * POST /api/email/send
 * Send email with PDF attachment
 *
 * Request body:
 * {
 *   to: "recipient@example.com",
 *   subject: "Email subject",
 *   body: "Email body (HTML supported)",
 *   documentId: "agreement ID or version ID or manual upload ID",
 *   documentType: "agreement" | "version" | "manual-upload", // optional, will auto-detect
 *   watermark: true | false // optional, for version PDFs only
 * }
 */
export async function sendEmailWithPdf(req, res) {
  try {
    const { to, subject, body, documentId, documentType, watermark = false } = req.body;

    console.log('📧 [EMAIL-CONTROLLER] Received email request:', {
      to,
      from: process.env.EMAIL_FROM_ADDRESS || 'default',
      subject,
      documentId,
      documentType: documentType || 'auto-detect',
      watermark
    });

    // Validate required fields
    if (!to || !subject || !documentId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        detail: 'to, subject, and documentId are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid recipient email address'
      });
    }

    // Load and compile PDF based on document type
    let pdfBuffer;
    let fileName;

    if (documentType === 'version') {
      // Load version PDF
      const version = await VersionPdf.findById(documentId);
      if (!version) {
        return res.status(404).json({
          success: false,
          error: 'Version not found',
          detail: `No version found with ID: ${documentId}`
        });
      }

      console.log(`📄 [EMAIL-CONTROLLER] Loading version PDF: ${version.versionLabel}`);

      // Generate PDF on-demand with watermark option
      const compiledPdf = await compileCustomerHeader(version.payloadSnapshot, { watermark });
      if (!compiledPdf || !compiledPdf.buffer) {
        throw new Error('Failed to compile version PDF');
      }

      pdfBuffer = compiledPdf.buffer;
      fileName = watermark
        ? version.fileName.replace('.pdf', '_DRAFT.pdf')
        : version.fileName;

    } else if (documentType === 'manual-upload') {
      // Load manual upload file
      const manualUpload = await ManualUploadDocument.findById(documentId);
      if (!manualUpload) {
        return res.status(404).json({
          success: false,
          error: 'Manual upload file not found',
          detail: `No file found with ID: ${documentId}`
        });
      }

      console.log(`📄 [EMAIL-CONTROLLER] Loading manual upload: ${manualUpload.fileName}`);

      if (!manualUpload.fileBuffer) {
        return res.status(404).json({
          success: false,
          error: 'File buffer not found',
          detail: 'The file has no stored buffer'
        });
      }

      pdfBuffer = manualUpload.fileBuffer;
      fileName = manualUpload.fileName;

    } else if (documentType === 'agreement' || !documentType) {
      // Load agreement PDF (default if no type specified)
      const agreement = await CustomerHeaderDoc.findById(documentId);
      if (!agreement) {
        // Try to find as version if not found as agreement
        if (!documentType) {
          const version = await VersionPdf.findById(documentId);
          if (version) {
            console.log(`📄 [EMAIL-CONTROLLER] Auto-detected as version PDF`);
            const compiledPdf = await compileCustomerHeader(version.payloadSnapshot, { watermark });
            if (!compiledPdf || !compiledPdf.buffer) {
              throw new Error('Failed to compile version PDF');
            }
            pdfBuffer = compiledPdf.buffer;
            fileName = watermark
              ? version.fileName.replace('.pdf', '_DRAFT.pdf')
              : version.fileName;
          } else {
            return res.status(404).json({
              success: false,
              error: 'Document not found',
              detail: `No document found with ID: ${documentId}`
            });
          }
        } else {
          return res.status(404).json({
            success: false,
            error: 'Agreement not found',
            detail: `No agreement found with ID: ${documentId}`
          });
        }
      } else {
        console.log(`📄 [EMAIL-CONTROLLER] Loading agreement PDF`);

        if (!agreement.pdf_meta || !agreement.pdf_meta.pdfBuffer) {
          return res.status(404).json({
            success: false,
            error: 'PDF not available',
            detail: 'The agreement has no generated PDF. Please generate it first.'
          });
        }

        pdfBuffer = agreement.pdf_meta.pdfBuffer;
        fileName = `${agreement.payload?.headerTitle || 'Agreement'}.pdf`;
      }
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid document type',
        detail: 'documentType must be one of: agreement, version, manual-upload'
      });
    }

    console.log('📎 [EMAIL-CONTROLLER] PDF loaded successfully:', {
      fileName,
      size: `${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB`
    });

    // Send email with PDF attachment
    const emailResult = await sendEmailService({
      to,
      from: process.env.EMAIL_FROM_ADDRESS || 'noreply@enviromasternva.com',
      subject,
      body: body || `Please find the attached document: ${fileName}`,
      attachment: {
        buffer: pdfBuffer,
        filename: fileName
      }
    });

    if (emailResult.success) {
      console.log('✅ [EMAIL-CONTROLLER] Email sent successfully');
      return res.json({
        success: true,
        message: 'Email sent successfully',
        messageId: emailResult.messageId,
        fileName
      });
    } else {
      console.error('❌ [EMAIL-CONTROLLER] Failed to send email:', emailResult.error);
      return res.status(500).json({
        success: false,
        error: 'Failed to send email',
        detail: emailResult.error
      });
    }

  } catch (error) {
    console.error('❌ [EMAIL-CONTROLLER] Error in sendEmailWithPdf:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      detail: error.message
    });
  }
}

/**
 * GET /api/email/verify-config
 * Verify email configuration
 */
export async function verifyEmailConfiguration(req, res) {
  try {
    const result = await verifyEmailConfig();

    if (result.success) {
      return res.json(result);
    } else {
      return res.status(500).json(result);
    }

  } catch (error) {
    console.error('❌ [EMAIL-CONTROLLER] Error verifying email config:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to verify email configuration',
      detail: error.message
    });
  }
}

/**
 * POST /api/email/send-test
 * Send a test email to verify configuration
 */
export async function sendTestEmail(req, res) {
  try {
    const { to } = req.body;

    if (!to) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: to'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email address'
      });
    }

    const result = await sendEmailService({
      to,
      subject: 'Test Email from EnviroMaster System',
      body: `
        <h2>Test Email</h2>
        <p>This is a test email from the EnviroMaster email system.</p>
        <p>If you received this email, your email configuration is working correctly!</p>
        <br>
        <p style="color: #666; font-size: 12px;">
          Sent at: ${new Date().toLocaleString()}<br>
          From: EnviroMaster Email System
        </p>
      `
    });

    if (result.success) {
      return res.json({
        success: true,
        message: 'Test email sent successfully',
        messageId: result.messageId
      });
    } else {
      return res.status(500).json(result);
    }

  } catch (error) {
    console.error('❌ [EMAIL-CONTROLLER] Error sending test email:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to send test email',
      detail: error.message
    });
  }
}
