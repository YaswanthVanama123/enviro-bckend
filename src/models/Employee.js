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
    phone: {
      type: String,
      trim: true,
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
    // Sales/Quota related fields
    salesRole: {
      type: String,
      enum: ["field_sales", "inside_sales", "account_manager", "sales_manager", "none"],
      default: "field_sales",
    },
    territory: {
      type: String,
      trim: true,
    },
    managerId: {
      type: String,
      default: null,
    },
    hireDate: {
      type: Date,
      default: Date.now,
    },
    // Quota configuration
    quota: {
      monthlyTarget: {
        type: Number,
        default: 50000,
      },
      effectiveDate: {
        type: Date,
        default: Date.now,
      },
      periodType: {
        type: String,
        enum: ["monthly", "quarterly", "annual"],
        default: "monthly",
      },
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
