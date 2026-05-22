/**
 * RouteStarCustomer Model
 * Stores customer data synced from RouteStar
 */

import mongoose from "mongoose";

const RouteStarCustomerSchema = new mongoose.Schema(
  {
    routeStarId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    state: {
      type: String,
      trim: true,
    },
    zipCode: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    company: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isPaperless: {
      type: Boolean,
      default: false,
    },
    grouping: {
      type: String,
      trim: true,
    },
    onRoute: {
      type: String,
      trim: true,
    },
    createdInRouteStar: {
      type: Date,
    },
    account: {
      type: String,
      trim: true,
    },
    salesRep: {
      type: String,
      trim: true,
    },
    customerType: {
      type: String,
      trim: true,
    },
    balance: {
      type: Number,
      default: 0,
    },
    taxCode: {
      type: String,
      trim: true,
    },
    taxRate: {
      type: Number,
      default: 0,
    },
    terms: {
      type: String,
      trim: true,
    },
    priceLevel: {
      type: String,
      trim: true,
    },
    creditLimit: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      trim: true,
    },
    priceGrouping: {
      type: String,
      trim: true,
    },
    notifyBy: {
      type: String,
      trim: true,
    },
    proofOfService: {
      type: String,
      trim: true,
    },
    preferredPaymentMethod: {
      type: String,
      trim: true,
    },
    zone: {
      type: String,
      trim: true,
    },
    detailUrl: {
      type: String,
      trim: true,
    },
    lastSyncedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Index for search
RouteStarCustomerSchema.index({ name: "text", company: "text", email: "text" });

const RouteStarCustomer = mongoose.model("RouteStarCustomer", RouteStarCustomerSchema);

export default RouteStarCustomer;
