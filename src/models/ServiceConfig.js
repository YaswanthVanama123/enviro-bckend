// src/models/ServiceConfig.js
import mongoose from "mongoose";

const ServiceConfigSchema = new mongoose.Schema(
  {
    // e.g. "saniclean", "sanipod", "saniscrub", "rpmWindows", "microfiberMopping", etc.
    serviceId: { type: String, required: true },

    // e.g. "EnvServices-2025-11-23" or "v1"
    version: { type: String, required: true },

    // Human label: "SaniClean", "SaniPod", "SaniScrub", "RPM Windows", etc.
    label: { type: String },

    // Optional description / notes
    description: { type: String },

    // The actual pricing config JSON (your TS config objects go here)
    config: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    // Optional default form state (react-form defaults)
    defaultFormState: {
      type: mongoose.Schema.Types.Mixed,
    },

    // Mark which config is currently in use for this service
    isActive: { type: Boolean, default: false },

    // Whether to display in admin form by default
    adminByDisplay: { type: Boolean, default: true },

    // Optional tags (e.g. ["restroom", "drain", "add-on"])
    tags: [{ type: String }],
  },
  {
    timestamps: true,
  }
);

// Speed up "active service config" lookup
ServiceConfigSchema.index({ serviceId: 1, isActive: 1 });

export default mongoose.model("ServiceConfig", ServiceConfigSchema);
