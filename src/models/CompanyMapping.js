/**
 * Company Mapping Model
 * Maps Bigin Companies to RouteStar Customers
 */

import mongoose from "mongoose";

const companyMappingSchema = new mongoose.Schema(
  {
    // Bigin Company reference
    biginCompanyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BiginCompany",
      required: true,
    },
    biginId: {
      type: String,
      required: true,
    },
    biginCompanyName: {
      type: String,
      required: true,
    },
    biginPhone: {
      type: String,
    },
    biginCity: {
      type: String,
    },
    biginState: {
      type: String,
    },

    // RouteStar Customer reference (nullable when unmapped)
    routeStarCustomerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RouteStarCustomer",
    },
    routeStarId: {
      type: String,
    },
    routeStarCustomerName: {
      type: String,
    },
    routeStarCompany: {
      type: String,
    },
    routeStarCity: {
      type: String,
    },

    // Mapping status
    mappingStatus: {
      type: String,
      enum: ["mapped", "unmapped"],
      default: "unmapped",
    },

    // Audit fields
    mappedBy: {
      type: String,
    },
    mappedAt: {
      type: Date,
    },

    // History of previous mappings
    previousMappings: [
      {
        routeStarId: String,
        routeStarCustomerName: String,
        routeStarCompany: String,
        unmappedAt: Date,
        unmappedBy: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes
companyMappingSchema.index({ biginId: 1 }, { unique: true });
companyMappingSchema.index({ biginCompanyId: 1 }, { unique: true });
companyMappingSchema.index({ routeStarId: 1 });
companyMappingSchema.index({ routeStarCustomerId: 1 });
companyMappingSchema.index({ mappingStatus: 1 });
companyMappingSchema.index(
  { biginCompanyName: "text", routeStarCustomerName: "text" },
  { name: "company_mapping_text_index" }
);

// Static method to get mapping stats
companyMappingSchema.statics.getStats = async function () {
  const total = await this.countDocuments();
  const mapped = await this.countDocuments({ mappingStatus: "mapped" });
  const unmapped = await this.countDocuments({ mappingStatus: "unmapped" });
  return { total, mapped, unmapped };
};

// Static method to find by biginId
companyMappingSchema.statics.findByBiginId = function (biginId) {
  return this.findOne({ biginId });
};

// Static method to find by routeStarId
companyMappingSchema.statics.findByRouteStarId = function (routeStarId) {
  return this.findOne({ routeStarId });
};

// Instance method to set mapping
companyMappingSchema.methods.setMapping = function (
  routeStarCustomer,
  mappedBy = "system"
) {
  // If already mapped, save to history
  if (this.mappingStatus === "mapped" && this.routeStarId) {
    this.previousMappings.push({
      routeStarId: this.routeStarId,
      routeStarCustomerName: this.routeStarCustomerName,
      routeStarCompany: this.routeStarCompany,
      unmappedAt: new Date(),
      unmappedBy: mappedBy,
    });
  }

  // Set new mapping
  this.routeStarCustomerId = routeStarCustomer._id;
  this.routeStarId = routeStarCustomer.routeStarId;
  this.routeStarCustomerName = routeStarCustomer.name;
  this.routeStarCompany = routeStarCustomer.company;
  this.routeStarCity = routeStarCustomer.city;
  this.mappingStatus = "mapped";
  this.mappedBy = mappedBy;
  this.mappedAt = new Date();

  return this.save();
};

// Instance method to clear mapping
companyMappingSchema.methods.clearMapping = function (unmappedBy = "system") {
  if (this.mappingStatus === "mapped" && this.routeStarId) {
    this.previousMappings.push({
      routeStarId: this.routeStarId,
      routeStarCustomerName: this.routeStarCustomerName,
      routeStarCompany: this.routeStarCompany,
      unmappedAt: new Date(),
      unmappedBy: unmappedBy,
    });
  }

  this.routeStarCustomerId = null;
  this.routeStarId = null;
  this.routeStarCustomerName = null;
  this.routeStarCompany = null;
  this.routeStarCity = null;
  this.mappingStatus = "unmapped";
  this.mappedBy = null;
  this.mappedAt = null;

  return this.save();
};

const CompanyMapping = mongoose.model("CompanyMapping", companyMappingSchema);

export default CompanyMapping;
