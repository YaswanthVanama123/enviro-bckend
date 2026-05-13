import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const EmployeeSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
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
    timestamps: true,
  }
);

// Static method to create an employee with hashed password
EmployeeSchema.statics.createEmployee = async function (data) {
  const { username, password, fullName, email } = data;
  const passwordHash = await bcrypt.hash(password, 10);

  return this.create({
    username,
    passwordHash,
    fullName,
    email,
    isActive: true,
  });
};

// Instance method to compare password
EmployeeSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

const Employee = mongoose.model("Employee", EmployeeSchema);

export default Employee;
