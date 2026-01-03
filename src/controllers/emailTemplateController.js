// src/controllers/emailTemplateController.js
import EmailTemplate from '../models/EmailTemplate.js';

/**
 * GET /api/email-template/active
 * Get the active email template
 * ✅ OPTIMIZED: Added lean(), cache-busting headers
 */
export async function getActiveTemplate(req, res) {
  try {
    // ✅ OPTIMIZED: Use lean() for faster query
    let template = await EmailTemplate.findOne({ isActive: true })
      .select('_id name subject body isActive updatedAt')
      .lean()
      .exec();

    // If no template exists, create default one
    if (!template) {
      const newTemplate = await EmailTemplate.create({
        name: 'default',
        subject: 'Document from EnviroMaster NVA',
        body: `Hello,

Please find the attached document.

Best regards,
EnviroMaster NVA Team`,
        isActive: true
      });
      console.log('📧 [EMAIL-TEMPLATE] Created default email template');

      // Convert to plain object for consistency
      template = {
        _id: newTemplate._id,
        name: newTemplate.name,
        subject: newTemplate.subject,
        body: newTemplate.body,
        isActive: newTemplate.isActive,
        updatedAt: newTemplate.updatedAt
      };
    }

    // ✅ OPTIMIZED: Set cache-busting headers
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

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
 * ✅ OPTIMIZED: Use findOneAndUpdate, cache-busting headers, no pre-save hook trigger
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

    // ✅ OPTIMIZED: Use findOneAndUpdate with upsert for single atomic operation
    // This avoids the expensive pre-save hook and reduces from 2-3 queries to 1
    const template = await EmailTemplate.findOneAndUpdate(
      { isActive: true },
      {
        $set: {
          subject,
          body,
          updatedAt: new Date(),
          isActive: true
        },
        $setOnInsert: {
          name: 'default',
          createdAt: new Date()
        }
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        select: '_id name subject body isActive updatedAt'
      }
    ).lean();

    console.log('✅ [EMAIL-TEMPLATE] Template updated successfully');

    // ✅ OPTIMIZED: Set cache-busting headers to prevent stale data
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

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
 * ✅ OPTIMIZED: Added lean()
 */
export async function testTemplate(req, res) {
  try {
    // ✅ OPTIMIZED: Use lean() for faster query
    const template = await EmailTemplate.findOne({ isActive: true })
      .select('subject body updatedAt')
      .lean()
      .exec();

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
