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

const BASE_URL = 'http://localhost:8080';
let adminToken = '';
let staffToken = '';
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

  // Create JWT tokens
  const jwtSecret = process.env.JWT_SECRET || 'fallback_secret';
  adminToken = jwt.sign(
    { _id: new mongoose.Types.ObjectId(), name: 'Admin User', email: 'admin@universalmovers.nl', role: 'Admin' },
    jwtSecret,
    { expiresIn: '2h' }
  );
  staffToken = jwt.sign(
    { _id: new mongoose.Types.ObjectId(), name: 'Staff Estimator', email: 'estimator@universalmovers.nl', role: 'Staff' },
    jwtSecret,
    { expiresIn: '2h' }
  );

  // Find or create test customer
  testCustomer = await Customer.findOne({ email: 'accept.test@universalmovers.nl' });
  if (!testCustomer) {
    testCustomer = await Customer.create({
      firstName: 'Jan',
      lastName: 'de Vries',
      email: 'accept.test@universalmovers.nl',
      telephone: '0612345678',
    });
  }

  // Create linked job in 'Pending' status
  testJob = await JobSchedule.create({
    customer: testCustomer._id,
    status: 'Pending',
    date: new Date(),
    priceAgree: 850,
  });
}

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
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🚀 EXEC-24: QUOTE ACCEPTANCE STATE MACHINE & SNAPSHOTS');
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
    // TEST 1: Public acceptance on Draft quote is strictly REJECTED (HTTP 422)
    // ----------------------------------------------------
    const draftToken = crypto.randomBytes(32).toString('hex');
    const draftQuote = await Finance.create({
      index: 'TEST-QUO-2026/0091',
      customer: testCustomer._id,
      job: testJob._id,
      Status: 'Draft',
      version: 1,
      capabilityToken: draftToken,
      items: [
        { description: 'Moving Labour 3h', quantity: 3, price: 50, btw: '21%' },
      ],
      vat: '21%',
      total: 181.5,
      subTotal: 150,
    });
    createdFinanceIds.push(draftQuote._id);

    const res1 = await fetch(`${BASE_URL}/finance/accept/${draftToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'PUBLIC_LINK', name: 'Jan de Vries' }),
    });
    const data1 = await res1.json();
    assert(
      res1.status === 422 && data1.error === 'DRAFT_ACCEPTANCE_BLOCKED',
      'Test 1: Public acceptance on Draft quote strictly rejected (HTTP 422)',
      `Status: ${res1.status}, Error: ${data1.error}`
    );

    // ----------------------------------------------------
    // TEST 2: Backdoor prevention via /finance/update/:id on Draft quote (HTTP 422)
    // ----------------------------------------------------
    const res2 = await fetch(`${BASE_URL}/finance/update/${draftToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Status: 'Accepted' }),
    });
    const data2 = await res2.json();
    assert(
      res2.status === 422 && data2.error === 'DRAFT_ACCEPTANCE_BLOCKED',
      'Test 2: Backdoor acceptance via /finance/update on Draft quote blocked (HTTP 422)',
      `Status: ${res2.status}, Error: ${data2.error}`
    );

    // Verify quote in DB is still Draft
    const checkDraft = await Finance.findById(draftQuote._id);
    assert(
      checkDraft.Status === 'Draft',
      'Test 2b: Database quote state remains Draft after blocked acceptance attempt'
    );

    // ----------------------------------------------------
    // TEST 3: Public acceptance on Revoked/Cancelled quote is strictly REJECTED (HTTP 409)
    // ----------------------------------------------------
    const revokedToken = crypto.randomBytes(32).toString('hex');
    const revokedQuote = await Finance.create({
      index: 'TEST-QUO-2026/0092',
      customer: testCustomer._id,
      Status: 'Revoked',
      version: 1,
      capabilityToken: revokedToken,
      items: [{ description: 'Relocation Service', quantity: 1, price: 500 }],
      total: 500,
    });
    createdFinanceIds.push(revokedQuote._id);

    const res3 = await fetch(`${BASE_URL}/finance/accept/${revokedToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'PUBLIC_LINK' }),
    });
    const data3 = await res3.json();
    assert(
      res3.status === 409 && data3.error === 'QUOTE_REVOKED',
      'Test 3: Public acceptance on Revoked quote strictly rejected (HTTP 409)',
      `Status: ${res3.status}, Error: ${data3.error}`
    );

    // ----------------------------------------------------
    // TEST 4: Public acceptance on Expired quote is strictly REJECTED (HTTP 410)
    // ----------------------------------------------------
    const expiredToken = crypto.randomBytes(32).toString('hex');
    const expiredQuote = await Finance.create({
      index: 'TEST-QUO-2026/0093',
      customer: testCustomer._id,
      Status: 'Sent',
      version: 1,
      capabilityToken: expiredToken,
      tokenExpiresAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 2 days ago
      items: [{ description: 'Relocation Service', quantity: 1, price: 600 }],
      total: 600,
    });
    createdFinanceIds.push(expiredQuote._id);

    const res4 = await fetch(`${BASE_URL}/finance/accept/${expiredToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'PUBLIC_LINK' }),
    });
    const data4 = await res4.json();
    assert(
      res4.status === 410 && data4.error === 'QUOTE_EXPIRED',
      'Test 4: Public acceptance on Expired quote strictly rejected (HTTP 410)',
      `Status: ${res4.status}, Error: ${data4.error}`
    );

    // ----------------------------------------------------
    // TEST 5: Public acceptance on Superseded quote is strictly REJECTED (HTTP 409)
    // ----------------------------------------------------
    const supersededToken = crypto.randomBytes(32).toString('hex');
    const supersededQuote = await Finance.create({
      index: 'TEST-QUO-2026/0094',
      customer: testCustomer._id,
      Status: 'Sent',
      version: 1,
      isSuperseded: true,
      capabilityToken: supersededToken,
      items: [{ description: 'Relocation Service v1', quantity: 1, price: 700 }],
      total: 700,
    });
    createdFinanceIds.push(supersededQuote._id);

    const res5 = await fetch(`${BASE_URL}/finance/accept/${supersededToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'PUBLIC_LINK' }),
    });
    const data5 = await res5.json();
    assert(
      res5.status === 409 && data5.error === 'QUOTE_SUPERSEDED',
      'Test 5: Public acceptance on Superseded quote strictly rejected (HTTP 409)',
      `Status: ${res5.status}, Error: ${data5.error}`
    );

    // ----------------------------------------------------
    // TEST 6: Public acceptance with version mismatch is strictly REJECTED (HTTP 409)
    // ----------------------------------------------------
    const mismatchToken = crypto.randomBytes(32).toString('hex');
    const mismatchQuote = await Finance.create({
      index: 'TEST-QUO-2026/0095',
      customer: testCustomer._id,
      Status: 'Sent',
      version: 2,
      capabilityToken: mismatchToken,
      items: [{ description: 'Relocation Service v2', quantity: 1, price: 800 }],
      total: 800,
    });
    createdFinanceIds.push(mismatchQuote._id);

    const res6 = await fetch(`${BASE_URL}/finance/accept/${mismatchToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'PUBLIC_LINK', version: 1 }), // Client expected version 1
    });
    const data6 = await res6.json();
    assert(
      res6.status === 409 && data6.error === 'VERSION_MISMATCH',
      'Test 6: Version mismatch request strictly rejected (HTTP 409)',
      `Status: ${res6.status}, Error: ${data6.error}`
    );

    // ----------------------------------------------------
    // TEST 7: Valid public acceptance on Sent quote succeeds (HTTP 200) with snapshot & ack
    // ----------------------------------------------------
    const eligibleToken = crypto.randomBytes(32).toString('hex');
    const eligibleQuote = await Finance.create({
      index: 'TEST-QUO-2026/0096',
      customer: testCustomer._id,
      job: testJob._id,
      Status: 'Sent',
      version: 1,
      capabilityToken: eligibleToken,
      tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      items: [
        { description: 'Relocation Service 10m3', quantity: 1, price: 500, btw: '21%' },
        { description: 'Moving Boxes (Pack of 10)', quantity: 2, price: 25, btw: '21%' },
      ],
      vat: '21%',
      discount: 10,
    });
    createdFinanceIds.push(eligibleQuote._id);

    const res7 = await fetch(`${BASE_URL}/finance/accept/${eligibleToken}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 Test Suite Runner',
      },
      body: JSON.stringify({
        method: 'PUBLIC_LINK',
        name: 'Jan de Vries',
        email: 'jan@example.nl',
        comments: 'Ready for move on Friday',
        version: 1,
      }),
    });
    const data7 = await res7.json();

    assert(
      res7.status === 200 && data7.success === true,
      'Test 7a: Valid public acceptance on Sent quote returns 200 OK',
      `Status: ${res7.status}`
    );
    assert(
      data7.acknowledgementEventId && data7.acknowledgementEventId.startsWith('ACK-QUO-'),
      'Test 7b: Dedicated unique acknowledgement event ID generated',
      `EventId: ${data7.acknowledgementEventId}`
    );
    assert(
      data7.immutableAgreementSnapshot &&
      data7.immutableAgreementSnapshot.total > 0 &&
      data7.immutableAgreementSnapshot.companySnapshot?.legalName === 'Universal Movers B.V.',
      'Test 7c: Immutable agreement snapshot frozen with approved Belastingdienst details',
      `Snapshot total: €${data7.immutableAgreementSnapshot?.total}`
    );

    // Verify quote in DB
    const acceptedInDb = await Finance.findById(eligibleQuote._id);
    assert(
      acceptedInDb.Status === 'Accepted' &&
      acceptedInDb.acceptance?.isAccepted === true &&
      acceptedInDb.acceptance?.customerIdentity?.name === 'Jan de Vries' &&
      acceptedInDb.acceptance?.customerIdentity?.userAgent === 'Mozilla/5.0 Test Suite Runner',
      'Test 7d: Database record contains acceptance state, customer identity and user agent'
    );

    // ----------------------------------------------------
    // TEST 8: Server-side Idempotency (Repeat acceptance call returns 200 with identical ack)
    // ----------------------------------------------------
    const res8 = await fetch(`${BASE_URL}/finance/accept/${eligibleToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'PUBLIC_LINK',
        name: 'Jan de Vries',
        comments: 'Duplicate click',
      }),
    });
    const data8 = await res8.json();
    assert(
      res8.status === 200 &&
      data8.idempotent === true &&
      data8.acknowledgementEventId === data7.acknowledgementEventId,
      'Test 8: Server-side idempotency returns 200 OK with identical acknowledgement ID and no duplicate state',
      `Original: ${data7.acknowledgementEventId}, Returned: ${data8.acknowledgementEventId}`
    );

    // ----------------------------------------------------
    // TEST 9: On-site staff issue-and-sign workflow freezes Draft version with staff actor
    // ----------------------------------------------------
    const onSiteDraftToken = crypto.randomBytes(32).toString('hex');
    const onSiteDraft = await Finance.create({
      index: 'TEST-QUO-2026/0097',
      customer: testCustomer._id,
      Status: 'Draft',
      version: 1,
      capabilityToken: onSiteDraftToken,
      items: [
        { description: 'On-site Survey & Pack', quantity: 1, price: 400, btw: '21%' },
      ],
      vat: '21%',
    });
    createdFinanceIds.push(onSiteDraft._id);

    const res9 = await fetch(`${BASE_URL}/finance/on-site-accept/${onSiteDraft._id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${staffToken}`,
      },
      body: JSON.stringify({
        name: 'Jan de Vries',
        comments: 'Signed on iPad with estimator',
        customerSignature: 'BASE64_ON_SITE_SIGNATURE_DATA',
      }),
    });
    const data9 = await res9.json();

    assert(
      res9.status === 200 && data9.success === true,
      'Test 9a: On-site staff acceptance succeeds on Draft quote (HTTP 200)',
      `Status: ${res9.status}`
    );

    const onSiteSaved = await Finance.findById(onSiteDraft._id);
    assert(
      onSiteSaved.Status === 'Accepted' &&
      onSiteSaved.acceptance?.method === 'ON_SITE_SIGNATURE' &&
      onSiteSaved.acceptance?.staffActor?.name === 'Staff Estimator' &&
      onSiteSaved.acceptance?.staffActor?.role === 'Staff',
      'Test 9b: Staff provenance recorded in acceptance metadata',
      `Staff: ${onSiteSaved.acceptance?.staffActor?.name} (${onSiteSaved.acceptance?.staffActor?.role})`
    );
    assert(
      onSiteSaved.acceptance?.signature?.data === 'BASE64_ON_SITE_SIGNATURE_DATA',
      'Test 9c: Customer signature data preserved in agreement record'
    );

    // ----------------------------------------------------
    // TEST 10: Downstream Job transition from Pending to Processing
    // ----------------------------------------------------
    const updatedJob = await JobSchedule.findById(testJob._id);
    assert(
      updatedJob && updatedJob.status === 'Processing',
      'Test 10: Linked JobSchedule successfully transitioned from Pending to Processing on quote acceptance',
      `Job status: ${updatedJob?.status}`
    );

    // ----------------------------------------------------
    // TEST 11: Baseline Invariant Invoice #2026/0025 preserved at €746.39
    // ----------------------------------------------------
    const baseline = await Invoice.findOne({ index: { $regex: /2026\/0025/ } });
    const baselineTotal = baseline ? baseline.total : null;
    assert(
      baselineTotal === 746.39,
      'Test 11a: Baseline Invoice #2026/0025 strictly preserved at €746.39',
      `Total: €${baselineTotal}`
    );

    const resPdf = await fetch(`${BASE_URL}/invoice/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ Id: baseline ? baseline._id.toString() : '6ad202dcb67074d4c4540f79' }),
    });
    const pdfBuffer = await resPdf.arrayBuffer();
    assert(
      resPdf.status === 200 && pdfBuffer.byteLength > 10000,
      'Test 11b: Baseline Invoice PDF download returns 200 OK with valid PDF bytes',
      `PDF size: ${pdfBuffer.byteLength} bytes`
    );

    // ----------------------------------------------------
    // TEST SUMMARY
    // ----------------------------------------------------
    console.log('\n======================================================');
    console.log(`SUMMARY: ${passed} passed, ${failed} failed out of ${passed + failed} checks`);
    console.log('======================================================\n');

    if (failed === 0) {
      console.log('🎉 ALL EXEC-24 QUOTE ACCEPTANCE TESTS PASSED PERFECTLY!\n');
    } else {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Fatal error during test execution:', err);
    process.exitCode = 1;
  } finally {
    await cleanupFixtures();
    await mongoose.disconnect();
  }
}

runTests();
