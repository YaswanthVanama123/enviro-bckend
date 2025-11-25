import express from "express";
import * as productCatalogController from "../controllers/productCatalogController.js";

const router = express.Router();

router.post(
  "/",
  
  productCatalogController.createCatalogController
);

router.get(
  "/",
  
  productCatalogController.getAllCatalogsController
);

router.get(
  "/active",
  
  productCatalogController.getActiveCatalogController
);

router.get(
  "/:id",
  
  productCatalogController.getCatalogByIdController
);

router.put(
  "/:id",
  productCatalogController.replaceCatalogController
);

router.put(
  "/:id/partial",
  productCatalogController.partialUpdateCatalogController
);

router.get(
  "/category/:familyKey",
  productCatalogController.getByCategoryController
);

router.get(
  "/products/search",
  productCatalogController.searchProductsController
);

export default router;
