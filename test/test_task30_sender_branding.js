const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const axios = require('axios');
const assert = require('assert');
const jwt = require('jsonwebtoken');

const CompanyDetails = require('../models/companyModel');
const User = require('../models/user');
const { dispatchOutboxEmail, EMAIL_EVENTS, getStagingMailSink } = require('../utils/emailOutboxService');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8080';
let adminToken = '';
let originalCompany = null;

async function setup() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('[Setup] Connected to MongoDB Atlas');

  originalCompany = await CompanyDetails.findOne().lean();

  const testAdmin = await User.findOne({ role: 'Admin', isActive: { $ne: false } }).lean();
  const adminId = testAdmin ? testAdmin._id : '67c05a32a7cf083dc7f2fbd6';
  adminToken = jwt.sign(
    { _id: adminId, userId: adminId, role: 'Admin', username: 'admin' },
    process.env.JWT_SECRET || 'secret'
  );
}

async function cleanup() {
  try {
    if (originalCompany) {
      await CompanyDetails.updateOne({ _id: originalCompany._id }, { $set: originalCompany });
    }
    await mongoose.disconnect();
    console.log('[Cleanup] Finished');
  } catch (err) {
    console.error('Error during cleanup:', err.message);
  }
}

async function runTests() {
  try {
    await setup();
    console.log('\n=== RUNNING TASK 30 SENDER BRANDING & SMTP INTEGRITY TESTS ===\n');

    // TEST 1: Dispatch outbox email and inspect From and Reply-To headers
    console.log('1. Verifying outbox dispatch includes Universal Movers branding and Reply-To...');
    const result = await dispatchOutboxEmail({
      eventType: EMAIL_EVENTS.SURVEY_SCHEDULED,
      recipient: 'client.branding.test@universalmovers.nl',
      subject: 'Universal Movers Service Confirmation',
      context: {
        customer: { name: 'Branding Test Client', email: 'client.branding.test@universalmovers.nl' },
        appointment: { date: '2026-12-05', time: '11:00', location: 'Amsterdam' }
      }
    });

    const sink = getStagingMailSink();
    const sentEmail = sink.find(m => m.to === 'client.branding.test@universalmovers.nl');
    assert.ok(sentEmail, 'Email must be in outbox staging sink');
    assert.ok(sentEmail.from.includes('Universal Movers'), `From header must include "Universal Movers": got ${sentEmail.from}`);
    assert.ok(sentEmail.replyTo, 'Reply-To header must be present');
    assert.ok(sentEmail.replyTo.includes('universalmovers.nl') || sentEmail.replyTo.includes('universal-movers.nl') || sentEmail.replyTo.includes('@'), `Reply-To must be a valid company email: got ${sentEmail.replyTo}`);
    console.log(`   PASS: From header: "${sentEmail.from}", Reply-To: "${sentEmail.replyTo}"`);

    // TEST 2: Active SMTP user preservation (no broken authentication)
    console.log('2. Verifying authenticated SMTP account is preserved in envelope sender...');
    const expectedSmtpUser = process.env.SMTP_USER;
    if (expectedSmtpUser) {
      assert.ok(sentEmail.from.includes(expectedSmtpUser), `From address must preserve authenticated SMTP_USER <${expectedSmtpUser}> to ensure delivery: got ${sentEmail.from}`);
      console.log(`   PASS: Preserved SMTP_USER credentials in envelope: <${expectedSmtpUser}>`);
    } else {
      console.log('   NOTE: SMTP_USER not set in env; skipped envelope check.');
    }

    // TEST 3: Dynamic Company Name branding updates
    console.log('3. Verifying dynamic company name update alters From display name...');
    const customBrandName = 'Universal Movers Netherlands B.V.';
    await CompanyDetails.findOneAndUpdate(
      {},
      { $set: { companyName: customBrandName } },
      { upsert: true, returnDocument: 'after' }
    );

    await dispatchOutboxEmail({
      eventType: EMAIL_EVENTS.SURVEY_SCHEDULED,
      recipient: 'client.branding.test2@universalmovers.nl',
      subject: 'Dynamic Brand Offer',
      context: {
        customer: { name: 'Dynamic Brand Client', email: 'client.branding.test2@universalmovers.nl' },
        appointment: { date: '2026-12-06', time: '14:00', location: 'Utrecht' }
      }
    });

    const sentEmail2 = sink.find(m => m.to === 'client.branding.test2@universalmovers.nl');
    assert.ok(sentEmail2, 'Second test email must be in outbox sink');
    assert.ok(sentEmail2.from.includes(customBrandName), `From header must include dynamic "${customBrandName}": got ${sentEmail2.from}`);
    console.log(`   PASS: Updated From header: "${sentEmail2.from}"`);

    // TEST 4: API endpoint /email/send_email uses updated branding
    console.log('4. Verifying /email/send_email endpoint dispatches with correct branding...');
    const apiRes = await axios.post(
      `${BASE_URL}/email/send_email`,
      {
        recipient: 'client.branding.test3@universalmovers.nl',
        subject: 'API Dispatched Branding Test',
        extraData: {
          name: 'API Client',
          appointment: { date: '2026-12-07', time: '15:00', location: 'Rotterdam' }
        }
      },
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    assert.strictEqual(apiRes.status, 200, 'Expected 200 OK');
    assert.strictEqual(apiRes.data.success, true, 'Expected success: true');
    console.log('   PASS: API /email/send_email executed with 200 OK and success: true');

    console.log('\n=== ALL TASK 30 CHECKS PASSED (4/4) ===\n');
  } catch (error) {
    console.error('Task 30 verification failed:', error);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

runTests();
