import express from 'express';
import AdminSettings from '../models/AdminSettings.js';

const router = express.Router();

// GET /api/admin-settings
router.get('/', async (req, res) => {
  try {
    const settings = await AdminSettings.getSingleton();
    return res.json({ success: true, settings });
  } catch (err) {
    console.error('❌ [ADMIN-SETTINGS] GET failed:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/admin-settings
router.patch('/', async (req, res) => {
  try {
    const { defaultApprovalTaskOwner, approvalTaskSubject } = req.body;
    const settings = await AdminSettings.getSingleton();

    if (defaultApprovalTaskOwner !== undefined) {
      settings.defaultApprovalTaskOwner = defaultApprovalTaskOwner;
    }
    if (approvalTaskSubject !== undefined) {
      settings.approvalTaskSubject = approvalTaskSubject;
    }

    await settings.save();
    console.log('✅ [ADMIN-SETTINGS] Updated:', settings.toObject());
    return res.json({ success: true, settings });
  } catch (err) {
    console.error('❌ [ADMIN-SETTINGS] PATCH failed:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
