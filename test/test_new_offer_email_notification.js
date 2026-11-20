const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const mongoose = require('mongoose');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const Finance = require('../models/finance');
const Customer = require('../models/customer');
const User = require('../models/user');
const Email = require('../models/Email/email');
const { getStagingMailSink, clearStagingMailSink } = require('../utils/emailOutboxService');

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:8080';
let adminToken = '';
let testCustomer = null;
let testAdminUser = null;
const createdFinanceIds = [];
const createdCustomerIds = [];

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passCount++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    failCount++;
  }
}

async function setupFixtures() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 15000,
    });
  }

  // Create or find active Admin User
  testAdminUser = await User.findOne({ email: 'admin.offeremail@universalmovers.nl' });
  if (!testAdminUser) {
    testAdminUser = await User.create({
      name: 'Admin Offer Tester',
      email: 'admin.offeremail@universalmovers.nl',
      role: 'Admin',
      isActive: true,
      password: 'TestPassword123!',
    });
  }

  const jwtSecret = process.env.JWT_SECRET || 'fallback_secret';
  adminToken = jwt.sign(
    { _id: testAdminUser._id, id: testAdminUser._id, name: testAdminUser.name, email: testAdminUser.email, role: 'Admin' },
    jwtSecret,
    { expiresIn: '2h' }
  );

  // Create test customer
  const custEmail = `offer.client.${Date.now()}@universalmovers.nl`;
  testCustomer = await Customer.create({
    firstName: 'Jan',
    lastName: 'de Vries',
    email: custEmail,
    telephone: '0612345678',
  });
  createdCustomerIds.push(testCustomer._id);
}

async function cleanupFixtures() {
  if (createdFinanceIds.length > 0) {
    await Finance.deleteMany({ _id: { $in: createdFinanceIds } });
  }
  if (createdCustomerIds.length > 0) {
    await Customer.deleteMany({ _id: { $in: createdCustomerIds } });
  }
  if (testAdminUser) {
    await User.deleteOne({ _id: testAdminUser._id });
  }
  await mongoose.disconnect();
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🚀 TEST: NEW OFFER SUBMISSION EMAIL NOTIFICATION DISPATCH');
  console.log('======================================================\n');

  try {
    await setupFixtures();
    clearStagingMailSink();

    const authHeaders = {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-test-bypass': 'true',
      },
    };

    // -------------------------------------------------------------------------
    // TEST 1: Submit New Offer via POST /finance/add with sendEmail: true
    // -------------------------------------------------------------------------
    console.log('--- TEST 1: POST /finance/add with sendEmail: true ---');
    const offerPayload1 = {
      customer: testCustomer._id,
      Status: 'Sent',
      sendEmail: true,
      vat: 'exclusive',
      items: [
        { description: 'Full Packing & Relocation Service', quantity: 1, price: 650, btw: '21' },
        { description: 'Heavy Duty Moving Boxes', quantity: 15, price: 3, btw: '21' },
      ],
    };

    const res1 = await axios.post(`${BASE_URL}/finance/add`, offerPayload1, authHeaders);
    assert(res1.status === 200, 'POST /finance/add returns HTTP 200');
    assert(res1.data && res1.data._id, 'Quote record created in database');
    createdFinanceIds.push(res1.data._id);

    assert(res1.data.Status === 'Sent', `Quote status is "Sent" (Status: ${res1.data.Status})`);
    assert(res1.data.emailDispatch && res1.data.emailDispatch.success === true, 'emailDispatch.success is true');
    assert(!!res1.data.emailDispatch.emailId, `emailDispatch returned emailId: ${res1.data.emailDispatch?.emailId}`);

    // Verify Email collection in MongoDB
    const emailDoc1 = await Email.findOne({ offer: res1.data._id });
    assert(!!emailDoc1, 'Email record saved in MongoDB Email collection linked to offer');
    assert(emailDoc1?.recipient === testCustomer.email, `Email recipient matches customer: ${emailDoc1?.recipient}`);
    assert(emailDoc1?.eventType === 'QUOTE_SENT', `Email eventType is QUOTE_SENT (eventType: ${emailDoc1?.eventType})`);

    // Verify Email record attachments & delivery status
    assert(emailDoc1?.attachments && emailDoc1.attachments.length > 0, `Quotation PDF attachment recorded in Email record (${emailDoc1?.attachments?.[0]?.filename})`);
    assert(emailDoc1?.status === 'SENT', `Email record status is SENT (status: ${emailDoc1?.status})`);

    // -------------------------------------------------------------------------
    // TEST 2: Submit New Offer with Status: 'Sent' (Implicit sendEmail)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: POST /finance/add with Status: "Sent" (auto-dispatches) ---');
    clearStagingMailSink();

    const offerPayload2 = {
      customer: testCustomer._id,
      Status: 'Sent',
      vat: 'exclusive',
      items: [
        { description: 'Piano Relocation Special Care', quantity: 1, price: 350, btw: '21' },
      ],
    };

    const res2 = await axios.post(`${BASE_URL}/finance/add`, offerPayload2, authHeaders);
    assert(res2.status === 200, 'POST /finance/add returns HTTP 200');
    createdFinanceIds.push(res2.data._id);
    assert(res2.data.emailDispatch && res2.data.emailDispatch.success === true, 'emailDispatch auto-dispatched on Status === "Sent"');

    const emailDoc2 = await Email.findOne({ offer: res2.data._id });
    assert(!!emailDoc2, 'Email collection record created for Status: Sent quote');

    // -------------------------------------------------------------------------
    // TEST 3: Submit Draft Offer (Status: 'Draft', sendEmail: false) -> NO EMAIL
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: POST /finance/add with Status: "Draft" & sendEmail: false ---');
    clearStagingMailSink();

    const offerPayload3 = {
      customer: testCustomer._id,
      Status: 'Draft',
      sendEmail: false,
      vat: 'exclusive',
      items: [
        { description: 'Internal Draft Estimation', quantity: 1, price: 100, btw: '21' },
      ],
    };

    const res3 = await axios.post(`${BASE_URL}/finance/add`, offerPayload3, authHeaders);
    assert(res3.status === 200, 'POST /finance/add returns HTTP 200 for draft');
    createdFinanceIds.push(res3.data._id);
    assert(res3.data.Status === 'Draft', `Quote status remains Draft (Status: ${res3.data.Status})`);
    assert(!res3.data.emailDispatch, 'emailDispatch is undefined for internal draft');

    const emailDoc3 = await Email.findOne({ offer: res3.data._id });
    assert(!emailDoc3, 'No Email record created in DB for draft offer');
    assert(getStagingMailSink().length === 0, 'No email pushed to mail sink for draft offer');

    // -------------------------------------------------------------------------
    // TEST 4: Legacy /finance/send Route Backward Compatibility
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: POST /finance/send Backward Compatibility ---');
    clearStagingMailSink();

    const res4 = await axios.post(
      `${BASE_URL}/finance/send`,
      { Id: res3.data._id },
      authHeaders
    );
    assert(res4.status === 200, 'POST /finance/send returns HTTP 200');
    assert(!!res4.data, `POST /finance/send returned email ID: ${res4.data}`);

    const dbUpdatedQuote = await Finance.findById(res3.data._id);
    assert(dbUpdatedQuote.Status === 'Sent', 'Quote status updated to Sent after /finance/send');

    console.log('\n======================================================');
    console.log(`SUMMARY: ${passCount} passed, ${failCount} failed`);
    console.log('======================================================');

    if (failCount > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error during test run:', err.response?.data || err.message);
    process.exit(1);
  } finally {
    await cleanupFixtures();
  }
}

runTests();
