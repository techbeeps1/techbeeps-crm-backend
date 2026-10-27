/**
 * EXEC-19 Verification Suite: Tax Selection Unification & Discount Proportionality
 * 
 * Tests:
 * 1. Exclusive Fixture F-04: €1000 @ 21% + €100 @ 9% with 10% discount -> Total €1187.10
 * 2. Inclusive Fixture F-05: €1000 @ 21% + €100 @ 9% with 10% discount -> Total €990.00 (Net €826.37, VAT €163.63)
 * 3. Dutch Statutory Tax Catalog Completeness and Resolution
 * 4. Mixed Zero-Rate Legal Treatments (0% Standard vs 0% Reverse Charge vs 0% Exempt)
 * 5. Server-side Invoice Recalculation API Integration (POST /invoice/new_invoice)
 * 6. Zero-Regression Release Gate: Baseline Invoice #2026/0025 at €746.39 & PDF Route 200 OK
 */

const axios = require('axios');
const jwt = require('jsonwebtoken');
const { calculateCommercialTotals, roundToCents, parseRate } = require('../utils/moneyCalculator');
const { TAX_CATALOG, getStandardTaxOptions, resolveTaxRate, resolveTaxCode } = require('../utils/taxCatalog');

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
  console.log('EXEC-19: Unify Tax Selection & Proportional Discount Verification');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // Test 1: Exclusive Fixture F-04
  // -------------------------------------------------------------
  console.log('--- Test 1: Exclusive Fixture F-04 (10% Discount across 21% & 9%) ---');
  {
    const payload = {
      vat: 'exclusive',
      discount: 10,
      items: [
        { description: 'Service A (High VAT)', quantity: 1, price: 1000.00, btw: '21' },
        { description: 'Service B (Low VAT)', quantity: 1, price: 100.00, btw: '9' }
      ]
    };

    const result = calculateCommercialTotals(payload);
    assert(result.subTotal === 1100.00, `Gross subtotal is €1100.00 (got ${result.subTotal})`);
    assert(result.discountedPrice === 110.00, `Discount amount is €110.00 (got ${result.discountedPrice})`);
    assert(result.net === 990.00, `Net base is €990.00 (got ${result.net})`);
    assert(result.totalVat === 197.10, `Total VAT is €197.10 (got ${result.totalVat})`);
    assert(result.total === 1187.10, `Total Payable matches F-04 exactly: €1187.10 (got ${result.total})`);
  }

  // -------------------------------------------------------------
  // Test 2: Inclusive Fixture F-05
  // -------------------------------------------------------------
  console.log('\n--- Test 2: Inclusive Fixture F-05 (10% Discount across 21% & 9%) ---');
  {
    const payload = {
      vat: 'inclusive',
      discount: 10,
      items: [
        { description: 'Service A (High VAT Gross)', quantity: 1, price: 1000.00, btw: '21' },
        { description: 'Service B (Low VAT Gross)', quantity: 1, price: 100.00, btw: '9' }
      ]
    };

    const result = calculateCommercialTotals(payload);
    assert(result.subTotal === 1100.00, `Gross subtotal is €1100.00 (got ${result.subTotal})`);
    assert(result.discountedPrice === 110.00, `Discount amount is €110.00 (got ${result.discountedPrice})`);
    assert(result.total === 990.00, `Total Payable matches F-05 exactly: €990.00 (got ${result.total})`);
    assert(result.net === 826.37, `Derived Net matches F-05 exactly: €826.37 (got ${result.net})`);
    assert(result.totalVat === 163.63, `Derived VAT matches F-05 exactly: €163.63 (got ${result.totalVat})`);
    assert(roundToCents(result.net + result.totalVat) === result.total, 'Net + VAT strictly equals Total Payable');
  }

  // -------------------------------------------------------------
  // Test 3: Tax Catalog Completeness & Resolution
  // -------------------------------------------------------------
  console.log('\n--- Test 3: Dutch Statutory Tax Catalog Completeness & Resolution ---');
  {
    const options = getStandardTaxOptions();
    assert(options.length >= 5, `Tax catalog contains at least 5 standard Dutch options (found ${options.length})`);

    const standard21 = options.find(o => o.rate === 21);
    const reduced9 = options.find(o => o.rate === 9);
    const reverse0 = options.find(o => o.code === '0_RC');
    const exempt0 = options.find(o => o.code === '0_EX');
    const export0 = options.find(o => o.code === '0_EXP');

    assert(standard21 && standard21.rate === 21, 'Standard 21% rate defined');
    assert(reduced9 && reduced9.rate === 9, 'Reduced 9% rate defined');
    assert(reverse0 && reverse0.rate === 0 && /verlegd|reverse/i.test(reverse0.label), '0% Reverse Charge defined with legal text');
    assert(exempt0 && exempt0.rate === 0 && /vrijgesteld|exempt/i.test(exempt0.label), '0% Exempt defined with legal text');
    assert(export0 && export0.rate === 0 && /uitvoer|export/i.test(export0.label), '0% Export defined with legal text');

    // Test resolveTaxRate with various input formats
    assert(resolveTaxRate('21') === 21, 'resolveTaxRate("21") -> 21');
    assert(resolveTaxRate(21) === 21, 'resolveTaxRate(21) -> 21');
    assert(resolveTaxRate('standard_21') === 21, 'resolveTaxRate("standard_21") -> 21');
    assert(resolveTaxRate('9') === 9, 'resolveTaxRate("9") -> 9');
    assert(resolveTaxRate('0_RC') === 0, 'resolveTaxRate("0_RC") -> 0');
    assert(resolveTaxRate('0_EX') === 0, 'resolveTaxRate("0_EX") -> 0');
    assert(resolveTaxRate('0_EXP') === 0, 'resolveTaxRate("0_EXP") -> 0');
    assert(resolveTaxRate('0') === 0, 'resolveTaxRate("0") -> 0');
  }

  // -------------------------------------------------------------
  // Test 4: Mixed Zero-Rate Legal Treatments
  // -------------------------------------------------------------
  console.log('\n--- Test 4: Mixed Zero-Rate Commercial Calculation ---');
  {
    const payload = {
      vat: 'exclusive',
      discount: 20, // 20% discount
      items: [
        { description: 'Domestic standard taxable', quantity: 2, price: 100, btw: 'standard_21' }, // 200 -> net 160 -> vat 33.60
        { description: 'EU B2B Reverse Charge service', quantity: 1, price: 300, btw: '0_RC' },     // 300 -> net 240 -> vat 0.00
        { description: 'Statutory exempt consultation', quantity: 1, price: 100, btw: '0_EX' }     // 100 -> net 80 -> vat 0.00
      ]
    };

    const res = calculateCommercialTotals(payload);
    assert(res.subTotal === 600.00, `Subtotal €600.00 (got ${res.subTotal})`);
    assert(res.discountedPrice === 120.00, `Discount €120.00 (got ${res.discountedPrice})`);
    assert(res.net === 480.00, `Net base €480.00 (got ${res.net})`);
    assert(res.totalVat === 33.60, `VAT is exactly €33.60 on the 21% portion only (got ${res.totalVat})`);
    assert(res.total === 513.60, `Total payable €513.60 (got ${res.total})`);
  }

  // -------------------------------------------------------------
  // Test 5: Live API Invoice Enforcement (POST /invoice/new_invoice)
  // -------------------------------------------------------------
  console.log('\n--- Test 5: Live API Invoice Creation with Proportional Discount ---');
  try {
    const custRes = await axios.get(`${BASE_URL}/customer/customerList`, authHeaders);
    const existingCustomers = custRes.data?.customers || [];
    assert(existingCustomers.length > 0, 'Database customer retrieved for invoice test');
    const customerId = existingCustomers[0]._id;

    const postPayload = {
      subject: 'EXEC-19 Tax & Discount Verification Test',
      reference: 'INV-EXEC19-TEST',
      vat: 'exclusive',
      discount: 10,
      customer: customerId,
      items: [
        { description: 'Consulting 21%', quantity: 1, price: 1000, btw: 'standard_21' },
        { description: 'Books 9%', quantity: 1, price: 100, btw: 'reduced_9' }
      ]
    };

    const addRes = await axios.post(`${BASE_URL}/invoice/new_invoice`, postPayload, authHeaders);
    assert(addRes.status === 200 || addRes.status === 201, `Invoice creation returned HTTP ${addRes.status}`);

    const created = addRes.data;
    assert(created !== undefined && created._id !== undefined, 'Created invoice saved with MongoDB _id');
    const invoiceId = created._id;

    assert(Number(created.total) === 1187.10, `Server authoritative total matches €1187.10 (got ${created.total})`);
    assert(Number(created.btw) === 197.10, `Server authoritative VAT matches €197.10 (got ${created.btw})`);
    assert(Number(created.subTotal) === 1100.00, `Server authoritative Subtotal matches €1100.00 (got ${created.subTotal})`);

    // Clean up test invoice
    await axios.delete(`${BASE_URL}/invoice/deleteInvoice/${invoiceId}`, authHeaders);
    console.log('  ✓ Test invoice cleaned up cleanly');
    testsPassed++;
  } catch (err) {
    assert(false, `API invoice creation test failed: ${err.response?.data?.message || err.message}`);
  }

  // -------------------------------------------------------------
  // Test 6: Zero-Regression Release Gate (Baseline #2026/0025 & PDF Route)
  // -------------------------------------------------------------
  console.log('\n--- Test 6: Zero-Regression Contract Verification ---');
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
  console.log(`EXEC-19 Verification Complete: ${testsPassed} passed, ${testsFailed} failed.`);
  console.log('================================================================');

  if (testsFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
