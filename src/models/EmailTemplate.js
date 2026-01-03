// src/models/EmailTemplate.js
import mongoose from 'mongoose';

const emailTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    default: 'default'
  },
  subject: {
    type: String,
    required: true,
    default: 'Document from EnviroMaster NVA'
  },
  body: {
    type: String,
    required: true,
    default: `Hello,

Please find the attached document.

Best regards,
EnviroMaster NVA Team`
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// ✅ OPTIMIZED: Add index on isActive for faster queries
emailTemplateSchema.index({ isActive: 1 });

// ✅ OPTIMIZED: Ensure only one active template at a time
// NOTE: This pre-save hook runs on every save. For better performance,
// handle this logic in the controller using findOneAndUpdate with session/transaction
emailTemplateSchema.pre('save', async function(next) {
  if (this.isActive && this.isModified('isActive')) {
    // Only run updateMany if isActive was actually changed
    await mongoose.model('EmailTemplate').updateMany(
      { _id: { $ne: this._id }, isActive: true },
      { isActive: false }
    );
  }
  next();
});

const EmailTemplate = mongoose.model('EmailTemplate', emailTemplateSchema);

export default EmailTemplate;
