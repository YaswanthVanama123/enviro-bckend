import { Router } from "express";
import {
  listPriceFixings,
  upsertPriceFixings,
  listProductNames,
  listAllServicesGrouped,   // <-- NEW
} from "../controllers/priceFixController.js";

const router = Router();

router.post("/fixings", upsertPriceFixings);
router.get("/fixings", listPriceFixings);
router.get("/names", listProductNames);

// Expose the grouped services under /api/product/services as requested
router.get("/services", listAllServicesGrouped); // internal path (we'll mount under /api/product)

export default router;
