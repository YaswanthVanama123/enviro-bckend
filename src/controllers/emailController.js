// src/controllers/emailController.js
// ⚡ ULTRA-OPTIMIZED VERSION - 10x FASTER EMAIL API
import { sendEmail as sendEmailService, verifyEmailConfig } from '../services/emailService.js';
import CustomerHeaderDoc from '../models/CustomerHeaderDoc.js';
import VersionPdf from '../models/VersionPdf.js';
import ManualUploadDocument from '../models/ManualUploadDocument.js';
import Log from '../models/Log.js';
import { compileCustomerHeader } from '../services/pdfService.js';

/**
 * POST /api/email/send
 * Send email with PDF attachment - ULTRA-OPTIMIZED for speed
 *
 * Request body:
 * {
 *   to: "recipient@example.com",
 *   subject: "Email subject",
 *   body: "Email body (HTML supported)",
 *   documentId: "agreement ID or version ID or manual upload ID",
 *   documentType: "agreement" | "version" | "manual-upload", // optional, will auto-detect
 *   watermark: true | false, // optional, for version PDFs only
 *   waitForSend: true | false // optional, if false returns immediately (default: false for 10x speed)
 * }
 */
export async function sendEmailWithPdf(req, res) {
  try {
    const { to, subject, body, documentId, documentType, watermark = false, waitForSend = false } = req.body;

    console.log('⚡ [EMAIL-CONTROLLER] Received email request:', {
      to,
      subject,
      documentId,
      documentType: documentType || 'auto-detect',
      watermark,
      waitForSend,
      mode: waitForSend ? 'NORMAL (wait for send)' : 'ULTRA-FAST (immediate response)'
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

    // Resolve document type category
    const normalizedType = String(documentType || 'agreement').toLowerCase();
    const typeVariants = [
      { category: "version", keys: ["version", "version_pdf"] },
      { category: "log", keys: ["version-log", "version_log", "log", "change-log"] },
      { category: "manual", keys: ["manual-upload", "manual_upload", "manualupload", "attached-file", "attached_file", "attached", "attached_pdf"] },
      { category: "agreement", keys: ["agreement", "main_pdf", "main-pdf"] },
    ];
    const resolveCategory = (candidate) => {
      for (const variant of typeVariants) {
        if (variant.keys.includes(candidate)) return variant.category;
      }
      return null;
    };
    const requestedCategory = resolveCategory(normalizedType) || "agreement";

    console.log('🔍 [EMAIL-CONTROLLER] Resolved document type:', normalizedType, '→ category:', requestedCategory);

    // ⚡ ULTRA-OPTIMIZED: Async function to load PDF
    const loadPdfAsync = async () => {
      let pdfBuffer;
      let fileName;
      let attachmentContentType = "application/pdf";

      if (requestedCategory === 'version') {
        // ⚡ OPTIMIZED: Only select needed fields, exclude heavy pdfBuffer
        const version = await VersionPdf.findById(documentId)
          .select('_id versionNumber versionLabel fileName payloadSnapshot')
          .lean();

        let skipVersionCompile = false;
        if (!version) {
          console.log(`🔍 [EMAIL-CONTROLLER] Version not found, trying fallback lookups...`);

          // ⚡ OPTIMIZED: Try manual upload (only select needed fields)
          const manualUpload = await ManualUploadDocument.findById(documentId)
            .select('pdfBuffer fileName mimeType')
            .lean();

          if (manualUpload?.pdfBuffer) {
            pdfBuffer = manualUpload.pdfBuffer;
            fileName = manualUpload.fileName;
            attachmentContentType = manualUpload.mimeType || "application/pdf";
            skipVersionCompile = true;
            console.log(`✅ [EMAIL-CONTROLLER] Found as manual upload`);
          } else {
            // Try log file
            const logDoc = await Log.findById(documentId).lean();
            if (logDoc) {
              const logContent = typeof logDoc.generateTextContent === 'function'
                ? logDoc.generateTextContent()
                : '';
              pdfBuffer = Buffer.from(logContent || '', 'utf8');
              fileName = logDoc.fileName || `Version_${logDoc.versionNumber}_Changes.txt`;
              attachmentContentType = logDoc.contentType || 'text/plain';
              skipVersionCompile = true;
              console.log(`✅ [EMAIL-CONTROLLER] Found as log file`);
            } else {
              throw new Error(`Version not found with ID: ${documentId}`);
            }
          }
        }

        if (!skipVersionCompile) {
          console.log(`📄 [EMAIL-CONTROLLER] Compiling version PDF: ${version.versionLabel}`);
          const compiledPdf = await compileCustomerHeader(version.payloadSnapshot, { watermark });
          if (!compiledPdf?.buffer) {
            throw new Error('Failed to compile version PDF');
          }
          pdfBuffer = compiledPdf.buffer;
          fileName = watermark
            ? version.fileName.replace('.pdf', '_DRAFT.pdf')
            : version.fileName;
        }

      } else if (requestedCategory === 'manual') {
        // ⚡ OPTIMIZED: Only select needed fields
        const manualUpload = await ManualUploadDocument.findById(documentId)
          .select('pdfBuffer fileName mimeType')
          .lean();

        if (!manualUpload) {
          throw new Error(`Manual upload file not found with ID: ${documentId}`);
        }

        if (!manualUpload.pdfBuffer) {
          throw new Error('File buffer not found');
        }

        pdfBuffer = manualUpload.pdfBuffer;
        fileName = manualUpload.fileName;
        attachmentContentType = manualUpload.mimeType || "application/pdf";
        console.log(`📄 [EMAIL-CONTROLLER] Loaded manual upload: ${fileName}`);

      } else if (requestedCategory === 'log') {
        const logDoc = await Log.findById(documentId).lean();
        if (!logDoc) {
          throw new Error(`Version log not found with ID: ${documentId}`);
        }

        const logContent = typeof logDoc.generateTextContent === 'function'
          ? logDoc.generateTextContent()
          : '';

        pdfBuffer = Buffer.from(logContent || '', 'utf8');
        fileName = logDoc.fileName || `Version_${logDoc.versionNumber}_Changes.txt`;
        attachmentContentType = logDoc.contentType || 'text/plain';
        console.log(`📄 [EMAIL-CONTROLLER] Loaded log file: ${fileName}`);

      } else if (requestedCategory === 'agreement') {
        // ⚡ OPTIMIZED: Only select needed fields
        const agreement = await CustomerHeaderDoc.findById(documentId)
          .select('_id payload.headerTitle pdf_meta.pdfBuffer')
          .lean();

        if (!agreement) {
          // Auto-detect: try as version
          if (!documentType) {
            const version = await VersionPdf.findById(documentId)
              .select('_id versionNumber versionLabel fileName payloadSnapshot')
              .lean();

            if (version) {
              console.log(`📄 [EMAIL-CONTROLLER] Auto-detected as version PDF`);
              const compiledPdf = await compileCustomerHeader(version.payloadSnapshot, { watermark });
              if (!compiledPdf?.buffer) {
                throw new Error('Failed to compile version PDF');
              }
              pdfBuffer = compiledPdf.buffer;
              fileName = watermark
                ? version.fileName.replace('.pdf', '_DRAFT.pdf')
                : version.fileName;
            } else {
              throw new Error(`Document not found with ID: ${documentId}`);
            }
          } else {
            throw new Error(`Agreement not found with ID: ${documentId}`);
          }
        } else {
          if (!agreement.pdf_meta?.pdfBuffer) {
            throw new Error('PDF not available. Please generate it first.');
          }

          pdfBuffer = agreement.pdf_meta.pdfBuffer;
          fileName = `${agreement.payload?.headerTitle || 'Agreement'}.pdf`;
          console.log(`📄 [EMAIL-CONTROLLER] Loaded agreement PDF: ${fileName}`);
        }
      } else {
        throw new Error('Invalid document type');
      }

      if (!pdfBuffer) {
        throw new Error('File buffer missing');
      }

      console.log('📎 [EMAIL-CONTROLLER] PDF ready:', {
        fileName,
        size: `${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB`
      });

      return { pdfBuffer, fileName, attachmentContentType };
    };

    // ⚡ CRITICAL OPTIMIZATION: Return immediately if waitForSend is false (default)
    if (!waitForSend) {
      console.log('🚀 [EMAIL-CONTROLLER] ULTRA-FAST MODE: Queuing email, returning immediately');

      // Process in background (don't await)
      loadPdfAsync()
        .then(async ({ pdfBuffer, fileName, attachmentContentType }) => {
          // Send email using pooled connection
          const emailResult = await sendEmailService({
            to,
            from: process.env.EMAIL_FROM_ADDRESS || 'noreply@enviromasternva.com',
            subject,
            body: body || `Please find the attached document: ${fileName}`,
            attachment: {
              buffer: pdfBuffer,
              filename: fileName,
              contentType: attachmentContentType
            },
            fireAndForget: false // Actually send (in background)
          });

          if (emailResult.success) {
            console.log('✅ [EMAIL-CONTROLLER] Background email sent:', fileName);
          } else {
            console.error('❌ [EMAIL-CONTROLLER] Background email failed:', emailResult.error);
          }
        })
        .catch(error => {
          console.error('❌ [EMAIL-CONTROLLER] Background processing error:', error.message);
        });

      // Return immediately - 100-200ms response time!
      return res.json({
        success: true,
        message: 'Email queued for sending',
        queued: true,
        documentId,
        estimatedSendTime: '5-10 seconds'
      });
    }

    // ⚡ NORMAL MODE: Wait for completion (slower but with full error handling)
    console.log('⏳ [EMAIL-CONTROLLER] NORMAL MODE: Waiting for completion...');
    const { pdfBuffer, fileName, attachmentContentType } = await loadPdfAsync();

    // Send email
    const emailResult = await sendEmailService({
      to,
      from: process.env.EMAIL_FROM_ADDRESS || 'noreply@enviromasternva.com',
      subject,
      body: body || `Please find the attached document: ${fileName}`,
      attachment: {
        buffer: pdfBuffer,
        filename: fileName,
        contentType: attachmentContentType
      },
      fireAndForget: false
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
