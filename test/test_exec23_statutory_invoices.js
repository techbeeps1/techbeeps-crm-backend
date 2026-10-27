const axios = require('axios');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

function extractPdfText(pdfBuffer) {
  const tmpPath = path.join(__dirname, `tmp_test_${Date.now()}.pdf`);
  fs.writeFileSync(tmpPath, pdfBuffer);
  try {
    const text = execSync(`python -c "import pypdf; reader = pypdf.PdfReader(r'${tmpPath}'); print(' '.join(page.extract_text() for page in reader.pages))"`, { encoding: 'utf8' });
    return text;
  } finally {
    if (fs.existsSync(tmpPath)) {
      try { fs.unlinkSync(tmpPath); } catch (e) {}
    }
  }
}

const BASE_URL = 'http://localhost:8080';
const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';

const adminToken = jwt.sign(
  { id: '6ad202dcb67074d4c4540f70', email: 'admin@universalmovers.nl', role: 'Admin' },
  JWT_SECRET,
  { expiresIn: '2h' }
);
const staffToken = jwt.sign(
  { id: '6ad202dcb67074d4c4540f71', email: 'gurjeet@universalmovers.nl', role: 'Staff' },
  JWT_SECRET,
  { expiresIn: '2h' }
);

const adminHeaders = { headers: { Authorization: `Bearer ${adminToken}` } };
const staffHeaders = { headers: { Authorization: `Bearer ${staffToken}` } };

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
  console.log('EXEC-23: Complete Statutory Invoice PDFs (Belastingdienst & KVK)');
  console.log('================================================================\n');

  let customerId = null;
  let templateId = null;

  try {
    const custRes = await axios.get(`${BASE_URL}/customer/customerList`, staffHeaders);
    const customers = custRes.data?.customers || [];
    if (customers.length > 0) {
      customerId = customers[0]._id;
    }
  } catch (err) {
    console.warn('Customer list warning:', err.message);
  }

  try {
    const tmplRes = await axios.get(`${BASE_URL}/api/templates?type=invoice`, staffHeaders);
    const tmpls = tmplRes.data?.templates || tmplRes.data || [];
    if (tmpls.length > 0) {
      templateId = tmpls[0]._id;
    }
  } catch (err) {
    console.warn('Template list warning:', err.message);
  }

  // --- Test 1: Standalone Non-Labour Invoice Creation Without Mover Count ---
  console.log('--- Test 1: Standalone Non-Labour Invoice Without Mover Count ---');
  let nonLabourInvId = null;
  try {
    const nonLabourPayload = {
      customer: customerId,
      financialTemplate: templateId,
      date: new Date().toISOString(),
      vat: 'exclusive',
      discount: 0,
      discount_description: 'None',
      items: [
        {
          description: 'Warehouse Storage Unit 15m3',
          quantity: 2,
          price: 150.00,
          btw: '21',
        },
        {
          description: 'Heavy Duty Moving Boxes (Pack of 10)',
          quantity: 5,
          price: 25.00,
          btw: '21',
        }
      ],
      jobinput: {}, // Explicitly NO movers field
      idempotencyKey: `test_non_labour_${Date.now()}`,
    };

    const res = await axios.post(`${BASE_URL}/invoice/new_invoice`, nonLabourPayload, staffHeaders);
    assert(res.status === 201, 'Standalone non-labour invoice created successfully (HTTP 201)');
    nonLabourInvId = res.data._id;

    // Subtotal: 2 * 150 + 5 * 25 = 300 + 125 = 425
    // VAT (21%): 425 * 0.21 = 89.25
    // Total: 514.25
    assert(Number(res.data.subTotal) === 425, `Subtotal strictly €425.00 (got ${res.data.subTotal})`);
    assert(Number(res.data.btw) === 89.25, `BTW strictly €89.25 (got ${res.data.btw})`);
    assert(Number(res.data.total) === 514.25, `Total strictly €514.25 (got ${res.data.total})`);

    // Verify snapshot was frozen into document
    assert(!!res.data.companySnapshot, 'Company snapshot automatically attached on issuance');
    assert(res.data.companySnapshot?.kvkNumber === '81234567', 'Snapshot contains approved KVK number 81234567');
    assert(res.data.companySnapshot?.btwNumber === 'NL861234567B01', 'Snapshot contains approved BTW number NL861234567B01');
    assert(res.data.companySnapshot?.bankName === 'ABN AMRO Bank', 'Snapshot contains approved Bank Name');
    assert(res.data.companySnapshot?.iban === 'NL91 ABNA 0417 1643 00', 'Snapshot contains approved IBAN');
    assert(res.data.companySnapshot?.bic === 'ABNANL2A', 'Snapshot contains approved BIC');

    assert(!!res.data.statutorySnapshot, 'Statutory snapshot automatically attached on issuance');
    assert(Array.isArray(res.data.statutorySnapshot?.taxBreakdown), 'Statutory snapshot includes structured tax breakdown');
  } catch (err) {
    assert(false, `Standalone invoice error: ${err.message}`);
  }

  // --- Test 2: Statutory PDF Rendering (Belastingdienst Requirements) ---
  console.log('\n--- Test 2: Statutory PDF Rendering (Belastingdienst Requirements) ---');
  try {
    const pdfRes = await axios.post(
      `${BASE_URL}/invoice/download`,
      { Id: nonLabourInvId },
      { headers: staffHeaders.headers, responseType: 'arraybuffer' }
    );
    assert(pdfRes.status === 200, 'Invoice PDF generated successfully (HTTP 200 OK)');
    assert(pdfRes.headers['content-type'] === 'application/pdf', 'Content-Type is application/pdf');
    assert(pdfRes.data.length > 5000, `PDF size is valid (${pdfRes.data.length} bytes)`);

    const magic = pdfRes.data.slice(0, 4).toString();
    assert(magic === '%PDF', 'PDF file starts with valid %PDF magic header');

    // Extract text from generated PDF to verify statutory Belastingdienst contents
    const pdfText = extractPdfText(pdfRes.data);

    assert(pdfText.includes('Universal Movers'), 'PDF text includes approved trading name "Universal Movers"');
    assert(pdfText.includes('81234567') || pdfText.includes('KVK'), 'PDF text includes KVK identifier');
    assert(pdfText.includes('NL861234567B01') || pdfText.includes('Btw') || pdfText.includes('BTW'), 'PDF text includes statutory Dutch BTW details');
    assert(pdfText.includes('ABN AMRO') || pdfText.includes('NL91'), 'PDF text includes approved Dutch payment bank/IBAN instructions');
    assert(!pdfText.includes('[object Object]'), 'PDF text strictly contains NO [object Object] address corruption');
    assert(!pdfText.includes('T00:00:00') && !pdfText.includes('T09:'), 'PDF text strictly contains NO raw ISO timestamps');
  } catch (err) {
    assert(false, `PDF generation error: ${err.message}`);
  }

  // --- Test 3: Immutable Snapshot Preservation (Settings Changes Do Not Rewrite Issued Documents) ---
  console.log('\n--- Test 3: Immutable Snapshot Preservation ---');
  let originalCompany = null;
  let snapTestInvId = null;
  try {
    // 1. Fetch current approved company details
    const origCompRes = await axios.get(`${BASE_URL}/api/company-details`, adminHeaders);
    originalCompany = origCompRes.data;

    // 2. Create an invoice with approved company details
    const snapTestPayload = {
      customer: customerId,
      financialTemplate: templateId,
      date: new Date().toISOString(),
      vat: 'exclusive',
      items: [{ description: 'Statutory Snapshot Test Item', quantity: 1, price: 100.00, btw: '21' }],
      idempotencyKey: `test_snap_${Date.now()}`,
    };
    const snapRes = await axios.post(`${BASE_URL}/invoice/new_invoice`, snapTestPayload, staffHeaders);
    snapTestInvId = snapRes.data._id;
    assert(!!snapRes.data.companySnapshot, 'Document snapshot recorded on issuance');

    // 3. Temporarily mutate CompanyDetails in DB to verify historical documents do NOT change
    const alteredPayload = {
      ...originalCompany,
      companyName: 'MODIFIED TEMPORARY TEST COMPANY NAME 9999',
      companyAddress: 'MODIFIED ALTERED ADDRESS 9999',
    };
    await axios.post(`${BASE_URL}/api/company-details`, alteredPayload, adminHeaders);

    // 4. Download previously issued invoice PDF
    const pdfAfterSettingsChange = await axios.post(
      `${BASE_URL}/invoice/download`,
      { Id: snapTestInvId },
      { headers: staffHeaders.headers, responseType: 'arraybuffer' }
    );
    const textAfter = extractPdfText(pdfAfterSettingsChange.data);

    // 5. Verify historical PDF strictly preserves original snapshot!
    assert(!textAfter.includes('MODIFIED TEMPORARY TEST COMPANY NAME 9999'), 'Issued PDF strictly rejected modified company name (Immutable snapshot preserved)');
    assert(textAfter.includes('Universal Movers'), 'Issued PDF preserved original company trading identity');
  } catch (err) {
    assert(false, `Snapshot immutability test error: ${err.message}`);
  } finally {
    // 6. Guaranteed restoration of approved company details
    if (originalCompany) {
      await axios.post(`${BASE_URL}/api/company-details`, originalCompany, adminHeaders);
      console.log('  ✓ Company details safely restored back to approved configuration');
    }
    if (snapTestInvId) {
      try {
        await axios.delete(`${BASE_URL}/invoice/deleteInvoice/${snapTestInvId}`, adminHeaders);
      } catch (e) {}
    }
  }

  // Clean up test non-labour invoice
  if (nonLabourInvId) {
    try {
      await axios.delete(`${BASE_URL}/invoice/deleteInvoice/${nonLabourInvId}`, adminHeaders);
      console.log('  ✓ Test non-labour invoice cleaned up cleanly');
    } catch (cleanErr) {
      console.warn('Cleanup warning:', cleanErr.message);
    }
  }

  // --- Test 4: Mixed Tax Breakdown (21%, 9%, 0% Reverse Charge) Statutory Btw-Specificatie ---
  console.log('\n--- Test 4: Mixed Tax Breakdown Statutory Btw-Specificatie ---');
  let mixedInvId = null;
  try {
    const mixedPayload = {
      customer: customerId,
      financialTemplate: templateId,
      date: new Date().toISOString(),
      vat: 'exclusive',
      discount: 10,
      discount_description: '10% Commercial Discount',
      items: [
        {
          description: 'Standard Moving Service 21%',
          quantity: 1,
          price: 1000.00,
          btw: '21',
        },
        {
          description: 'Food & Refreshment Service 9%',
          quantity: 1,
          price: 100.00,
          btw: '9',
        },
        {
          description: 'EU Cross-Border Transport 0% Reverse Charge',
          quantity: 1,
          price: 500.00,
          btw: '0',
        }
      ],
      idempotencyKey: `test_mixed_${Date.now()}`,
    };

    const res = await axios.post(`${BASE_URL}/invoice/new_invoice`, mixedPayload, staffHeaders);
    assert(res.status === 201, 'Mixed tax invoice created (HTTP 201)');
    mixedInvId = res.data._id;

    // Subtotal: 1000 + 100 + 500 = 1600
    // 10% Discount = 160. Discounted Net = 1440
    // 21% portion: 1000 * 0.9 = 900 net -> VAT 189.00
    // 9% portion: 100 * 0.9 = 90 net -> VAT 8.10
    // 0% portion: 500 * 0.9 = 450 net -> VAT 0.00
    // Total VAT: 189 + 8.10 = 197.10
    // Total: 1440 + 197.10 = 1637.10
    assert(Number(res.data.subTotal) === 1600, `Subtotal strictly €1600.00 (got ${res.data.subTotal})`);
    assert(Number(res.data.discountedPrice) === 160, `Discount amount strictly €160.00 (got ${res.data.discountedPrice})`);
    assert(Number(res.data.btw) === 197.10, `VAT strictly €197.10 (got ${res.data.btw})`);
    assert(Number(res.data.total) === 1637.10, `Grand total strictly €1637.10 (got ${res.data.total})`);

    const pdfRes = await axios.post(
      `${BASE_URL}/invoice/download`,
      { Id: mixedInvId },
      { headers: staffHeaders.headers, responseType: 'arraybuffer' }
    );
    assert(pdfRes.status === 200, 'Mixed tax invoice PDF downloaded successfully');

    const pdfText = extractPdfText(pdfRes.data);
    assert(pdfText.includes('21%'), 'PDF contains 21% tax bracket in specification');
    assert(pdfText.includes('9%'), 'PDF contains 9% tax bracket in specification');
    assert(pdfText.includes('0%') || pdfText.includes('Btw verlegd'), 'PDF contains 0% tax bracket in specification');

    await axios.delete(`${BASE_URL}/invoice/deleteInvoice/${mixedInvId}`, adminHeaders);
    console.log('  ✓ Test mixed invoice cleaned up cleanly');
  } catch (err) {
    assert(false, `Mixed tax test error: ${err.message}`);
  }

  // --- Test 5: Baseline Non-Regression Guarantee (Invoice #2026/0025) ---
  console.log('\n--- Test 5: Baseline Non-Regression Guarantee (Invoice #2026/0025) ---');
  try {
    const baselineId = '6ad202dcb67074d4c4540f79';
    const res = await axios.get(`${BASE_URL}/invoice/invoice/${baselineId}`, staffHeaders);
    const inv = res.data?.invoice;
    assert(!!inv, 'Baseline invoice #2026/0025 successfully retrieved');
    assert(Math.abs(Number(inv.total) - 746.39) < 0.01, `Baseline total strictly preserved at €746.39 (got ${inv.total})`);
    assert(Math.abs(Number(inv.btw) - 129.54) < 0.01, `Baseline VAT strictly preserved at €129.54 (got ${inv.btw})`);

    const dlRes = await axios.post(
      `${BASE_URL}/invoice/download`,
      { Id: baselineId },
      { headers: staffHeaders.headers, responseType: 'arraybuffer' }
    );
    assert(dlRes.status === 200, 'Baseline PDF download returns HTTP 200 OK');
    assert(dlRes.headers['content-type'] === 'application/pdf', 'Baseline PDF content-type is application/pdf');
    assert(dlRes.data.length > 50000, `Baseline PDF valid size (${dlRes.data.length} bytes)`);
  } catch (err) {
    assert(false, `Baseline non-regression error: ${err.message}`);
  }

  console.log('\n================================================================');
  console.log(`EXEC-23 Verification Complete: ${testsPassed} passed, ${testsFailed} failed.`);
  console.log('================================================================');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
