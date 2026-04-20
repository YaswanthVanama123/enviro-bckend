import mongoose from "mongoose";

const ServiceConfigSchema = new mongoose.Schema(
  {
    serviceId: { type: String, required: true },

    version: { type: String, required: true },

    label: { type: String },

    description: { type: String },

    config: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    defaultFormState: {
      type: mongoose.Schema.Types.Mixed,
    },

    isActive: { type: Boolean, default: false },

    adminByDisplay: { type: Boolean, default: true },

    tags: [{ type: String }],

    images: [
      {
        url:     { type: String, required: true },
        caption: { type: String, default: "" },
      },
    ],

    links: [
      {
        label: { type: String, required: true },
        url:   { type: String, required: true },
      },
    ],
  },
  {
    timestamps: true,
  }
);

ServiceConfigSchema.index({ serviceId: 1, isActive: 1 });

export default mongoose.model("ServiceConfig", ServiceConfigSchema);
