const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Invoice = require('../models/invoice');
const User = require('../models/User');

const DB_URI = process.env.MONGO_URI;

function makeRequest(method, pathUrl, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = data ? JSON.stringify(data) : null;
    const options = {
      hostname: '127.0.0.1',
      port: 8080,
      path: pathUrl,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: body ? JSON.parse(body) : null });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTask34Verification() {
  console.log('[Setup] Connecting to MongoDB...');
  await mongoose.connect(DB_URI);
  console.log('[Setup] Connected to DB.');

  try {
    // 1. Get an Admin or Staff user and generate valid auth token
    const adminUser = await User.findOne({ role: 'Admin' });
    if (!adminUser) {
      throw new Error('No Admin user found for tests');
    }
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { id: adminUser._id, role: adminUser.role },
      process.env.JWT_SECRET || 'test_jwt_secret',
      { expiresIn: '1h' }
    );
    const authHeaders = { Authorization: `Bearer ${token}` };

    console.log('\n=== RUNNING TASK 34: INVOICE IMMUTABILITY VERIFICATION ===\n');

    // TEST 1: Create a Draft invoice
    console.log('1. Creating a fresh Draft invoice...');
    const draftInvoice = await Invoice.create({
      Status: 'Draft',
      total: 500,
      subTotal: 500,
      items: [{ description: 'Initial service', quantity: 1, price: 500, btw: '21' }],
      remark: 'Initial Draft'
    });
    console.log(`   PASS: Draft invoice created with ID: ${draftInvoice._id}, Status: ${draftInvoice.Status}`);

    // TEST 2: Update the Draft invoice (Should be allowed)
    console.log('2. Updating Draft invoice...');
    const updateDraftRes = await makeRequest(
      'POST',
      `/invoice/update/${draftInvoice._id}`,
      { remark: 'Draft updated successfully', total: 600 },
      authHeaders
    );
    if (updateDraftRes.status !== 200) {
      throw new Error(`Expected 200 for Draft update, got ${updateDraftRes.status}: ${JSON.stringify(updateDraftRes.body)}`);
    }
    console.log('   PASS: Draft invoice updated successfully (200 OK)');

    // TEST 3: Finalize to 'Sent' and attempt update (Should be BLOCKED with 403)
    console.log('3. Transitioning invoice to Sent and attempting direct update...');
    await Invoice.findByIdAndUpdate(draftInvoice._id, { Status: 'Sent' });

    const updateSentRes = await makeRequest(
      'POST',
      `/invoice/update/${draftInvoice._id}`,
      { remark: 'Attempting illegal change on Sent invoice', total: 999 },
      authHeaders
    );
    if (updateSentRes.status !== 403 || updateSentRes.body?.error !== 'INVOICE_IMMUTABLE') {
      throw new Error(`Expected 403 INVOICE_IMMUTABLE for Sent invoice update, got ${updateSentRes.status}: ${JSON.stringify(updateSentRes.body)}`);
    }
    console.log(`   PASS: Sent invoice update strictly blocked with 403 Forbidden! Message: "${updateSentRes.body.message}"`);

    // TEST 4: Attempt to delete the 'Sent' invoice (Should be BLOCKED with 403)
    console.log('4. Attempting to delete Sent invoice...');
    const deleteSentRes = await makeRequest(
      'DELETE',
      `/invoice/deleteInvoice/${draftInvoice._id}`,
      null,
      authHeaders
    );
    if (deleteSentRes.status !== 403 || deleteSentRes.body?.error !== 'INVOICE_IMMUTABLE') {
      throw new Error(`Expected 403 INVOICE_IMMUTABLE for Sent invoice delete, got ${deleteSentRes.status}: ${JSON.stringify(deleteSentRes.body)}`);
    }
    console.log(`   PASS: Sent invoice deletion strictly blocked with 403 Forbidden! Message: "${deleteSentRes.body.message}"`);

    // TEST 5: Verify 'Paid' and 'Partially Paid' status immutability
    console.log('5. Verifying Paid and Partially Paid immutability...');
    for (const testStatus of ['Paid', 'Partially Paid', 'Overdue']) {
      await Invoice.findByIdAndUpdate(draftInvoice._id, { Status: testStatus });
      const editRes = await makeRequest(
        'POST',
        `/invoice/update/${draftInvoice._id}`,
        { remark: `Illegal edit on ${testStatus}` },
        authHeaders
      );
      if (editRes.status !== 403 || editRes.body?.error !== 'INVOICE_IMMUTABLE') {
        throw new Error(`Expected 403 for ${testStatus} update, got ${editRes.status}`);
      }

      const delRes = await makeRequest(
        'DELETE',
        `/invoice/deleteInvoice/${draftInvoice._id}`,
        null,
        authHeaders
      );
      if (delRes.status !== 403 || delRes.body?.error !== 'INVOICE_IMMUTABLE') {
        throw new Error(`Expected 403 for ${testStatus} delete, got ${delRes.status}`);
      }
      console.log(`   PASS: Status '${testStatus}' is strictly immutable against edit and delete.`);
    }

    // TEST 6: Verify Draft invoice can still be deleted cleanly
    console.log('6. Verifying Draft invoice can still be deleted...');
    const deletableDraft = await Invoice.create({
      Status: 'Draft',
      total: 100,
      remark: 'Deletable test draft'
    });
    const deleteDraftRes = await makeRequest(
      'DELETE',
      `/invoice/deleteInvoice/${deletableDraft._id}`,
      null,
      authHeaders
    );
    if (deleteDraftRes.status !== 200) {
      throw new Error(`Expected 200 for Draft delete, got ${deleteDraftRes.status}: ${JSON.stringify(deleteDraftRes.body)}`);
    }
    console.log('   PASS: Draft invoice deleted cleanly (200 OK)');

    // Cleanup test record
    await Invoice.findByIdAndDelete(draftInvoice._id);
    console.log('\n=== ALL TASK 34 IMMUTABILITY CHECKS PASSED (6/6) ===\n');

  } finally {
    await mongoose.disconnect();
    console.log('[Cleanup] Disconnected from DB.');
  }
}

runTask34Verification().catch((err) => {
  console.error('Task 34 test failed:', err);
  process.exit(1);
});
