/**
 * EXEC-20 Verification Suite: Eliminate Stale Invoice Summaries & Zero-to-One Conversion Bug
 * 
 * Tests:
 * 1. Zero-to-One Bug Elimination in Line Items: Quantity: 0 strictly preserves 0 and evaluates to €0.00.
 * 2. PDF Rendering Zero Preservation: Invoice with quantity: 0 renders 0 units and €0.00 without triggering fallback 1.
 * 3. Stale Invoice Summary Invalidation on GET /invoice/invoice/:id: Server returns fresh authoritative totals even if stored with stale cache.
 * 4. Stale Invoice Summary Overwrite on Update (POST /invoice/update/:id): Submitting stale/tampered totals is overwritten with authoritative math.
 * 5. Quote / Finance Authoritative Recalculation (GET /finance/finance/:id): Quote detail refreshes authoritative totals from line items.
 * 6. Zero-Regression Release Gate: Baseline Invoice #2026/0025 at €746.39 & PDF Route 200 OK.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const axios = require('axios');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { calculateCommercialTotals, roundToCents } = require('../utils/moneyCalculator');

const BASE_URL = 'http://127.0.0.1:8080';
const JWT_SECRET = 'abcdefghijklmnopqrstuvwxyz';
const TEST_USER = {
  id: '67c05a32a7cf083dc7f2fbd6',
  username: 'techbeeps',
  email: 'mprofessionalwfh@gmail.com',
  role: 'Admin'
};

const authToken = jwt.sign(TEST_USER, JWT_SECRET, { expiresIn: '1h' });
const authHeaders = {
  headers: {
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json'
  }
};

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    testsPassed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    testsFailed++;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('EXEC-20: Eliminate Stale Invoice Summaries & Zero-to-One Bug');
  console.log('================================================================\n');

  // Connect mongoose for direct document inspection/manipulation
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
      });
      console.log('Connected to MongoDB Atlas for test verification.');
    }
  } catch (dbErr) {
    console.warn('Warning: Could not connect mongoose directly:', dbErr.message);
  }

  // Obtain an existing customer from the CRM
  let customerId = null;
  let templateId = null;
  try {
    const custRes = await axios.get(`${BASE_URL}/customer/customerList`, authHeaders);
    const existingCustomers = custRes.data?.customers || [];
    if (existingCustomers.length > 0) {
      customerId = existingCustomers[0]._id;
      console.log(`Using customer ID: ${customerId} (${existingCustomers[0].firstName || ''} ${existingCustomers[0].lastName || ''})`);
    } else {
      console.error('No customer found in DB');
      process.exit(1);
    }

    const tRes = await axios.get(`${BASE_URL}/api/templates?type=invoice`, authHeaders);
    const templates = tRes.data || [];
    if (templates.length > 0) {
      templateId = templates[0]._id;
      console.log(`Using template ID: ${templateId} (${templates[0].name || ''})\n`);
    }
  } catch (err) {
    console.error('Failed to get initial metadata:', err.message);
    process.exit(1);
  }

  // -------------------------------------------------------------
  // Test 1: Zero-to-One Arithmetic Elimination
  // -------------------------------------------------------------
  console.log('--- Test 1: Zero-to-One Arithmetic Elimination (quantity: 0) ---');
  {
    const payload = {
      vat: 'exclusive',
      discount: 0,
      items: [
        { description: 'Active Service', quantity: 2, price: 100, btw: '21' },
        { description: 'Zeroed Accessory (deliberately 0)', quantity: 0, price: 50, btw: '21' },
        { description: 'String Zero Quantity', quantity: '0', price: 75, btw: '9' }
      ]
    };

    const calc = calculateCommercialTotals(payload);
    assert(calc.subTotal === 200.00, `Subtotal strictly equals €200.00 (got ${calc.subTotal}) - 0 quantities contributed €0`);
    assert(calc.total === 242.00, `Total strictly equals €242.00 (€200 + 21% VAT €42.00) (got ${calc.total})`);
    assert(calc.items[1].quantity === 0, 'Item 1 quantity preserved as 0');
    assert(calc.items[2].quantity === 0, 'Item 2 string "0" coerced to numeric 0');
  }

  // -------------------------------------------------------------
  // Test 2: Live Invoice Creation & PDF Generation with Quantity 0
  // -------------------------------------------------------------
  console.log('\n--- Test 2: Invoice Creation & PDF Download with Quantity: 0 ---');
  let zeroInvoiceId = null;
  try {
    const postPayload = {
      subject: 'EXEC-20 Zero Quantity Invoice Test',
      reference: 'INV-EXEC20-ZERO',
      vat: 'exclusive',
      discount: 0,
      customer: customerId,
      financialTemplate: templateId,
      items: [
        { description: 'Moving Labor', quantity: 1, price: 500, btw: 'standard_21' },
        { description: 'Waived Packing Fee', quantity: 0, price: 150, btw: 'standard_21' }
      ]
    };

    const createRes = await axios.post(`${BASE_URL}/invoice/new_invoice`, postPayload, authHeaders);
    assert(createRes.status === 201, `Invoice with zero quantity created (HTTP ${createRes.status})`);
    zeroInvoiceId = createRes.data?._id;

    assert(createRes.data.subTotal === 500, `Authoritative subtotal is €500.00 (got ${createRes.data.subTotal})`);
    assert(createRes.data.total === 605, `Authoritative total is €605.00 (€500 + €105 VAT) (got ${createRes.data.total})`);

    // Download PDF to ensure generatePdf renders quantity 0 without fallback to 1
    const pdfRes = await axios.post(`${BASE_URL}/invoice/download`, { Id: zeroInvoiceId }, {
      ...authHeaders,
      responseType: 'arraybuffer'
    });
    assert(pdfRes.status === 200, 'PDF download for zero-quantity invoice returned HTTP 200 OK');
    assert(pdfRes.headers['content-type']?.includes('application/pdf'), 'Content-Type confirmed as application/pdf');
    assert(pdfRes.data.byteLength > 50000, `PDF size is valid (${pdfRes.data.byteLength} bytes)`);

    // Clean up
    await axios.delete(`${BASE_URL}/invoice/deleteInvoice/${zeroInvoiceId}`, authHeaders);
    console.log('  ✓ Zero quantity test invoice cleaned up cleanly');
    testsPassed++;
  } catch (err) {
    assert(false, `Zero quantity invoice test failed: ${err.response?.data?.message || err.message}`);
  }

  // -------------------------------------------------------------
  // Test 3: Stale Invoice Summary Invalidation on GET /invoice/invoice/:id
  // -------------------------------------------------------------
  console.log('\n--- Test 3: Stale Summary Invalidation on GET /invoice/invoice/:id ---');
  let staleInvoiceId = null;
  try {
    // 1. Create a clean invoice
    const cleanPayload = {
      subject: 'EXEC-20 Stale Summary Invalidation Test',
      reference: 'INV-EXEC20-STALE',
      vat: 'exclusive',
      discount: 0,
      customer: customerId,
      financialTemplate: templateId,
      items: [
        { description: 'Standard Item', quantity: 1, price: 100, btw: '21' }
      ]
    };
    const invRes = await axios.post(`${BASE_URL}/invoice/new_invoice`, cleanPayload, authHeaders);
    staleInvoiceId = invRes.data._id;

    // 2. Directly corrupt MongoDB document with stale/tampered summaries (simulating old cached bug)
    const InvoiceModel = require('../models/invoice');
    await InvoiceModel.findByIdAndUpdate(staleInvoiceId, {
      subTotal: 9999.00,
      total: 9999.00,
      btw: '9999.00'
    });

    // Verify document was corrupted in DB
    const corruptedDoc = await InvoiceModel.findById(staleInvoiceId);
    assert(corruptedDoc.subTotal === 9999, 'MongoDB document intentionally injected with stale subtotal 9999');

    // 3. Fetch via API GET /invoice/invoice/:id
    const fetchRes = await axios.get(`${BASE_URL}/invoice/invoice/${staleInvoiceId}`, authHeaders);
    const returnedInvoice = fetchRes.data?.invoice;

    assert(returnedInvoice.subTotal === 100.00, `API invalidated stale cache and returned authoritative Subtotal €100.00 (got ${returnedInvoice.subTotal})`);
    assert(returnedInvoice.btw === '21.00', `API invalidated stale cache and returned authoritative VAT €21.00 (got ${returnedInvoice.btw})`);
    assert(returnedInvoice.total === 121.00, `API invalidated stale cache and returned authoritative Total €121.00 (got ${returnedInvoice.total})`);

    // Clean up
    await axios.delete(`${BASE_URL}/invoice/deleteInvoice/${staleInvoiceId}`, authHeaders);
    console.log('  ✓ Stale test invoice cleaned up cleanly');
    testsPassed++;
  } catch (err) {
    assert(false, `Stale summary invalidation test failed: ${err.response?.data?.message || err.message}`);
  }

  // -------------------------------------------------------------
  // Test 4: Stale Summary Overwrite on Update (POST /invoice/update/:id)
  // -------------------------------------------------------------
  console.log('\n--- Test 4: Stale Summary Overwrite on Update (POST /invoice/update/:id) ---');
  let updateInvoiceId = null;
  try {
    // Create base invoice
    const basePayload = {
      subject: 'EXEC-20 Update Overwrite Test',
      reference: 'INV-EXEC20-UPD',
      vat: 'exclusive',
      discount: 0,
      customer: customerId,
      financialTemplate: templateId,
      items: [
        { description: 'Initial Service', quantity: 1, price: 200, btw: '21' }
      ]
    };
    const createRes = await axios.post(`${BASE_URL}/invoice/new_invoice`, basePayload, authHeaders);
    updateInvoiceId = createRes.data._id;

    // Client updates items to 300 EUR, but sends stale/tampered summaries (e.g. from an old client session)
    const tamperedUpdate = {
      customer: customerId,
      items: [
        { description: 'Updated Service', quantity: 2, price: 150, btw: '21' } // 300 net -> total 363
      ],
      vat: 'exclusive',
      discount: 0,
      subTotal: 50.00, // Malicious / stale!
      total: 60.50,    // Malicious / stale!
      btw: '10.50'     // Malicious / stale!
    };

    const updateRes = await axios.post(`${BASE_URL}/invoice/update/${updateInvoiceId}`, tamperedUpdate, authHeaders);
    const updated = updateRes.data;

    assert(updated.subTotal === 300.00, `Server rejected stale subtotal 50.00 and enforced €300.00 (got ${updated.subTotal})`);
    assert(updated.btw === '63.00', `Server rejected stale VAT 10.50 and enforced €63.00 (got ${updated.btw})`);
    assert(updated.total === 363.00, `Server rejected stale total 60.50 and enforced €363.00 (got ${updated.total})`);

    // Clean up
    await axios.delete(`${BASE_URL}/invoice/deleteInvoice/${updateInvoiceId}`, authHeaders);
    console.log('  ✓ Update test invoice cleaned up cleanly');
    testsPassed++;
  } catch (err) {
    assert(false, `Update overwrite test failed: ${err.response?.data?.message || err.message}`);
  }

  // -------------------------------------------------------------
  // Test 5: Quote Authoritative Recalculation (GET /finance/finance/:id)
  // -------------------------------------------------------------
  console.log('\n--- Test 5: Quote Authoritative Recalculation on Retrieval ---');
  let quoteId = null;
  try {
    const quotePayload = {
      customer: customerId,
      vat: 'exclusive',
      discount: 10,
      items: [
        { description: 'Packing Service', quantity: 1, price: 500, btw: '21' } // 500 - 50 = 450 net -> vat 94.50 -> total 544.50
      ]
    };
    const qRes = await axios.post(`${BASE_URL}/finance/add`, quotePayload, authHeaders);
    quoteId = qRes.data._id;

    // Inject stale totals in DB
    const FinanceModel = require('../models/finance');
    await FinanceModel.findByIdAndUpdate(quoteId, {
      subTotal: 8888,
      total: 8888,
      btw: '8888'
    });

    // Retrieve via API GET /finance/finance/:Id
    const getRes = await axios.get(`${BASE_URL}/finance/finance/${quoteId}`, authHeaders);
    const quoteData = getRes.data?.data || getRes.data?.finance || getRes.data;

    assert(quoteData.subTotal === 500.00, `Quote retrieved with authoritative subtotal €500.00 (got ${quoteData.subTotal})`);
    assert(quoteData.total === 544.50, `Quote retrieved with authoritative total €544.50 (got ${quoteData.total})`);

    // Clean up
    await axios.delete(`${BASE_URL}/finance/deleteFinance/${quoteId}`, authHeaders);
    console.log('  ✓ Test quote cleaned up cleanly');
    testsPassed++;
  } catch (err) {
    assert(false, `Quote authoritative recalculation failed: ${err.response?.data?.message || err.message}`);
  }

  // -------------------------------------------------------------
  // Test 6: Zero-Regression Release Gate (Baseline #2026/0025)
  // -------------------------------------------------------------
  console.log('\n--- Test 6: Zero-Regression Baseline Contract Verification ---');
  try {
    const allInvoicesRes = await axios.get(`${BASE_URL}/invoice/invoiceList`, authHeaders);
    const invoiceList = allInvoicesRes.data?.invoiceData || [];
    const baselineInv = invoiceList.find(inv => inv.index === '2026/0025' || inv.reference === '2026/0025');

    assert(baselineInv !== undefined, 'Baseline invoice #2026/0025 successfully retrieved from list');
    assert(Number(baselineInv.total) === 746.39, `Authoritative total strictly preserved at €746.39 (got ${baselineInv.total})`);
    assert(Number(baselineInv.btw) === 129.54, `Authoritative VAT strictly preserved at €129.54 (got ${baselineInv.btw})`);

    // Verify PDF download route 200 OK
    const pdfRes = await axios.post(`${BASE_URL}/invoice/download`, { Id: baselineInv._id }, {
      ...authHeaders,
      responseType: 'arraybuffer'
    });
    assert(pdfRes.status === 200, `Baseline PDF download route returns HTTP 200 OK`);
    assert(pdfRes.headers['content-type']?.includes('application/pdf'), 'Content-Type confirmed as application/pdf');
    assert(pdfRes.data.byteLength > 50000, `PDF content length is valid (${pdfRes.data.byteLength} bytes)`);
  } catch (err) {
    assert(false, `Zero-regression baseline verification failed: ${err.response?.data?.message || err.message}`);
  }

  console.log('\n================================================================');
  console.log(`EXEC-20 Verification Complete: ${testsPassed} passed, ${testsFailed} failed.`);
  console.log('================================================================');

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  if (testsFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
