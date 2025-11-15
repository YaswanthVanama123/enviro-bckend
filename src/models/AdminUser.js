// src/models/AdminUser.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const AdminUserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    // hashed password (never store plain!)
    passwordHash: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
    },
    passwordChangedAt: {
      type: Date,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

// Create default admin once (envimaster / 9999999999)
AdminUserSchema.statics.ensureDefaultAdmin = async function () {
  const DEFAULT_USERNAME = "envimaster";
  const DEFAULT_PASSWORD = "9999999999"; // 10 nines

  const existing = await this.findOne({ username: DEFAULT_USERNAME }).exec();
  if (existing) {
    console.log("[AdminUser] Default admin already exists");
    return;
  }

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  await this.create({
    username: DEFAULT_USERNAME,
    passwordHash,
    isActive: true,
  });

  console.log(
    "[AdminUser] Default admin created:",
    `username='${DEFAULT_USERNAME}' password='${DEFAULT_PASSWORD}'`
  );
};

const AdminUser = mongoose.model("AdminUser", AdminUserSchema);

export default AdminUser;
