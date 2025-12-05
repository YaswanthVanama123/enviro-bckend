# Frontend Frequency Mapping Implementation Guide

## 🎯 Issue Summary
The backend is correctly sending frequency data, but the frontend is not mapping/displaying these frequencies in the form inputs.

**Backend Response (✅ Correct):**
```json
{
  "products": [
    {
      "displayName": "Turquoise 3 (Pro-Con)",
      "qty": 56,
      "amount": 61,
      "frequency": "weekly",  ← Data is here!
      "total": 3416
    }
  ],
  "dispensers": [
    {
      "displayName": "EM Proprietary Twin JRT",
      "frequency": "daily",   ← Data is here!
      "qty": 6
    }
  ]
}
```

## 🔧 Frontend Fixes Needed

### 1. **Data Loading & State Management**

When you receive the response from the backend, ensure frequency is preserved:

```javascript
// ❌ WRONG - Frequency gets lost
const loadDocument = async (id) => {
  const response = await fetch(`/api/pdf/customer-headers/${id}/edit-format`);
  const data = await response.json();

  // Missing frequency in state update
  setProducts(data.payload.products.products.map(product => ({
    displayName: product.displayName,
    qty: product.qty,
    amount: product.amount,
    total: product.total
    // ❌ Missing: frequency: product.frequency
  })));
};

// ✅ CORRECT - Preserve all fields including frequency
const loadDocument = async (id) => {
  const response = await fetch(`/api/pdf/customer-headers/${id}/edit-format`);
  const data = await response.json();

  console.log('📥 Received data:', data.payload.products);

  // Preserve ALL fields including frequency
  setProducts(data.payload.products.products.map(product => ({
    ...product,  // Spread all fields
    // Explicitly ensure frequency is preserved
    frequency: product.frequency || "",
    // Ensure other critical fields
    _productType: product._productType || "big",
    customName: product.customName || product.displayName
  })));

  setDispensers(data.payload.products.dispensers.map(dispenser => ({
    ...dispenser,  // Spread all fields
    frequency: dispenser.frequency || "",
    _productType: "dispenser",
    customName: dispenser.customName || dispenser.displayName
  })));

  // 🐛 Debug: Log what's in state
  console.log('📦 Products state after load:', products);
  console.log('📦 Dispensers state after load:', dispensers);
};
```

### 2. **Form Input Binding**

Ensure your form inputs are bound to the frequency field:

```jsx
// ❌ WRONG - Frequency input not bound to state
const ProductRow = ({ product, index, onChange }) => {
  return (
    <tr>
      <td>
        <input
          value={product.displayName || ""}
          onChange={(e) => onChange(index, 'displayName', e.target.value)}
        />
      </td>
      <td>
        <input
          type="number"
          value={product.qty || ""}
          onChange={(e) => onChange(index, 'qty', e.target.value)}
        />
      </td>
      <td>
        <input
          type="number"
          value={product.amount || ""}
          onChange={(e) => onChange(index, 'amount', e.target.value)}
        />
      </td>
      <td>
        {/* ❌ Frequency not bound to product.frequency */}
        <select value={""} onChange={(e) => onChange(index, 'frequency', e.target.value)}>
          <option value="">Select Frequency</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="bi-weekly">Bi-Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </td>
    </tr>
  );
};

// ✅ CORRECT - Frequency properly bound
const ProductRow = ({ product, index, onChange }) => {
  return (
    <tr>
      <td>
        <input
          value={product.displayName || ""}
          onChange={(e) => onChange(index, 'displayName', e.target.value)}
        />
      </td>
      <td>
        <input
          type="number"
          value={product.qty || ""}
          onChange={(e) => onChange(index, 'qty', e.target.value)}
        />
      </td>
      <td>
        <input
          type="number"
          value={product.amount || ""}
          onChange={(e) => onChange(index, 'amount', e.target.value)}
        />
      </td>
      <td>
        {/* ✅ Frequency bound to product.frequency */}
        <select
          value={product.frequency || ""}
          onChange={(e) => onChange(index, 'frequency', e.target.value)}
        >
          <option value="">Select Frequency</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="bi-weekly">Bi-Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </td>
    </tr>
  );
};
```

### 3. **State Update Handler**

Ensure your onChange handler updates frequency correctly:

```javascript
// ❌ WRONG - Frequency changes not preserved
const handleProductChange = (index, field, value) => {
  const updatedProducts = [...products];
  updatedProducts[index][field] = value;

  // Missing frequency preservation
  setProducts(updatedProducts);
};

// ✅ CORRECT - All fields preserved including frequency
const handleProductChange = (index, field, value) => {
  const updatedProducts = [...products];

  // Update the specific field
  updatedProducts[index] = {
    ...updatedProducts[index],  // Preserve all existing fields
    [field]: value              // Update only the changed field
  };

  // 🐛 Debug frequency changes
  if (field === 'frequency') {
    console.log(`🔄 Updated product ${index} frequency to: "${value}"`);
  }

  setProducts(updatedProducts);
};

// Same for dispensers
const handleDispenserChange = (index, field, value) => {
  const updatedDispensers = [...dispensers];

  updatedDispensers[index] = {
    ...updatedDispensers[index],
    [field]: value
  };

  if (field === 'frequency') {
    console.log(`🔄 Updated dispenser ${index} frequency to: "${value}"`);
  }

  setDispensers(updatedDispensers);
};
```

### 4. **Save/Submit Handler**

When saving, ensure frequency is included in the payload:

```javascript
// ❌ WRONG - Frequency lost during save
const saveDocument = async () => {
  const payload = {
    products: {
      products: products.map(p => ({
        displayName: p.displayName,
        qty: p.qty,
        amount: p.amount,
        total: p.total
        // ❌ Missing: frequency: p.frequency
      })),
      dispensers: dispensers.map(d => ({
        displayName: d.displayName,
        qty: d.qty,
        warrantyRate: d.warrantyRate,
        replacementRate: d.replacementRate,
        total: d.total
        // ❌ Missing: frequency: d.frequency
      }))
    }
  };

  await fetch(`/api/pdf/customer-headers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
};

// ✅ CORRECT - All fields preserved including frequency
const saveDocument = async () => {
  const payload = {
    products: {
      products: products.map(p => ({
        ...p,  // Include ALL fields including frequency
        // Ensure critical fields are present
        displayName: p.displayName || "",
        customName: p.customName || p.displayName,
        frequency: p.frequency || "",
        _productType: p._productType || "big"
      })),
      dispensers: dispensers.map(d => ({
        ...d,  // Include ALL fields including frequency
        displayName: d.displayName || "",
        customName: d.customName || d.displayName,
        frequency: d.frequency || "",
        _productType: "dispenser"
      }))
    }
  };

  // 🐛 Debug save payload
  console.log('💾 Saving payload:', payload);
  console.log('💾 Product frequencies:', payload.products.products.map(p => p.frequency));
  console.log('💾 Dispenser frequencies:', payload.products.dispensers.map(d => d.frequency));

  await fetch(`/api/pdf/customer-headers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
};
```

### 5. **Complete React Component Example**

```jsx
import React, { useState, useEffect } from 'react';

const DocumentEditor = ({ documentId }) => {
  const [products, setProducts] = useState([]);
  const [dispensers, setDispensers] = useState([]);

  // Load document with proper frequency mapping
  useEffect(() => {
    const loadDocument = async () => {
      try {
        const response = await fetch(`/api/pdf/customer-headers/${documentId}/edit-format`);
        const data = await response.json();

        console.log('📥 Received data:', data.payload.products);

        // Preserve ALL fields including frequency
        setProducts(data.payload.products.products.map(product => ({
          ...product,
          frequency: product.frequency || "",
          _productType: product._productType || "big"
        })));

        setDispensers(data.payload.products.dispensers.map(dispenser => ({
          ...dispenser,
          frequency: dispenser.frequency || "",
          _productType: "dispenser"
        })));

      } catch (error) {
        console.error('Failed to load document:', error);
      }
    };

    if (documentId) {
      loadDocument();
    }
  }, [documentId]);

  // Handle product changes
  const handleProductChange = (index, field, value) => {
    const updatedProducts = [...products];
    updatedProducts[index] = {
      ...updatedProducts[index],
      [field]: value
    };
    setProducts(updatedProducts);
  };

  // Handle dispenser changes
  const handleDispenserChange = (index, field, value) => {
    const updatedDispensers = [...dispensers];
    updatedDispensers[index] = {
      ...updatedDispensers[index],
      [field]: value
    };
    setDispensers(updatedDispensers);
  };

  return (
    <div>
      {/* Products Table */}
      <h3>Products</h3>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Qty</th>
            <th>Amount</th>
            <th>Frequency</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product, index) => (
            <tr key={index}>
              <td>
                <input
                  value={product.displayName || ""}
                  onChange={(e) => handleProductChange(index, 'displayName', e.target.value)}
                />
              </td>
              <td>
                <input
                  type="number"
                  value={product.qty || ""}
                  onChange={(e) => handleProductChange(index, 'qty', parseInt(e.target.value) || 0)}
                />
              </td>
              <td>
                <input
                  type="number"
                  step="0.01"
                  value={product.amount || ""}
                  onChange={(e) => handleProductChange(index, 'amount', parseFloat(e.target.value) || 0)}
                />
              </td>
              <td>
                {/* ✅ Frequency properly bound */}
                <select
                  value={product.frequency || ""}
                  onChange={(e) => handleProductChange(index, 'frequency', e.target.value)}
                >
                  <option value="">Select Frequency</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="bi-weekly">Bi-Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </td>
              <td>${product.total || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Dispensers Table */}
      <h3>Dispensers</h3>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Qty</th>
            <th>Warranty Rate</th>
            <th>Replacement Rate</th>
            <th>Frequency</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {dispensers.map((dispenser, index) => (
            <tr key={index}>
              <td>
                <input
                  value={dispenser.displayName || ""}
                  onChange={(e) => handleDispenserChange(index, 'displayName', e.target.value)}
                />
              </td>
              <td>
                <input
                  type="number"
                  value={dispenser.qty || ""}
                  onChange={(e) => handleDispenserChange(index, 'qty', parseInt(e.target.value) || 0)}
                />
              </td>
              <td>
                <input
                  type="number"
                  step="0.01"
                  value={dispenser.warrantyRate || ""}
                  onChange={(e) => handleDispenserChange(index, 'warrantyRate', parseFloat(e.target.value) || 0)}
                />
              </td>
              <td>
                <input
                  type="number"
                  step="0.01"
                  value={dispenser.replacementRate || ""}
                  onChange={(e) => handleDispenserChange(index, 'replacementRate', parseFloat(e.target.value) || 0)}
                />
              </td>
              <td>
                {/* ✅ Frequency properly bound */}
                <select
                  value={dispenser.frequency || ""}
                  onChange={(e) => handleDispenserChange(index, 'frequency', e.target.value)}
                >
                  <option value="">Select Frequency</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="bi-weekly">Bi-Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </td>
              <td>${dispenser.total || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DocumentEditor;
```

## 🐛 Debugging Checklist

1. **Check Browser Console** for these logs:
   ```
   📥 Received data: { products: [...], dispensers: [...] }
   📦 Products state after load: [...]
   🔄 Updated product 0 frequency to: "weekly"
   💾 Saving payload: { products: {...} }
   ```

2. **Inspect Form Elements** - Right-click on frequency dropdowns and check if `value` attribute shows the correct frequency

3. **React DevTools** - Check if your component state contains frequency values

4. **Network Tab** - Verify the save request payload includes frequency fields

## 🎯 Key Points

1. **Always use spread operator** (`...product`) when updating state to preserve all fields
2. **Explicitly bind frequency** to form inputs: `value={product.frequency || ""}`
3. **Include frequency in save payload** - don't manually pick fields, use spread operator
4. **Add debug logs** to track frequency through the data flow
5. **Handle empty frequencies** with fallback to empty string: `|| ""`

After implementing these changes, your frequency data should properly map from backend → frontend → save → backend! 🎉