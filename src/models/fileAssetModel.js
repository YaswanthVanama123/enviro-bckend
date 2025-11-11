// src/models/fileAssetModel.js
import mongoose from "mongoose";

const FileAssetSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["pdf", "image", "other"], required: true },
    storage: { type: String, enum: ["local", "s3", "gcs", "azure"], default: "local" },
    url: { type: String, required: true },
    key: { type: String, default: "" },
    fileName: { type: String, required: true },
    mimeType: { type: String, default: "" },
    sizeBytes: { type: Number, default: 0 },
    checksum: { type: String, default: "" },
    meta: {
      pageCount: { type: Number, default: null },
      generator: { type: String, default: "" },
      version: { type: String, default: "" }
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

const FileAsset = mongoose.model("FileAsset", FileAssetSchema);
export default FileAsset;
