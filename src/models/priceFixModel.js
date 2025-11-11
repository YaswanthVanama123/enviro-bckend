import mongoose from "mongoose";

const { Schema } = mongoose;

export const PRICE_CATEGORIES = ["small_product", "dispenser", "big_product"];

const PriceFixSchema = new Schema(
  {
    // Category of the item
    category: {
      type: String,
      enum: PRICE_CATEGORIES,
      required: true,
      index: true,
    },

    // Canonical service/product name
    serviceName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    // Current price the system believes (useful to show “before” to admins)
    currentPrice: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Requested/new price to be applied
    newPrice: {
      type: Number,
      default: 0,
      min: 0,
    },

    // “Weekly”, “Monthly”, etc. — optional
    frequency: {
      type: String,
      default: "",
      trim: true,
    },

    // When the new price should take effect
    effectiveFrom: {
      type: Date,
    },

    // Audit
    updatedBy: { type: String, default: "" }, // email or userId
  },
  { timestamps: true }
);

// Unique constraint per category + service
PriceFixSchema.index({ category: 1, serviceName: 1 }, { unique: true });

const PriceFix = mongoose.model("PriceFix", PriceFixSchema);
export default PriceFix;
