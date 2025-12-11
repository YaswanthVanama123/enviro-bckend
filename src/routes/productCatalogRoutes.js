import express from "express";
import * as productCatalogController from "../controllers/productCatalogController.js";
import * as productDescriptionController from "../controllers/productDescriptionController.js";

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
  "/category/:familyKey",
  productCatalogController.getByCategoryController
);

router.get(
  "/products/search",
  productCatalogController.searchProductsController
);

// ===== PRODUCT DESCRIPTION MANAGEMENT ROUTES =====

/**
 * POST /api/product-catalog/add-descriptions - Add descriptions to all products
 * Adds predefined descriptions from PRODUCT_DESCRIPTIONS mapping to all matching products
 */
router.post(
  "/add-descriptions",
  productDescriptionController.addProductDescriptions
);

/**
 * PUT /api/product-catalog/product/:productKey/description - Update single product description
 * Body: { description: "New description text" }
 */
router.put(
  "/product/:productKey/description",
  productDescriptionController.updateProductDescription
);

/**
 * GET /api/product-catalog/missing-descriptions - Get products without descriptions
 * Returns list of products missing descriptions and those with descriptions
 */
router.get(
  "/missing-descriptions",
  productDescriptionController.getMissingDescriptions
);

// ===== COMPREHENSIVE PRODUCT DATA MANAGEMENT ROUTES =====

/**
 * POST /api/product-catalog/add-comprehensive-data - Add comprehensive product data to all products
 * Adds detailed product information from COMPREHENSIVE_PRODUCT_DATA including pricing, features, specifications
 */
router.post(
  "/add-comprehensive-data",
  productDescriptionController.addComprehensiveProductData
);

/**
 * GET /api/product-catalog/comprehensive-data - Get comprehensive product data
 * Query parameters: ?category=Floor Products&search=cleaner&includeServicePricing=true
 * Returns filtered comprehensive product data with optional service pricing
 */
router.get(
  "/comprehensive-data",
  productDescriptionController.getComprehensiveProductData
);

/**
 * GET /api/product-catalog/service-pricing - Get service pricing information
 * Query parameters: ?service=saniClean (optional)
 * Returns all service pricing or specific service pricing data
 */
router.get(
  "/service-pricing",
  productDescriptionController.getServicePricing
);

/**
 * GET /api/product-catalog/products-by-category/:category - Get products by category
 * Path parameter: category name (e.g., "Floor Products", "Sani Products")
 * Query parameters: ?includePricing=false&includeFeatures=false
 * Returns all products in the specified category with optional data filtering
 */
router.get(
  "/products-by-category/:category",
  productDescriptionController.getProductsByCategory
);

/**
 * GET /api/product-catalog/pricing-summary - Get pricing summary across all products
 * Returns pricing analysis including price ranges, category summaries, and service pricing
 */
router.get(
  "/pricing-summary",
  productDescriptionController.getPricingSummary
);

/**
 * GET /api/product-catalog/categories - Get all available product categories
 * Returns list of categories with product counts
 */
router.get(
  "/categories",
  productDescriptionController.getAvailableCategories
);

// ===== PARAMETERIZED ROUTES (MUST BE LAST) =====
// These routes use parameters like /:id and will match any path,
// so they MUST be defined after all specific routes

/**
 * GET /api/product-catalog/:id - Get catalog by ID
 * Path parameter: MongoDB ObjectId
 */
router.get(
  "/:id",
  productCatalogController.getCatalogByIdController
);

/**
 * PUT /api/product-catalog/:id - Replace entire catalog
 * Path parameter: MongoDB ObjectId
 */
router.put(
  "/:id",
  productCatalogController.replaceCatalogController
);

/**
 * PUT /api/product-catalog/:id/partial - Partial update catalog
 * Path parameter: MongoDB ObjectId
 */
router.put(
  "/:id/partial",
  productCatalogController.partialUpdateCatalogController
);

export default router;
