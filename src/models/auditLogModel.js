const mongoose = require("mongoose");

const AuditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    action: { type: String, required: true },
    entity: { type: String, enum: ["proposal", "file_asset", "user"], required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
    payload: { type: Object, default: {} }
  },
  { timestamps: true }
);

module.exports = mongoose.model("AuditLog", AuditLogSchema);
