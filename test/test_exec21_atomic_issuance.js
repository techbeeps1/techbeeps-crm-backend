/**
 * EXEC-21 Verification Suite: Atomic & Unique Sequential Invoice Issuance (Double Billing Block)
 * 
 * Tests:
 * 1. Atomic Concurrent Sequential Issuance: 5 concurrent requests generate unique, strictly sequential, collision-free numbers.
 * 2. Idempotency Key Guard: Submitting with identical X-Idempotency-Key returns existing invoice without creating duplicate.
 * 3. Double-Billing Window Debounce: Rapid identical submissions within 5s window are deduplicated automatically.
 * 4. Unique Index Constraint: Direct duplicate index insertion rejected by MongoDB with E11000.
 * 5. Zero-Regression Release Gate: Baseline Invoice #2026/0025 at €746.39 & PDF Route 200 OK.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const axios = require('axios');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

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
  console.log('EXEC-21: Atomic Sequential Invoice Issuance & Double-Billing Block');
  console.log('================================================================\n');

  // Connect mongoose for direct collection verification
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
      });
      console.log('Connected to MongoDB Atlas for verification.\n');
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
  // Test 1: Atomic Concurrent Sequential Issuance
  // -------------------------------------------------------------
  console.log('--- Test 1: Atomic Concurrent Sequential Issuance (5 Concurrent Requests) ---');
  const createdConcurrentIds = [];
  try {
    const concurrentCount = 5;
    const promises = [];

    for (let i = 0; i < concurrentCount; i++) {
      const payload = {
        subject: `EXEC-21 Concurrent Test ${i + 1}`,
        reference: `INV-CONCURRENT-${i + 1}`,
        vat: 'exclusive',
        discount: 0,
        customer: customerId,
        financialTemplate: templateId,
        items: [
          { description: `Concurrent Item ${i + 1}`, quantity: 1, price: 100 + i, btw: 'standard_21' }
        ]
      };
      // Allow intentional parallel distinct creation
      promises.push(
        axios.post(`${BASE_URL}/invoice/new_invoice`, payload, {
          ...authHeaders,
          headers: {
            ...authHeaders.headers,
            'X-Allow-Duplicate': 'true' // Bypass debounce because these are deliberately distinct items
          }
        })
      );
    }

    const results = await Promise.all(promises);
    const indices = [];

    results.forEach((res, idx) => {
      assert(res.status === 201, `Concurrent request ${idx + 1} succeeded with HTTP 201`);
      const inv = res.data;
      createdConcurrentIds.push(inv._id);
      indices.push(inv.index);
    });

    console.log('  Allocated indices:', indices);

    // Verify all 5 are strictly unique
    const uniqueSet = new Set(indices);
    assert(uniqueSet.size === concurrentCount, `All ${concurrentCount} allocated invoice numbers are strictly unique`);

    // Verify sequential integrity: parse numbers and verify they form continuous chain
    const parsedNums = indices.map(idx => {
      const match = String(idx).match(/(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    }).sort((a, b) => a - b);

    let isStrictlySequential = true;
    for (let i = 1; i < parsedNums.length; i++) {
      if (parsedNums[i] !== parsedNums[i - 1] + 1) {
        isStrictlySequential = false;
        break;
      }
    }
    assert(isStrictlySequential, `Indices form continuous gap-free sequence: [${parsedNums.join(', ')}]`);

    // Clean up
    for (const id of createdConcurrentIds) {
      await axios.delete(`${BASE_URL}/invoice/deleteInvoice/${id}`, authHeaders);
    }
    console.log('  ✓ Concurrent test invoices cleaned up cleanly');
    testsPassed++;
  } catch (err) {
    assert(false, `Concurrent sequential issuance failed: ${err.response?.data?.message || err.message}`);
  }

  // -------------------------------------------------------------
  // Test 2: Idempotency Key Guard (Double-Click Prevention)
  // -------------------------------------------------------------
  console.log('\n--- Test 2: Idempotency Key Guard (Exact Same Key Sent Twice) ---');
  let idempotencyInvoiceId = null;
  try {
    const testIdempotencyKey = `KEY-EXEC21-TEST-${Date.now()}`;
    const payload = {
      subject: 'EXEC-21 Idempotency Key Test',
      reference: 'INV-EXEC21-IDEM',
      vat: 'exclusive',
      discount: 0,
      customer: customerId,
      financialTemplate: templateId,
      items: [
        { description: 'Idempotent Item', quantity: 1, price: 250, btw: '21' }
      ]
    };

    // First request
    const res1 = await axios.post(`${BASE_URL}/invoice/new_invoice`, payload, {
      ...authHeaders,
      headers: {
        ...authHeaders.headers,
        'X-Idempotency-Key': testIdempotencyKey
      }
    });
    assert(res1.status === 201 || res1.status === 200, `First request succeeded (HTTP ${res1.status})`);
    idempotencyInvoiceId = res1.data._id;
    const firstIndex = res1.data.index;

    // Second request with exact same idempotency key (simulating double click)
    const res2 = await axios.post(`${BASE_URL}/invoice/new_invoice`, payload, {
      ...authHeaders,
      headers: {
        ...authHeaders.headers,
        'X-Idempotency-Key': testIdempotencyKey
      }
    });
    assert(res2.status === 200 || res2.status === 201, `Second request returned gracefully (HTTP ${res2.status})`);
    assert(res2.data._id === idempotencyInvoiceId, 'Second request returned exact same MongoDB _id');
    assert(res2.data.index === firstIndex, `Second request returned exact same invoice index (${firstIndex})`);

    // Verify only ONE invoice exists in DB for this key
    const InvoiceModel = require('../models/invoice');
    const matches = await InvoiceModel.find({ idempotencyKey: testIdempotencyKey });
    assert(matches.length === 1, `Database contains strictly 1 invoice document for idempotencyKey (found ${matches.length})`);

    // Clean up
    await axios.delete(`${BASE_URL}/invoice/deleteInvoice/${idempotencyInvoiceId}`, authHeaders);
    console.log('  ✓ Idempotency test invoice cleaned up cleanly');
    testsPassed++;
  } catch (err) {
    assert(false, `Idempotency key test failed: ${err.response?.data?.message || err.message}`);
  }

  // -------------------------------------------------------------
  // Test 3: Double-Billing 5-Second Window Debounce Guard
  // -------------------------------------------------------------
  console.log('\n--- Test 3: Double-Billing 5-Second Window Debounce Guard ---');
  let debouncedInvoiceId = null;
  try {
    const payload = {
      subject: 'EXEC-21 Window Debounce Test',
      reference: 'INV-EXEC21-DEBOUNCE',
      vat: 'exclusive',
      discount: 0,
      customer: customerId,
      financialTemplate: templateId,
      items: [
        { description: 'Rapid Double Click Item', quantity: 2, price: 175, btw: '21' }
      ]
    };

    // First request
    const res1 = await axios.post(`${BASE_URL}/invoice/new_invoice`, payload, authHeaders);
    assert(res1.status === 201, `First click created invoice (HTTP 201)`);
    debouncedInvoiceId = res1.data._id;
    const firstIndex = res1.data.index;

    // Second request within 200ms without idempotency key (rapid double click)
    const res2 = await axios.post(`${BASE_URL}/invoice/new_invoice`, payload, authHeaders);
    assert(res2.status === 200, `Second rapid click intercepted by double-billing guard (HTTP 200)`);
    assert(res2.data._id === debouncedInvoiceId, 'Duplicate billing blocked: returned existing invoice _id');
    assert(res2.data.index === firstIndex, 'Duplicate billing blocked: no second invoice number issued');

    // Clean up
    await axios.delete(`${BASE_URL}/invoice/deleteInvoice/${debouncedInvoiceId}`, authHeaders);
    console.log('  ✓ Debounce test invoice cleaned up cleanly');
    testsPassed++;
  } catch (err) {
    assert(false, `Double-billing window debounce failed: ${err.response?.data?.message || err.message}`);
  }

  // -------------------------------------------------------------
  // Test 4: Database Unique Index Constraint on `index`
  // -------------------------------------------------------------
  console.log('\n--- Test 4: Database Unique Index Constraint on `index` ---');
  let testUniqueDoc = null;
  try {
    const InvoiceModel = require('../models/invoice');
    const existing = await InvoiceModel.findOne({ index: '2026/0025' });
    assert(existing !== null, 'Existing baseline invoice 2026/0025 confirmed');

    const testIndexVal = `TEST-INV-UNIQUE-${Date.now()}`;
    testUniqueDoc = new InvoiceModel({
      customer: customerId,
      index: testIndexVal,
      total: 100,
      subTotal: 100
    });
    await testUniqueDoc.save();

    // Attempt to insert duplicate document with exact same index directly
    let caughtDuplicateError = false;
    try {
      const duplicateDoc = new InvoiceModel({
        customer: customerId,
        index: testIndexVal,
        total: 999,
        subTotal: 999
      });
      await duplicateDoc.save();
    } catch (saveErr) {
      if (saveErr.code === 11000 || /duplicate key/i.test(saveErr.message)) {
        caughtDuplicateError = true;
      } else {
        console.warn('Different error thrown on duplicate insert:', saveErr.message);
      }
    }

    assert(caughtDuplicateError, 'MongoDB unique index strictly rejected duplicate index insertion with E11000');

    // Clean up
    await InvoiceModel.deleteOne({ _id: testUniqueDoc._id });
    console.log('  ✓ Test unique doc cleaned up cleanly');
    testsPassed++;
  } catch (err) {
    assert(false, `Unique index constraint test failed: ${err.message}`);
    if (testUniqueDoc && testUniqueDoc._id) {
      await require('../models/invoice').deleteOne({ _id: testUniqueDoc._id });
    }
  }

  // -------------------------------------------------------------
  // Test 5: Zero-Regression Baseline Contract Verification
  // -------------------------------------------------------------
  console.log('\n--- Test 5: Zero-Regression Baseline Contract Verification ---');
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
  console.log(`EXEC-21 Verification Complete: ${testsPassed} passed, ${testsFailed} failed.`);
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
