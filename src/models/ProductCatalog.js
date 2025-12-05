// src/models/ProductCatalog.js
import mongoose from "mongoose";

const PriceSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },          // e.g. "floor_daily"
    name: { type: String, required: true },         // e.g. "Daily"
    familyKey: { type: String, required: true },    // e.g. "floorProducts"
    kind: { type: String },                         // e.g. "floorCleaner"

    basePrice: {
      amount: Number,
      currency: String,
      uom: String,
      unitSizeLabel: String, // "Case/16/250"
    },

    warrantyPricePerUnit: {
      amount: Number,
      currency: String,
      uom: String,
      billingPeriod: String, // "week"
    },

    effectivePerRollPriceInternal: Number,
    suggestedCustomerRollPrice: Number,
    quantityPerCase: Number,
    quantityPerCaseLabel: String,

    // Frequency field (added to match CustomerHeaderDoc requirements)
    frequency: { type: String, default: "" },

    displayByAdmin: { type: Boolean, default: false },
  },
  { _id: false }
);

const FamilySchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    sortOrder: { type: Number, default: 0 },
    products: [PriceSchema],
  },
  { _id: false }
);

const ProductCatalogSchema = new mongoose.Schema(
  {
    version: { type: String, required: true },
    lastUpdated: { type: String },
    currency: { type: String, default: "USD" },

    families: [FamilySchema],

    isActive: { type: Boolean, default: true },
    note: { type: String },
  },
  { timestamps: true }
);

ProductCatalogSchema.index({ isActive: 1 });

const ProductCatalog = mongoose.model("ProductCatalog", ProductCatalogSchema);

export default ProductCatalog;
