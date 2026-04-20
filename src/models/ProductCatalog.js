import mongoose from "mongoose";

const PriceSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    name: { type: String, required: true },
    familyKey: { type: String, required: true },
    kind: { type: String },

    basePrice: {
      amount: Number,
      currency: String,
      uom: String,
      unitSizeLabel: String,
    },

    warrantyPricePerUnit: {
      amount: Number,
      currency: String,
      uom: String,
      billingPeriod: String,
    },

    effectivePerRollPriceInternal: Number,
    suggestedCustomerRollPrice: Number,
    quantityPerCase: Number,
    quantityPerCaseLabel: String,

    frequency: { type: String, default: "" },

    description: { type: String },

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
