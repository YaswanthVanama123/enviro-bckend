// src/models/PriceFix.js
import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * RESTROOM & HYGIENE (SaniClean) pricing
 * Based on PDF: all-inclusive per fixture, weekly min, trip charge.
 */
const RestroomHygienePricingSchema = new Schema(
  {
    ratePerFixture: { type: Number, required: true },          // e.g. 20
    weeklyMinimum: { type: Number, required: true },           // e.g. 40
    tripChargeStandard: { type: Number, required: true },      // e.g. 8 or 6
    insideBeltwayExtra: { type: Number, default: 0 },          // optional extra charge
    maxFixturesPerLocation: { type: Number, default: 200 }
  },
  { _id: false }
);

/**
 * FOAMING DRAIN pricing
 * Standard drain plan + large drain plan + filthy install multiplier.
 */
const FoamingDrainPricingSchema = new Schema(
  {
    standardDrainRate: { type: Number, required: true },       // e.g. 10 per drain
    largeDrainBaseCharge: { type: Number, required: true },    // e.g. 20
    largeDrainExtraPerDrain: { type: Number, required: true }, // e.g. 4 per drain
    greaseTrapRate: { type: Number, default: 0 },              // if you bill traps separately
    installMultiplierFilthy: { type: Number, required: true }, // e.g. 3x for filthy/initial
    defaultFrequency: { type: String, default: "Weekly" }
  },
  { _id: false }
);

/**
 * SCRUB SERVICE (SaniScrub) pricing
 * Fixtures + non-bathroom sq ft units + install multipliers.
 */
const ScrubServicePricingSchema = new Schema(
  {
    fixtureRate: { type: Number, required: true },             // per bathroom fixture
    fixtureMinimum: { type: Number, required: true },          // min charge (e.g. 175)
    nonBathroomUnitSqFt: { type: Number, required: true },     // e.g. 500
    nonBathroomFirstUnitRate: { type: Number, required: true },// e.g. 250
    nonBathroomAdditionalUnitRate: { type: Number, required: true }, // e.g. 125
    installMultiplierClean: { type: Number, default: 1 },
    installMultiplierDirty: { type: Number, required: true },  // e.g. 3
    allowedFrequencies: {
      type: [String],
      default: ["Monthly", "Bi-Monthly", "Quarterly"]
    }
  },
  { _id: false }
);

/**
 * HAND SANITIZER pricing
 */
const HandSanitizerPricingSchema = new Schema(
  {
    fillRatePerUnit: { type: Number, required: true },        // per dispenser fill
    perGallonPrice: { type: Number, required: true },         // chemical per gallon
    dispenserInstallCharge: { type: Number, required: true }, // per dispenser install
    warrantyPerDispenserWeekly: { type: Number, required: true }, // warranty per week
    defaultFrequency: { type: String, default: "Weekly" }
  },
  { _id: false }
);

/**
 * MICROMAX FLOOR / MICROFIBER MOPPING pricing
 */
const MicromaxFloorPricingSchema = new Schema(
  {
    includedBathroomRate: { type: Number, required: true },   // $10 per bathroom when combined
    extraAreaSqFtUnit: { type: Number, required: true },      // 400 sq ft unit
    extraAreaRatePerUnit: { type: Number, required: true },   // $ per 400 sq ft
    standaloneSqFtUnit: { type: Number, required: true },     // 200 sq ft unit
    standaloneRatePerUnit: { type: Number, required: true },  // $ per 200 sq ft
    standaloneMinimum: { type: Number, required: true },      // $40 minimum
    chemicalPerGallon: { type: Number, required: true },      // 27.34
    defaultFrequency: { type: String, default: "Weekly" }
  },
  { _id: false }
);

/**
 * RPM WINDOW pricing
 */
const RpmWindowPricingSchema = new Schema(
  {
    smallWindowRate: { type: Number, required: true },        // per small pane
    mediumWindowRate: { type: Number, required: true },       // per medium pane
    largeWindowRate: { type: Number, required: true },        // per large pane
    tripCharge: { type: Number, required: true },             // base trip charge
    installMultiplierFirstTime: { type: Number, required: true }, // 3x for first time install
    allowedFrequencies: {
      type: [String],
      default: ["Weekly", "Bi-Weekly", "Monthly", "Quarterly"]
    }
  },
  { _id: false }
);

/**
 * SANIPOD pricing
 */
const SaniPodPricingSchema = new Schema(
  {
    weeklyRatePerUnit: { type: Number, required: true },      // weekly per pod
    installChargePerUnit: { type: Number, required: true },   // per pod install
    extraBagPrice: { type: Number, required: true },          // per extra bag
    standaloneMinimum: { type: Number, required: true },      // min standalone
    defaultFrequency: { type: String, default: "Weekly" }
  },
  { _id: false }
);

/**
 * TRIP CHARGE pricing
 */
const TripChargePricingSchema = new Schema(
  {
    standard: { type: Number, required: true },               // default trip charge
    insideBeltway: { type: Number, required: true },
    paidParking: { type: Number, required: true },
    twoPerson: { type: Number, required: true }
  },
  { _id: false }
);

/**
 * Root services pricing bundle
 */
const ServicesPricingSchema = new Schema(
  {
    restroomHygiene: { type: RestroomHygienePricingSchema, required: true },
    foamingDrain: { type: FoamingDrainPricingSchema, required: true },
    scrubService: { type: ScrubServicePricingSchema, required: true },
    handSanitizer: { type: HandSanitizerPricingSchema, required: true },
    micromaxFloor: { type: MicromaxFloorPricingSchema, required: true },
    rpmWindow: { type: RpmWindowPricingSchema, required: true },
    saniPod: { type: SaniPodPricingSchema, required: true },
    tripCharge: { type: TripChargePricingSchema, required: true }
  },
  { _id: false }
);

/**
 * PriceFix master document
 * We can also keep other price fix types later; this one is keyed by "servicePricingMaster".
 */
const PriceFixSchema = new Schema(
  {
    key: { type: String, required: true, unique: true }, // e.g. "servicePricingMaster"
    description: { type: String },
    services: { type: ServicesPricingSchema, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "AdminUser" }
  },
  { timestamps: true }
);

const PriceFix = mongoose.model("PriceFix", PriceFixSchema);

export default PriceFix;
