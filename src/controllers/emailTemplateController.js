// src/controllers/emailTemplateController.js
import EmailTemplate from '../models/EmailTemplate.js';

/**
 * GET /api/email-template/active
 * Get the active email template
 */
export async function getActiveTemplate(req, res) {
  try {
    let template = await EmailTemplate.findOne({ isActive: true });

    // If no template exists, create default one
    if (!template) {
      template = await EmailTemplate.create({
        name: 'default',
        subject: 'Document from EnviroMaster NVA',
        body: `Hello,

Please find the attached document.

Best regards,
EnviroMaster NVA Team`,
        isActive: true
      });
      console.log('📧 [EMAIL-TEMPLATE] Created default email template');
    }

    return res.json({
      success: true,
      template: {
        id: template._id,
        name: template.name,
        subject: template.subject,
        body: template.body,
        isActive: template.isActive,
        updatedAt: template.updatedAt
      }
    });
  } catch (error) {
    console.error('❌ [EMAIL-TEMPLATE] Error fetching active template:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch email template',
      detail: error.message
    });
  }
}

/**
 * PUT /api/email-template
 * Update the email template
 */
export async function updateTemplate(req, res) {
  try {
    const { subject, body } = req.body;

    if (!subject || !body) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        detail: 'subject and body are required'
      });
    }

    console.log('📧 [EMAIL-TEMPLATE] Updating email template');

    // Find active template or create new one
    let template = await EmailTemplate.findOne({ isActive: true });

    if (template) {
      template.subject = subject;
      template.body = body;
      template.updatedAt = new Date();
      await template.save();
    } else {
      template = await EmailTemplate.create({
        name: 'default',
        subject,
        body,
        isActive: true
      });
    }

    console.log('✅ [EMAIL-TEMPLATE] Template updated successfully');

    return res.json({
      success: true,
      message: 'Email template updated successfully',
      template: {
        id: template._id,
        name: template.name,
        subject: template.subject,
        body: template.body,
        isActive: template.isActive,
        updatedAt: template.updatedAt
      }
    });
  } catch (error) {
    console.error('❌ [EMAIL-TEMPLATE] Error updating template:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update email template',
      detail: error.message
    });
  }
}

/**
 * GET /api/email-template/test
 * Test endpoint to verify template system
 */
export async function testTemplate(req, res) {
  try {
    const template = await EmailTemplate.findOne({ isActive: true });

    return res.json({
      success: true,
      hasTemplate: !!template,
      template: template ? {
        subject: template.subject,
        body: template.body,
        updatedAt: template.updatedAt
      } : null
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
