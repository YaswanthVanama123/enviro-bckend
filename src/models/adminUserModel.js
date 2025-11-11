import mongoose from 'mongoose';

const AdminUserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, default: '' },
    role: { type: String, enum: ['admin'], default: 'admin' },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export default mongoose.model('AdminUser', AdminUserSchema);
