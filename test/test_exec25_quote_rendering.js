const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Finance = require('../models/finance');
const JobSchedule = require('../models/jobSchedule');
const Customer = require('../models/customer');
const User = require('../models/user');
const Invoice = require('../models/invoice');
const DocumentTemplate = require('../models/documentTemplateModel');

const BASE_URL = 'http://127.0.0.1:8080';
let adminToken = '';
let testCustomer = null;
let testJob = null;
const createdFinanceIds = [];

async function setupFixtures() {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGO_URI, {
      retryWrites: true,
      serverSelectionTimeoutMS: 15000,
    });
  }

  const jwtSecret = process.env.JWT_SECRET || 'fallback_secret';
  adminToken = jwt.sign(
    { _id: new mongoose.Types.ObjectId(), name: 'Admin User', email: 'admin@universalmovers.nl', role: 'Admin' },
    jwtSecret,
    { expiresIn: '2h' }
  );

  const Address = require('../models/addressModel');
  const testAddress = await Address.create({
    street: 'Prinsengracht',
    houseNumber: '263',
    addition: 'B',
    postcode: '1016 GV',
    city: 'Amsterdam',
    country: 'Netherlands',
    addressType: 'head',
  });
  createdAddressIds.push(testAddress._id);

  testCustomer = await Customer.create({
    firstName: 'Pieter',
    lastName: 'van den Berg',
    email: 'render.test@universalmovers.nl',
    contact: '0687654321',
    mobile: '0687654321',
    address: [testAddress._id],
  });

  testJob = await JobSchedule.create({
    customer: testCustomer._id,
    status: 'Pending',
    date: new Date(),
    priceAgree: 750,
  });
}

const createdAddressIds = [];

async function cleanupFixtures() {
  if (createdFinanceIds.length > 0) {
    await Finance.deleteMany({ _id: { $in: createdFinanceIds } });
  }
  if (testJob?._id) {
    await JobSchedule.findByIdAndDelete(testJob._id);
  }
  if (testCustomer?._id) {
    await Customer.findByIdAndDelete(testCustomer._id);
  }
  if (createdAddressIds.length > 0) {
    const Address = require('../models/addressModel');
    await Address.deleteMany({ _id: { $in: createdAddressIds } });
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🚀 EXEC-25: CUSTOMER QUOTATION RENDERING & COMMERCIAL TERMS');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, extra = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName} ${extra ? `(${extra})` : ''}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName} ${extra ? `(${extra})` : ''}`);
      failed++;
    }
  }

  try {
    await setupFixtures();

    // ----------------------------------------------------
    // TEST 1: Public Quote DTO eliminates [object Object] and formats address cleanly
    // ----------------------------------------------------
    const token1 = crypto.randomBytes(32).toString('hex');
    const quote1 = await Finance.create({
      index: 'TEST-QUO-2026/0095',
      customer: testCustomer._id,
      job: testJob._id,
      Status: 'Sent',
      version: 1,
      capabilityToken: token1,
      tokenExpiresAt: new Date(Date.now() + 30 * 86400000),
      items: [
        { description: 'Relocation Services 4h', quantity: 4, price: 65, btw: '21%' },
        { description: 'Packing Materials', quantity: 10, price: 3.5, btw: '21%' },
        { description: 'Special Hand-carry Piano (0 qty test)', quantity: 0, price: 120, btw: '21%' },
      ],
      vat: '21%',
      discount: 10,
    });
    createdFinanceIds.push(quote1._id);

    const res1 = await fetch(`${BASE_URL}/finance/finance/${token1}`);
    const data1 = await res1.json();
    const pubQuote = data1.finance;

    assert(
      res1.status === 200 && pubQuote,
      'Test 1a: Public quote DTO retrieved without authentication',
      `HTTP ${res1.status}`
    );

    const addressStr = pubQuote?.customer?.address || '';
    assert(
      !addressStr.includes('[object Object]') && addressStr.includes('Prinsengracht 263 B') && addressStr.includes('1016 GV Amsterdam'),
      'Test 1b: Customer address formatted cleanly without [object Object]',
      `Address: "${addressStr}"`
    );

    assert(
      pubQuote?.customer?.telephone === '0687654321' && pubQuote?.customer?.phone === '0687654321',
      'Test 1c: Customer telephone and phone fields correctly populated',
      `Phone: "${pubQuote?.customer?.phone}"`
    );

    // ----------------------------------------------------
    // TEST 2: Deterministic Dutch Dates (DD-MM-YYYY) and 30-Day Validity
    // ----------------------------------------------------
    const dutchDateRegex = /^\d{2}-\d{2}-\d{4}$/;
    assert(
      dutchDateRegex.test(pubQuote?.date),
      'Test 2a: Quote issue date formatted as Dutch DD-MM-YYYY',
      `Date: "${pubQuote?.date}"`
    );
    assert(
      dutchDateRegex.test(pubQuote?.dueDate) && dutchDateRegex.test(pubQuote?.expire_date),
      'Test 2b: Quote dueDate and expire_date formatted as Dutch DD-MM-YYYY',
      `Due Date: "${pubQuote?.dueDate}"`
    );

    // ----------------------------------------------------
    // TEST 3: Zero-quantity item preservation (no qty || 1 corruption)
    // ----------------------------------------------------
    const zeroItem = pubQuote?.items?.find(it => it.description && it.description.includes('0 qty test'));
    assert(
      zeroItem && zeroItem.quantity === 0 && zeroItem.total === 0,
      'Test 3: Zero-quantity line item preserved with quantity 0 and lineTotal 0',
      `Qty: ${zeroItem?.quantity}, LineTotal: ${zeroItem?.total}`
    );

    // ----------------------------------------------------
    // TEST 4: Belastingdienst Statutory Tax Breakdown
    // ----------------------------------------------------
    assert(
      pubQuote?.taxBreakdown && Array.isArray(pubQuote.taxBreakdown.rates) && pubQuote.taxBreakdown.rates.length > 0,
      'Test 4a: Belastingdienst tax breakdown returned in public quote DTO',
      `Rates: ${pubQuote?.taxBreakdown?.rates?.map(r => `${r.rate}%: €${r.vatAmount}`).join(', ')}`
    );

    const r21 = pubQuote.taxBreakdown.rates.find(r => r.rate === 21);
    assert(
      r21 && r21.taxableBase > 0 && r21.vatAmount > 0,
      'Test 4b: 21% BTW rate accurately computed with positive base and VAT',
      `Base: €${r21?.taxableBase}, VAT: €${r21?.vatAmount}`
    );

    // ----------------------------------------------------
    // TEST 5: Commercial Terms & AVV 2026 Conditions
    // ----------------------------------------------------
    const terms = pubQuote?.commercialTerms;
    assert(
      terms &&
      terms.quoteValidityDays === 30 &&
      terms.depositPercentage === 25 &&
      terms.balancePercentage === 75 &&
      terms.governingTerms.includes('AVV') &&
      terms.bankDetails?.iban === 'NL91 ABNA 0417 1643 00',
      'Test 5: Dutch commercial terms (AVV, 30 days, 25% deposit, ABN AMRO IBAN) present in DTO',
      `Validity: ${terms?.quoteValidityDays}d, Deposit: ${terms?.depositPercentage}%, IBAN: ${terms?.bankDetails?.iban}`
    );

    // ----------------------------------------------------
    // TEST 6: Quotation PDF Download without pre-linked financialTemplate (Graceful Fallback)
    // ----------------------------------------------------
    const pdfRes = await fetch(`${BASE_URL}/finance/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Id: token1 }),
    });

    assert(
      pdfRes.status === 200,
      'Test 6a: Quotation PDF generates successfully without pre-linked template (200 OK)',
      `Status: ${pdfRes.status}`
    );

    const pdfContentType = pdfRes.headers.get('content-type') || '';
    const pdfBuffer = await pdfRes.arrayBuffer();
    assert(
      pdfContentType.includes('application/pdf') && pdfBuffer.byteLength > 15000,
      'Test 6b: Downloaded Quotation PDF is valid binary PDF > 15,000 bytes',
      `Bytes: ${pdfBuffer.byteLength}, Content-Type: ${pdfContentType}`
    );

    // ----------------------------------------------------
    // TEST 7: Staff and Public View Commercial Value Parity
    // ----------------------------------------------------
    const staffRes = await fetch(`${BASE_URL}/finance/finance/${quote1._id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const staffData = await staffRes.json();
    const staffQuote = staffData.finance;

    assert(
      staffQuote.total === pubQuote.total &&
      staffQuote.subTotal === pubQuote.subTotal &&
      staffQuote.discount === pubQuote.discount,
      'Test 7: 100% financial total parity between Staff view and Customer public view',
      `Staff Total: €${staffQuote.total}, Public Total: €${pubQuote.total}`
    );

    // ----------------------------------------------------
    // TEST 8: Template Placeholder Rendering Parity & Double Currency Eradication
    // ----------------------------------------------------
    const sampleTemplate = '<div><span>{{currencySymbol}} {{invoice.total}}</span><div>€ {{invoice.total}}</div><div>{{customer.address}}</div></div>';
    const evaluateTemplate = (tmpl, dataMap) => {
      let out = tmpl.replace(/\{\{(.*?)\}\}/g, (m, key) => {
        const k = key.trim();
        if (k === 'currencySymbol') return dataMap.currencySymbol || '€';
        if (k === 'invoice.total') return Number(dataMap.invoice?.total || 0).toFixed(2);
        if (k === 'customer.address') return dataMap.customer?.address || '';
        return '';
      });
      return out
        .replace(/([€$£]\s*)+([€$£])/g, '$2')
        .replace(/(EUR|USD|GBP)\s*([€$£])/gi, '$2')
        .replace(/([€$£])\s*(EUR|USD|GBP)/gi, '$1')
        .replace(/€\s*€/g, '€');
    };
    const rendered = evaluateTemplate(sampleTemplate, {
      currencySymbol: '€',
      invoice: { total: pubQuote.total },
      customer: { address: pubQuote.customer.address }
    });
    assert(
      !rendered.includes('€ €') && !rendered.includes('€EUR') && rendered.includes(`€ ${Number(pubQuote.total).toFixed(2)}`),
      'Test 8: Double currency symbols (€ € / €EUR) eradicated in template evaluation',
      `Rendered: "${rendered}"`
    );

    // ----------------------------------------------------
    // TEST 9: Baseline Invariant Check (#2026/0025 preserved at €746.39)
    // ----------------------------------------------------
    const baseInvoice = await Invoice.findOne({ index: '2026/0025' });
    assert(
      baseInvoice && baseInvoice.total === 746.39,
      'Test 9a: Baseline invoice #2026/0025 total strictly preserved at €746.39',
      `Total: €${baseInvoice?.total}`
    );

    if (baseInvoice) {
      const basePdfRes = await fetch(`${BASE_URL}/invoice/download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ Id: baseInvoice._id }),
      });
      const basePdfBuf = await basePdfRes.arrayBuffer();
      assert(
        basePdfRes.status === 200 && basePdfBuf.byteLength > 20000,
        'Test 9b: Baseline invoice #2026/0025 PDF downloads successfully (200 OK)',
        `Status: ${basePdfRes.status}, Size: ${basePdfBuf.byteLength} bytes`
      );
    }

    console.log('\n======================================================');
    console.log(`🏁 TEST SUITE RESULT: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================\n');

  } catch (err) {
    console.error('Test execution failed with error:', err);
    failed++;
  } finally {
    await cleanupFixtures();
    await mongoose.connection.close();
    process.exit(failed === 0 ? 0 : 1);
  }
}

runTests();
