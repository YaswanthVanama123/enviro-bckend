import mongoose from "mongoose";

const HeaderRowSchema = new mongoose.Schema(
  {
    labelLeft: { type: String, default: "" },
    valueLeft: { type: String, default: "" },
    labelRight: { type: String, default: "" },
    valueRight: { type: String, default: "" },
  },
  { _id: false }
);

const ProductsSchema = new mongoose.Schema(
  {
    headers: { type: [String], default: [] },
    // rows can be either array-of-arrays (strings) or array of objects.
    // We’ll accept anything JSON-ish: use Mixed.
    rows: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { _id: false }
);

const ServiceRowSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["line", "bold", "atCharge"], default: "line" },
    label: { type: String, default: "" },
    value: { type: String, default: "" },
    v1: { type: String, default: "" },
    v2: { type: String, default: "" },
    v3: { type: String, default: "" },
  },
  { _id: false }
);

const ServiceColumnSchema = new mongoose.Schema(
  {
    heading: { type: String, default: "" },
    rows: { type: [ServiceRowSchema], default: [] },
    sections: { type: [mongoose.Schema.Types.Mixed], default: [] }, // keep flexible
  },
  { _id: false }
);

const RefreshPowerScrubSchema = new mongoose.Schema(
  {
    heading: { type: String, default: "" },
    columns: { type: [String], default: [] },
    freqLabels: { type: [String], default: [] },
  },
  { _id: false }
);

const ServiceNotesSchema = new mongoose.Schema(
  {
    heading: { type: String, default: "" },
    lines: { type: Number, default: 3 },
    textLines: { type: [String], default: [] },
  },
  { _id: false }
);

const ServicesSchema = new mongoose.Schema(
  {
    topRow: { type: [ServiceColumnSchema], default: [] },
    bottomRow: { type: [ServiceColumnSchema], default: [] },
    refreshPowerScrub: { type: RefreshPowerScrubSchema, default: undefined },
    notes: { type: ServiceNotesSchema, default: undefined },
  },
  { _id: false }
);

const AgreementSchema = new mongoose.Schema(
  {
    enviroOf: { type: String, default: "" },
    customerExecutedOn: { type: String, default: "" },
    additionalMonths: { type: String, default: "" },
  },
  { _id: false }
);

const CustomerHeaderPayloadSchema = new mongoose.Schema(
  {
    headerTitle: { type: String, default: "" },
    headerRows: { type: [HeaderRowSchema], default: [] },
    products: { type: ProductsSchema, default: undefined },
    services: { type: ServicesSchema, default: undefined },
    agreement: { type: AgreementSchema, default: undefined },
  },
  { _id: false, minimize: false }
);

const PdfMetaSchema = new mongoose.Schema(
  {
    filename: { type: String, default: "customer-header.pdf" },
    sizeBytes: { type: Number, default: 0 },
    mimeType: { type: String, default: "application/pdf" },
  },
  { _id: false }
);

const RemoteCompilerSchema = new mongoose.Schema(
  {
    base: { type: String, default: "" },       // e.g., http://142.93.213.187:3000
    endpoint: { type: String, default: "" },   // e.g., /pdf/compile or /pdf/compile-bundle
    durationMs: { type: Number, default: 0 },
    ok: { type: Boolean, default: true },
    error: { type: String, default: "" },
  },
  { _id: false }
);

const CustomerHeaderJobSchema = new mongoose.Schema(
  {
    kind: { type: String, default: "customer-header" },
    payload: { type: CustomerHeaderPayloadSchema, required: true },
    pdf: { type: PdfMetaSchema, required: true },
    compiler: { type: RemoteCompilerSchema, default: undefined },
    // ✅ NEW: Soft delete field for agreements
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: null },
    // If you later want to store the PDF (small files), uncomment:
    // pdfBase64: { type: String, default: "" },
  },
  { timestamps: true }
);

CustomerHeaderJobSchema.index({ createdAt: -1 });
CustomerHeaderJobSchema.index({ kind: 1 });

const CustomerHeaderJob = mongoose.model("CustomerHeaderJob", CustomerHeaderJobSchema);
export default CustomerHeaderJob;
