// src/services/emailService.js
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Email Service using Nodemailer
 *
 * Configuration is loaded from .env file:
 * - EMAIL_SERVICE: Email service provider (e.g., 'gmail', 'outlook')
 * - EMAIL_HOST: SMTP host
 * - EMAIL_PORT: SMTP port
 * - EMAIL_SECURE: Whether to use TLS
 * - EMAIL_USER: Email account username
 * - EMAIL_PASSWORD: Email account password or app-specific password
 * - EMAIL_FROM_NAME: Display name for sender
 * - EMAIL_FROM_ADDRESS: Email address for sender
 */

// Create reusable transporter object
const createTransporter = () => {
  const config = {
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587', 10),
    secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
    tls: {}
  };

  if (process.env.EMAIL_TLS_REJECT_UNAUTHORIZED === 'false') {
    config.tls.rejectUnauthorized = false;
  }

  // If using a specific service like Gmail, add service property
  if (process.env.EMAIL_SERVICE) {
    config.service = process.env.EMAIL_SERVICE;
  }

  console.log('📧 [EMAIL-SERVICE] Creating transporter with config:', {
    host: config.host,
    port: config.port,
    secure: config.secure,
    service: config.service || 'custom',
    user: config.auth.user ? config.auth.user.substring(0, 3) + '***' : 'not set'
  });

  return nodemailer.createTransport(config);
};

/**
 * Send email with optional PDF attachment
 * @param {Object} emailOptions - Email options
 * @param {string} emailOptions.to - Recipient email address
 * @param {string} emailOptions.from - Sender email address (optional, uses default if not provided)
 * @param {string} emailOptions.subject - Email subject
 * @param {string} emailOptions.body - Email body (HTML supported)
 * @param {Object} emailOptions.attachment - Optional PDF attachment
 * @param {Buffer} emailOptions.attachment.buffer - PDF buffer
 * @param {string} emailOptions.attachment.filename - PDF filename
 * @returns {Promise<Object>} Result with success status and message ID
 */
export async function sendEmail({ to, from, subject, body, attachment }) {
  try {
    console.log('📧 [EMAIL-SERVICE] Preparing to send email:', {
      to,
      from: from || process.env.EMAIL_FROM_ADDRESS,
      subject,
      hasAttachment: !!attachment
    });

    // Validate required fields
    if (!to || !subject) {
      throw new Error('Missing required fields: to and subject are required');
    }

    // Check if email configuration is set
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      throw new Error('Email configuration not set. Please configure EMAIL_USER and EMAIL_PASSWORD in .env file');
    }

    const transporter = createTransporter();

    // Prepare email options
    const mailOptions = {
      from: `${process.env.EMAIL_FROM_NAME || 'EnviroMaster'} <${from || process.env.EMAIL_FROM_ADDRESS}>`,
      to,
      subject,
      html: body || '',
      text: body ? body.replace(/<[^>]*>/g, '') : '', // Strip HTML for text version
    };

    // Add attachment if provided
    if (attachment && attachment.buffer) {
      mailOptions.attachments = [
        {
          filename: attachment.filename || 'document.pdf',
          content: attachment.buffer,
          contentType: 'application/pdf',
        },
      ];
      console.log('📎 [EMAIL-SERVICE] Attachment added:', {
        filename: attachment.filename,
        size: `${(attachment.buffer.length / 1024 / 1024).toFixed(2)} MB`
      });
    }

    // Send email
    console.log('📤 [EMAIL-SERVICE] Sending email...');
    const info = await transporter.sendMail(mailOptions);

    console.log('✅ [EMAIL-SERVICE] Email sent successfully:', {
      messageId: info.messageId,
      response: info.response,
      accepted: info.accepted,
      rejected: info.rejected
    });

    return {
      success: true,
      messageId: info.messageId,
      response: info.response,
      message: 'Email sent successfully'
    };

  } catch (error) {
    console.error('❌ [EMAIL-SERVICE] Error sending email:', {
      error: error.message,
      code: error.code,
      command: error.command
    });

    // Provide helpful error messages
    let errorMessage = error.message;
    if (error.code === 'EAUTH') {
      errorMessage = 'Email authentication failed. Please check your email credentials in .env file';
    } else if (error.code === 'ECONNECTION') {
      errorMessage = 'Failed to connect to email server. Please check your network connection and SMTP settings';
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = 'Email server connection timed out. Please try again';
    }

    return {
      success: false,
      error: errorMessage,
      code: error.code
    };
  }
}

/**
 * Verify email configuration
 * @returns {Promise<Object>} Verification result
 */
export async function verifyEmailConfig() {
  try {
    console.log('🔍 [EMAIL-SERVICE] Verifying email configuration...');

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      return {
        success: false,
        error: 'Email credentials not configured. Please set EMAIL_USER and EMAIL_PASSWORD in .env file'
      };
    }

    const transporter = createTransporter();
    await transporter.verify();

    console.log('✅ [EMAIL-SERVICE] Email configuration verified successfully');
    return {
      success: true,
      message: 'Email configuration is valid and ready to send emails',
      config: {
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
        service: process.env.EMAIL_SERVICE,
        from: process.env.EMAIL_FROM_ADDRESS
      }
    };

  } catch (error) {
    console.error('❌ [EMAIL-SERVICE] Email configuration verification failed:', error.message);
    return {
      success: false,
      error: error.message,
      help: 'Please check your email configuration in .env file. For Gmail, you may need to use an app-specific password.'
    };
  }
}
