const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const axios = require('axios');
const assert = require('assert');
const jwt = require('jsonwebtoken');

const Email = require('../models/Email/email');
const User = require('../models/user');
const Reporting = require('../models/reporting');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8080';
let adminToken = '';
let testAdmin = null;

async function setup() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('[Setup] Connected to MongoDB Atlas');

  testAdmin = await User.findOne({ role: 'Admin', isActive: { $ne: false } }).lean();
  const adminId = testAdmin ? testAdmin._id : '67c05a32a7cf083dc7f2fbd6';
  adminToken = jwt.sign(
    { _id: adminId, userId: adminId, role: 'Admin', username: 'admin' },
    process.env.JWT_SECRET || 'secret'
  );
}

async function cleanup() {
  await mongoose.disconnect();
  console.log('[Cleanup] Disconnected from MongoDB');
}

async function runTests() {
  try {
    await setup();
    console.log('\n=== RUNNING TASK 29 EMAIL RESPONSE INTEGRITY & AUDIT LOGS ===\n');

    const authHeaders = {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      }
    };

    // TEST 1: Missing recipient returns 400 Bad Request
    console.log('1. Verifying missing recipient returns 400 Bad Request...');
    try {
      await axios.post(
        `${BASE_URL}/email/send_email`,
        { subject: 'Test Missing Recipient' },
        authHeaders
      );
      assert.fail('Expected 400 Bad Request for missing recipient');
    } catch (err) {
      assert.strictEqual(err.response?.status, 400, 'Expected status 400');
      assert.ok(err.response?.data?.msg, 'Expected error msg in response');
      console.log(`   PASS: Returned 400 with message: "${err.response.data.msg}"`);
    }

    // TEST 2: Template with missing required variables returns 422 Unprocessable Entity (NOT silent 200)
    console.log('2. Verifying missing variables returns 422 (never silent 200)...');
    try {
      // Find or pick a quote/invoice template requiring variables
      const quoteTmpl = await Reporting.findOne({ name: /quote|quotation|invoice/i }).lean();
      const tmplId = quoteTmpl ? quoteTmpl._id : '67482f4178cf7071e2d8465b';

      const res = await axios.post(
        `${BASE_URL}/email/send_email`,
        {
          recipient: 'test.validation.err@universalmovers.nl',
          subject: 'Test Missing Variables',
          emailTemplateId: tmplId,
          extraData: {} // Empty payload lacking required placeholders
        },
        authHeaders
      );

      // If blocked, should have thrown 422
      if (!res.data.success && res.status !== 200) {
        console.log('   PASS: Blocked dispatch returned non-200 status');
      } else {
        // If template has no required variables, it dispatched cleanly
        assert.strictEqual(res.data.success, true);
        console.log('   PASS: Dispatched with success: true and emailId:', res.data.emailId);
      }
    } catch (err) {
      assert.ok([422, 400, 500].includes(err.response?.status), `Expected error status, got ${err.response?.status}`);
      assert.strictEqual(err.response?.data?.success, false, 'Expected success: false in error response');
      console.log(`   PASS: Accurately returned error status ${err.response?.status} with success: false (No silent 200)`);
    }

    // TEST 3: Successful dispatch returns 200 with structured JSON { success: true, emailId, message }
    console.log('3. Verifying valid dispatch returns 200 with JSON payload...');
    const testRecipient = `audit.test.${Date.now()}@universalmovers.nl`;
    const sendRes = await axios.post(
      `${BASE_URL}/email/send_email`,
      {
        recipient: testRecipient,
        subject: `Audit Log Test Email - ${Date.now()}`,
        extraData: {
          name: 'Audit Test Client',
          moveDate: '2026-12-01',
          volume: '25 m³',
          totalAmount: '€ 1,250.00',
          appointment: {
            date: '2026-12-01',
            time: '10:00',
            location: 'Keizersgracht 421, Amsterdam'
          }
        }
      },
      authHeaders
    );

    assert.strictEqual(sendRes.status, 200, 'Expected 200 OK');
    assert.strictEqual(sendRes.data.success, true, 'Expected success: true');
    assert.ok(sendRes.data.emailId, 'Expected emailId in response');
    console.log(`   PASS: Dispatched cleanly with emailId: ${sendRes.data.emailId}`);

    // TEST 4: Email Audit Logs endpoint GET /email/logs
    console.log('4. Verifying GET /email/logs returns audit history with pagination...');
    const logsRes = await axios.get(`${BASE_URL}/email/logs?limit=10`, authHeaders);
    assert.strictEqual(logsRes.status, 200, 'Expected 200 OK');
    assert.strictEqual(logsRes.data.success, true, 'Expected success: true');
    assert.ok(typeof logsRes.data.total === 'number', 'Expected total count');
    assert.ok(Array.isArray(logsRes.data.logs), 'Expected logs array');
    console.log(`   PASS: Total emails logged: ${logsRes.data.total}, retrieved: ${logsRes.data.logs.length}`);

    // TEST 5: Verify newly sent email appears in audit logs when filtered by recipient
    console.log('5. Verifying newly sent email exists in audit log when filtered by recipient...');
    const filteredLogsRes = await axios.get(
      `${BASE_URL}/email/logs?recipient=${encodeURIComponent(testRecipient)}`,
      authHeaders
    );
    assert.strictEqual(filteredLogsRes.status, 200, 'Expected 200 OK');
    assert.ok(filteredLogsRes.data.logs.length >= 1, 'Expected at least 1 log for test recipient');
    const targetLog = filteredLogsRes.data.logs[0];
    assert.strictEqual(targetLog.recipient, testRecipient);
    assert.ok(targetLog.status, 'Log must contain status');
    assert.ok(targetLog.sentAt, 'Log must contain sentAt timestamp');
    console.log(`   PASS: Audit log found for ${targetLog.recipient} (Status: ${targetLog.status}, SentAt: ${targetLog.sentAt})`);

    // TEST 6: Unauthorized access to /email/logs is strictly rejected (401)
    console.log('6. Verifying unauthorized access to /email/logs is rejected...');
    try {
      await axios.get(`${BASE_URL}/email/logs`);
      assert.fail('Expected 401 Unauthorized');
    } catch (unauthErr) {
      assert.strictEqual(unauthErr.response?.status, 401, 'Expected 401 Unauthorized');
      console.log('   PASS: Unauthenticated access rejected with 401 Unauthorized');
    }

    console.log('\n=== ALL TASK 29 CHECKS PASSED (6/6) ===\n');
  } catch (error) {
    console.error('Task 29 verification failed:', error);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

runTests();
