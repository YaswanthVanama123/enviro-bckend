import { Router } from "express";
import {
  // listPriceFixings,
  // upsertPriceFixings,
  // listProductNames,
  // listAllServicesGrouped,   // <-- NEW
} from "../controllers/priceFixController.js";

// import adminAuth from "../middleware/adminAuth.js";

import {
  createPriceFix,
  getAllPriceFixes,
  getPriceFixById,
  updatePriceFix,
} from "../controllers/priceFixController.js";

const router = Router();

// router.post("/fixings", upsertPriceFixings);
// router.get("/fixings", listPriceFixings);
// router.get("/names", listProductNames);

// Expose the grouped services under /api/product/services as requested
// router.get("/services", listAllServicesGrouped); // internal path (we'll mount under /api/product)

router.post("/", createPriceFix);

// Get all pricing configs
router.get("/", getAllPriceFixes);

// Get one pricing config by id
router.get("/:id", getPriceFixById);

// Update pricing config by id
router.put("/:id", updatePriceFix);

export default router;
