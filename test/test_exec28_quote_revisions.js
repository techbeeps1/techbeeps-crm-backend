const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');
const Finance = require('../models/finance');
const JobSchedule = require('../models/jobSchedule');
const Customer = require('../models/customer');
const Invoice = require('../models/invoice');

const BASE_URL = 'http://localhost:8080';
let adminToken = '';
let staffToken = '';
let testCustomer = null;
let testJob = null;
const createdFinanceIds = [];

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    passCount++;
    console.log(`  ✅ [PASS] ${message}`);
  } else {
    failCount++;
    console.error(`  ❌ [FAIL] ${message}`);
  }
}

async function cleanupOldTests() {
  try {
    await Finance.deleteMany({
      $or: [
        { index: { $regex: /^TEST-QUO-/ } },
        { 'customerIdentity.email': 'revision.test@universalmovers.nl' }
      ]
    });
  } catch (err) {
    console.warn('Warning cleaning old test records:', err.message);
  }
}

async function setupFixtures() {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGO_URI, {
      retryWrites: true,
      serverSelectionTimeoutMS: 15000,
    });
  }

  await cleanupOldTests();

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

  testCustomer = await Customer.findOne({ email: 'revision.test@universalmovers.nl' });
  if (!testCustomer) {
    testCustomer = await Customer.create({
      firstName: 'Klaas',
      lastName: 'Vermeulen',
      email: 'revision.test@universalmovers.nl',
      telephone: '0687654321',
    });
  }

  testJob = await JobSchedule.create({
    customer: testCustomer._id,
    status: 'Pending',
    date: new Date(),
    priceAgree: 950,
  });
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🚀 EXEC-28: CONTROLLED QUOTE REVISIONS & TRANSITIONS');
  console.log('======================================================\n');

  try {
    await setupFixtures();

    // ------------------------------------------------------------------------
    // TEST 1: Block Direct Creation in Accepted Status (HTTP 422)
    // ------------------------------------------------------------------------
    console.log('--- TEST 1: Direct Creation in Accepted Status Blocked ---');
    try {
      await axios.post(
        `${BASE_URL}/finance/add`,
        {
          customer: testCustomer._id,
          Status: 'Accepted',
          vat: 'exclusive',
          items: [{ description: 'Moving Service', quantity: 1, price: 500, btw: '21' }],
        },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      assert(false, 'Expected POST /finance/add with Status: Accepted to be rejected');
    } catch (err) {
      assert(err.response?.status === 422, `Direct creation with Accepted status blocked (HTTP ${err.response?.status})`);
      assert(
        err.response?.data?.error === 'DIRECT_ACCEPTED_CREATION_BLOCKED',
        `Correct error code returned: ${err.response?.data?.error}`
      );
    }

    // ------------------------------------------------------------------------
    // TEST 2: Valid Creation of Draft Quote v1
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 2: Valid Creation of Draft Quote v1 ---');
    const createRes = await axios.post(
      `${BASE_URL}/finance/add`,
      {
        customer: testCustomer._id,
        job: testJob._id,
        Status: 'Draft',
        vat: 'exclusive',
        items: [
          { description: 'Moving Truck & Driver', quantity: 4, price: 85, btw: '21' },
          { description: 'Moving Boxes', quantity: 20, price: 2.5, btw: '21' },
        ],
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    assert(createRes.status === 200, `Draft quote created successfully (HTTP ${createRes.status})`);
    const quoteV1 = createRes.data;
    createdFinanceIds.push(quoteV1._id);

    assert(quoteV1.version === 1, `Initial quote version is 1 (version: ${quoteV1.version})`);
    assert(quoteV1.isSuperseded === false, `Initial isSuperseded is false`);
    assert(!quoteV1.parentQuote, `Initial parentQuote is null/empty`);
    assert(quoteV1.total > 0, `Quote total correctly calculated (€${quoteV1.total})`);

    // ------------------------------------------------------------------------
    // TEST 3: Issue Quote (Transition to Sent) and Accept Quote
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 3: Issue and Accept Quotation v1 ---');
    await Finance.findByIdAndUpdate(quoteV1._id, { Status: 'Sent' });

    const acceptRes = await axios.post(
      `${BASE_URL}/finance/accept/${quoteV1._id}`,
      {
        name: 'Klaas Vermeulen',
        email: 'revision.test@universalmovers.nl',
        comments: 'Agreed on terms',
        customerSignature: 'SIGNATURE_DATA_KLAAS',
        method: 'PUBLIC_LINK',
      }
    );

    assert(acceptRes.status === 200, `Quote acceptance returns 200 OK`);
    assert(acceptRes.data?.quote?.Status === 'Accepted', `Quote status transitioned to Accepted`);
    assert(acceptRes.data?.quote?.acceptance?.isAccepted === true, `Acceptance flag marked true`);
    assert(
      !!acceptRes.data?.quote?.acceptance?.immutableAgreementSnapshot,
      `Immutable agreement snapshot frozen on v1`
    );

    // ------------------------------------------------------------------------
    // TEST 4: Direct Mutation of Accepted Quote Blocked (HTTP 422)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 4: Mutation of Accepted Quote Blocked ---');
    try {
      await axios.post(
        `${BASE_URL}/finance/update/${quoteV1._id}`,
        {
          items: [{ description: 'Tampered Item', quantity: 10, price: 999, btw: '21' }],
        },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      assert(false, 'Expected update on accepted quote to be rejected');
    } catch (err) {
      assert(err.response?.status === 422, `Update on accepted quote blocked (HTTP ${err.response?.status})`);
      assert(
        err.response?.data?.error === 'MUTATION_OF_ACCEPTED_QUOTE_BLOCKED',
        `Correct error code: ${err.response?.data?.error}`
      );
    }

    // Verify DB state was NOT mutated
    const dbQuoteV1 = await Finance.findById(quoteV1._id);
    assert(
      dbQuoteV1.total === quoteV1.total,
      `Database quote total remains untampered at €${dbQuoteV1.total}`
    );

    // ------------------------------------------------------------------------
    // TEST 5: Create Controlled Revision v2 (POST /finance/revise/:id)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 5: Controlled Quotation Revision to v2 ---');
    const reviseRes = await axios.post(
      `${BASE_URL}/finance/revise/${quoteV1._id}`,
      {},
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    assert(reviseRes.status === 201, `Revision creation returns 201 Created`);
    const quoteV2 = reviseRes.data.newQuote;
    createdFinanceIds.push(quoteV2._id);

    assert(quoteV2.version === 2, `Revision version incremented to 2 (version: ${quoteV2.version})`);
    assert(String(quoteV2.parentQuote) === String(quoteV1._id), `Revision parentQuote links to v1 (${quoteV2.parentQuote})`);
    assert(String(quoteV2.rootQuote) === String(quoteV1._id), `Revision rootQuote links to v1 (${quoteV2.rootQuote})`);
    assert(quoteV2.Status === 'Draft', `New revision starts in Draft status (Status: ${quoteV2.Status})`);
    assert(quoteV2.isSuperseded === false, `New revision isSuperseded is false`);
    assert(quoteV2.acceptance?.isAccepted === false, `New revision acceptance state is clean / reset`);
    assert(quoteV2.capabilityToken !== quoteV1.capabilityToken, `Fresh capability token generated for v2`);

    // Verify predecessor quote v1 is now superseded
    const updatedV1 = await Finance.findById(quoteV1._id);
    assert(updatedV1.isSuperseded === true, `Predecessor v1 isSuperseded marked true`);
    assert(
      String(updatedV1.supersededBy) === String(quoteV2._id),
      `Predecessor v1 supersededBy links to v2 (${updatedV1.supersededBy})`
    );
    assert(
      updatedV1.acceptance.isAccepted === true,
      `Predecessor v1 original acceptance record is preserved intact`
    );

    // ------------------------------------------------------------------------
    // TEST 6: Modification of Superseded Quote v1 Blocked (HTTP 409)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 6: Modification of Superseded Quote Blocked ---');
    try {
      await axios.post(
        `${BASE_URL}/finance/update/${quoteV1._id}`,
        { Status: 'Draft' },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      assert(false, 'Expected mutation of superseded quote to fail');
    } catch (err) {
      assert(
        err.response?.status === 422 || err.response?.status === 409,
        `Update on superseded/accepted quote blocked (HTTP ${err.response?.status})`
      );
    }

    // ------------------------------------------------------------------------
    // TEST 7: Attempting to Revise an Already-Superseded Quote Blocked (HTTP 409)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 7: Double Revision on Superseded Quote Blocked ---');
    try {
      await axios.post(
        `${BASE_URL}/finance/revise/${quoteV1._id}`,
        {},
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      assert(false, 'Expected revision of superseded quote to be rejected');
    } catch (err) {
      assert(err.response?.status === 409, `Revision of superseded quote rejected (HTTP ${err.response?.status})`);
      assert(
        err.response?.data?.error === 'QUOTE_ALREADY_SUPERSEDED',
        `Correct error code: ${err.response?.data?.error}`
      );
    }

    // ------------------------------------------------------------------------
    // TEST 8: Revision v2 can be modified in Draft and Revised to v3
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 8: Revise v2 to v3 Lineage Verification ---');
    // Admin modifies v2 line items (allowed because v2 is Draft)
    const updateV2Res = await axios.post(
      `${BASE_URL}/finance/update/${quoteV2._id}`,
      {
        items: [
          { description: 'Moving Truck & Driver', quantity: 6, price: 85, btw: '21' },
          { description: 'Moving Boxes', quantity: 30, price: 2.5, btw: '21' },
        ],
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert(updateV2Res.status === 200, `Draft revision v2 successfully updated with amendments`);

    // Now revise v2 to v3
    const reviseV3Res = await axios.post(
      `${BASE_URL}/finance/revise/${quoteV2._id}`,
      {},
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert(reviseV3Res.status === 201, `Revision v3 created successfully (HTTP 201)`);
    const quoteV3 = reviseV3Res.data.newQuote;
    createdFinanceIds.push(quoteV3._id);

    assert(quoteV3.version === 3, `Revision v3 version is 3 (version: ${quoteV3.version})`);
    assert(String(quoteV3.parentQuote) === String(quoteV2._id), `v3 parentQuote links to v2 (${quoteV3.parentQuote})`);
    assert(String(quoteV3.rootQuote) === String(quoteV1._id), `v3 rootQuote preserves root lineage to v1 (${quoteV3.rootQuote})`);

    const updatedV2 = await Finance.findById(quoteV2._id);
    assert(updatedV2.isSuperseded === true, `v2 marked superseded`);
    assert(String(updatedV2.supersededBy) === String(quoteV3._id), `v2 supersededBy points to v3`);

    // ------------------------------------------------------------------------
    // TEST 9: Quotation Rejection Endpoint (POST /finance/reject/:id)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 9: Rejection Workflow ---');
    const rejectQuoteDoc = await Finance.create({
      customer: testCustomer._id,
      Status: 'Sent',
      vat: 'exclusive',
      items: [{ description: 'Storage Service', quantity: 1, price: 200, btw: '21' }],
    });
    createdFinanceIds.push(rejectQuoteDoc._id);

    const rejectRes = await axios.post(`${BASE_URL}/finance/reject/${rejectQuoteDoc._id}`, {
      reason: 'Customer found alternative service provider',
    });
    assert(rejectRes.status === 200, `Rejection endpoint returns 200 OK`);

    const dbRejectedQuote = await Finance.findById(rejectQuoteDoc._id);
    assert(dbRejectedQuote.Status === 'Rejected', `Status transitioned to Rejected`);
    assert(!!dbRejectedQuote.rejectedAt, `rejectedAt timestamp recorded`);
    assert(
      dbRejectedQuote.rejectionReason === 'Customer found alternative service provider',
      `rejectionReason recorded: ${dbRejectedQuote.rejectionReason}`
    );

    // Attempt to accept rejected quote must be blocked
    try {
      await axios.post(`${BASE_URL}/finance/accept/${rejectQuoteDoc._id}`, {
        name: 'Klaas Vermeulen',
        email: 'revision.test@universalmovers.nl',
      });
      assert(false, 'Expected acceptance of rejected quote to fail');
    } catch (err) {
      assert(err.response?.status === 409, `Acceptance of rejected quote blocked (HTTP ${err.response?.status})`);
      assert(
        err.response?.data?.error === 'QUOTE_REVOKED',
        `Correct error code: ${err.response?.data?.error}`
      );
    }

    // ------------------------------------------------------------------------
    // TEST 10: Quotation Revocation by Staff (POST /finance/revoke/:id)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 10: Staff Revocation Workflow ---');
    const revokeQuoteDoc = await Finance.create({
      customer: testCustomer._id,
      Status: 'Sent',
      vat: 'exclusive',
      items: [{ description: 'Special Transport', quantity: 1, price: 350, btw: '21' }],
    });
    createdFinanceIds.push(revokeQuoteDoc._id);

    const revokeRes = await axios.post(
      `${BASE_URL}/finance/revoke/${revokeQuoteDoc._id}`,
      { reason: 'Customer cancelled move date' },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    );
    assert(revokeRes.status === 200, `Revocation endpoint returns 200 OK`);

    const dbRevokedQuote = await Finance.findById(revokeQuoteDoc._id);
    assert(dbRevokedQuote.Status === 'Revoked', `Status transitioned to Revoked`);
    assert(!!dbRevokedQuote.revokedAt, `revokedAt timestamp recorded`);

    // ------------------------------------------------------------------------
    // TEST 11: Baseline Invoice Preservation Invariant (#2026/0025 = €746.39)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 11: Baseline Invoice Invariant Preservation ---');
    const baseline = await Invoice.findOne({ index: '2026/0025' });
    assert(!!baseline, 'Baseline invoice #2026/0025 exists in database');
    assert(baseline?.total === 746.39, `Baseline invoice total strictly preserved at €746.39 (Current: €${baseline?.total})`);

    try {
      const pdfRes = await axios.post(
        `${BASE_URL}/invoice/download`,
        { Id: baseline?._id },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
          responseType: 'arraybuffer',
        }
      );
      assert(pdfRes.status === 200, `Baseline invoice PDF download returns HTTP 200`);
      assert(pdfRes.data?.byteLength > 50000, `Baseline invoice PDF size is healthy (${pdfRes.data?.byteLength} bytes)`);
    } catch (err) {
      assert(false, `Baseline invoice PDF download failed: ${err.message}`);
    }

  } catch (error) {
    console.error('Fatal error during test run:', error);
  } finally {
    console.log('\nCleaning up test artifacts...');
    try {
      if (createdFinanceIds.length > 0) {
        await Finance.deleteMany({ _id: { $in: createdFinanceIds } });
      }
      if (testJob?._id) {
        await JobSchedule.findByIdAndDelete(testJob._id);
      }
    } catch (cleanupErr) {
      console.warn('Cleanup error:', cleanupErr.message);
    }
    await mongoose.disconnect();

    console.log('\n======================================================');
    console.log(`SUMMARY: ${passCount} passed, ${failCount} failed out of ${passCount + failCount} checks`);
    console.log('======================================================');

    if (failCount === 0) {
      console.log('\n🎉 ALL EXEC-28 QUOTE REVISION & TRANSITION TESTS PASSED PERFECTLY!\n');
      process.exit(0);
    } else {
      console.error(`\n❌ ${failCount} TEST(S) FAILED.\n`);
      process.exit(1);
    }
  }
}

runTests();
