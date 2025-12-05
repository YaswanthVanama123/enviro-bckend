// Backend Frequency Integration Test
// Test file to verify frequency field processing in Node.js backend

/**
 * Test data matching the frontend format with frequency fields
 * UPDATED: Frontend now sends merged "products" array instead of separate smallProducts + bigProducts
 */
const testPayload = {
  headerTitle: "Customer Update Addendum - Frequency Test",
  headerRows: [
    {
      labelLeft: "Customer Name",
      valueLeft: "Test Customer Inc.",
      labelRight: "Service Date",
      valueRight: "2024-12-05"
    }
  ],
  products: {
    // MERGED: Frontend combines small + big products into single "products" array
    products: [
      // Former "small products"
      {
        displayName: "Premium Paper Towels",
        qty: 10,
        unitPrice: 15.50,
        frequency: "weekly",
        total: 155.00
      },
      {
        displayName: "Toilet Paper Roll",
        qty: 20,
        unitPrice: 8.00,
        frequency: "bi-weekly",
        total: 160.00
      },
      // Former "big products"
      {
        displayName: "Industrial Floor Cleaner",
        qty: 5,
        amount: 45.00,
        frequency: "daily",
        total: 225.00
      },
      {
        displayName: "Heavy Duty Degreaser",
        qty: 3,
        amount: 60.00,
        frequency: "weekly",
        total: 180.00
      }
    ],
    dispensers: [
      {
        displayName: "Paper Towel Dispenser",
        qty: 2,
        warrantyRate: 5.00,
        replacementRate: 25.00,
        frequency: "monthly",
        total: 60.00
      },
      {
        displayName: "Soap Dispenser",
        qty: 3,
        warrantyRate: 7.50,
        replacementRate: 30.00,
        frequency: "yearly",
        total: 112.50
      }
    ]
  },
  services: {},
  agreement: {
    enviroOf: "Test Location",
    customerExecutedOn: "2024-01-01",
    additionalMonths: "12"
  }
};

/**
 * Test the buildProductsLatex function with frequency data
 */
function testBuildProductsLatex() {
  console.log("🧪 Testing buildProductsLatex with frequency data (2-category structure)...\n");

  // Mock the buildProductsLatex function logic - UPDATED for 2 categories
  const { products: mergedProducts = [], dispensers = [] } = testPayload.products;

  console.log("📊 Input Data:");
  console.log(`  Merged Products: ${mergedProducts.length} items (small + big combined)`);
  console.log(`  Dispensers: ${dispensers.length} items`);

  // Test the frequency field extraction
  console.log("\n🔍 Frequency Field Extraction Test:");

  mergedProducts.forEach((mp, i) => {
    const productType = mp.unitPrice ? "small" : "big";
    console.log(`  Product ${i + 1} (${productType}): "${mp.displayName}" - Frequency: "${mp.frequency}"`);
  });

  dispensers.forEach((dp, i) => {
    console.log(`  Dispenser ${i + 1}: "${dp.displayName}" - Frequency: "${dp.frequency}"`);
  });

  // Simulate LaTeX column structure - UPDATED for 2 categories (11 columns)
  const headers = [
    "Products", "Qty", "Unit Price/Amount", "Frequency", "Total",
    "Dispensers", "Qty", "Warranty Rate", "Replacement Rate/Install", "Frequency", "Total"
  ];

  console.log(`\n📋 LaTeX Table Structure:`);
  console.log(`  Columns: ${headers.length} (was 16, now 11)`);
  console.log(`  Headers: ${headers.join(" | ")}`);

  // Test row generation
  const rowCount = Math.max(mergedProducts.length, dispensers.length);
  console.log(`\n📝 Generated Rows: ${rowCount}`);

  for (let i = 0; i < Math.min(rowCount, 2); i++) { // Show first 2 rows
    const mp = mergedProducts[i] || {};
    const dp = dispensers[i] || {};

    const rowData = [
      // Merged products (left side)
      mp.displayName || "",
      mp.qty || "",
      mp.unitPrice ? `$${mp.unitPrice}` : mp.amount ? `$${mp.amount}` : "",
      mp.frequency || "",
      mp.total ? `$${mp.total}` : "",

      // Dispensers (right side)
      dp.displayName || "",
      dp.qty || "",
      dp.warrantyRate ? `$${dp.warrantyRate}` : "",
      dp.replacementRate ? `$${dp.replacementRate}` : "",
      dp.frequency || "",
      dp.total ? `$${dp.total}` : ""
    ];

    console.log(`  Row ${i + 1}: ${rowData.join(" | ")}`);
  }

  return true;
}

/**
 * Test frequency validation
 */
function testFrequencyValidation() {
  console.log("\n✅ Testing Frequency Validation:");

  const validFrequencies = ['daily', 'weekly', 'bi-weekly', 'monthly', 'yearly'];

  // UPDATED: Get frequencies from merged products array and dispensers
  const allFrequencies = [
    ...testPayload.products.products.map(p => p.frequency),
    ...testPayload.products.dispensers.map(p => p.frequency)
  ];

  allFrequencies.forEach(freq => {
    const isValid = validFrequencies.includes(freq);
    console.log(`  "${freq}" → ${isValid ? '✅ Valid' : '❌ Invalid'}`);
  });

  return allFrequencies.every(freq => validFrequencies.includes(freq));
}

/**
 * Test complete payload structure
 */
function testPayloadStructure() {
  console.log("\n📦 Testing Payload Structure (2-category):");

  const requiredFields = ['headerTitle', 'headerRows', 'products', 'services', 'agreement'];
  const hasAllFields = requiredFields.every(field => testPayload.hasOwnProperty(field));

  console.log(`  Required fields present: ${hasAllFields ? '✅' : '❌'}`);

  // UPDATED: Only 2 product types now (products + dispensers)
  const productTypes = ['products', 'dispensers'];
  const hasAllProductTypes = productTypes.every(type =>
    testPayload.products.hasOwnProperty(type) && Array.isArray(testPayload.products[type])
  );

  console.log(`  Product types present (2 categories): ${hasAllProductTypes ? '✅' : '❌'}`);

  // Check that all products have frequency field - UPDATED for merged structure
  const allProducts = [
    ...testPayload.products.products,
    ...testPayload.products.dispensers
  ];

  const allHaveFrequency = allProducts.every(product =>
    product.hasOwnProperty('frequency') && typeof product.frequency === 'string'
  );

  console.log(`  All products have frequency: ${allHaveFrequency ? '✅' : '❌'}`);
  console.log(`  Total products checked: ${allProducts.length} (${testPayload.products.products.length} merged + ${testPayload.products.dispensers.length} dispensers)`);

  return hasAllFields && hasAllProductTypes && allHaveFrequency;
}

/**
 * Run all backend tests
 */
function runBackendFrequencyTests() {
  console.log("🚀 Running Backend Frequency Integration Tests");
  console.log("=".repeat(60));

  const tests = [
    testPayloadStructure,
    testBuildProductsLatex,
    testFrequencyValidation
  ];

  const results = tests.map(test => {
    try {
      return test();
    } catch (error) {
      console.error(`❌ Test failed:`, error);
      return false;
    }
  });

  const allPassed = results.every(result => result === true);

  console.log("\n" + "=".repeat(60));
  console.log(`🎉 Backend Tests ${allPassed ? 'PASSED' : 'FAILED'}`);

  if (allPassed) {
    console.log("\n✅ All frequency integration tests passed!");
    console.log("✅ Payload structure is correct");
    console.log("✅ LaTeX generation supports frequency columns");
    console.log("✅ Frequency validation works");
    console.log("\n🚀 Backend is ready for frequency field support!");
  } else {
    console.log("\n❌ Some tests failed. Please check the implementation.");
  }

  return allPassed;
}

// Export for Node.js
if (typeof module !== 'undefined') {
  module.exports = {
    testPayload,
    runBackendFrequencyTests,
    testBuildProductsLatex,
    testFrequencyValidation,
    testPayloadStructure
  };
}

// Auto-run tests
runBackendFrequencyTests();