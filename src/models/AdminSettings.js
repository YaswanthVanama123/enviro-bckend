import mongoose from 'mongoose';

const adminSettingsSchema = new mongoose.Schema(
  {
    // Singleton key — there is only one document
    key: { type: String, default: 'global', unique: true },

    // Default owner for auto-created approval tasks
    defaultApprovalTaskOwner: {
      id:   { type: String, default: null },
      name: { type: String, default: null },
    },

    // Task subject template ({{agreementTitle}} replaced at runtime)
    approvalTaskSubject: {
      type: String,
      default: 'Agreement "{{agreementTitle}}" needs your approval',
    },
  },
  { timestamps: true }
);

// Static helper — get-or-create the singleton
adminSettingsSchema.statics.getSingleton = async function () {
  let doc = await this.findOne({ key: 'global' });
  if (!doc) {
    doc = await this.create({ key: 'global' });
  }
  return doc;
};

export default mongoose.model('AdminSettings', adminSettingsSchema);
