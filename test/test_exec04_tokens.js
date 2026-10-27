const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const http = require('http');
const mongoose = require('mongoose');
const crypto = require('crypto');
const server = require('../server');
const Finance = require('../models/finance');

const testPort = 8091;
let httpServer;

async function runExec04Tests() {
  httpServer = server.listen(testPort, async () => {
    console.log(`EXEC-04 Test Server listening on port ${testPort}`);

    // Ensure database connection
    if (mongoose.connection.readyState !== 1) {
      console.log('Connecting to MongoDB...');
      await mongoose.connect(process.env.MONGO_URI, {
        retryWrites: true,
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
      });
      console.log('MongoDB connected successfully!');
    }

    const validToken = crypto.randomBytes(32).toString('hex');
    const expiredToken = crypto.randomBytes(32).toString('hex');

    // 1. Setup test finance documents
    const validFinance = await Finance.create({
      index: 'TEST-QUOTE-001',
      total: 750,
      subtotal: 750,
      capabilityToken: validToken,
      tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days future
      Status: 'Pending',
      items: [
        { description: 'Piano Relocation Service', quantity: 1, price: 750, total: 750 }
      ]
    });

    const expiredFinance = await Finance.create({
      index: 'TEST-QUOTE-002',
      total: 1200,
      subtotal: 1200,
      capabilityToken: expiredToken,
      tokenExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day expired
      Status: 'Pending',
      items: [
        { description: 'Full House Move', quantity: 1, price: 1200, total: 1200 }
      ]
    });

    console.log('\n--- EXEC-04 CAPABILITY TOKEN TESTS ---');
    let allPassed = true;

    try {
      // Test 1: Fetch valid quote using 64-character capability token (No auth header)
      const res1 = await fetch(`http://localhost:${testPort}/finance/finance/${validToken}`);
      const data1 = await res1.json();
      const test1Pass = res1.status === 200 && data1.finance && data1.finance.capabilityToken === validToken;
      console.log(`[Test 1] Public Quote Lookup by Capability Token: Status ${res1.status} -> ${test1Pass ? 'PASSED (200 OK + Sanitized DTO)' : 'FAILED'}`);
      if (!test1Pass) allPassed = false;

      // Test 2: Fetch expired quote using expired capability token (No auth header)
      const res2 = await fetch(`http://localhost:${testPort}/finance/finance/${expiredToken}`);
      const test2Pass = res2.status === 410;
      console.log(`[Test 2] Expired Token Rejected with 410 Gone: Status ${res2.status} -> ${test2Pass ? 'PASSED (410 Expired)' : 'FAILED'}`);
      if (!test2Pass) allPassed = false;

      // Test 3: Fetch using invalid/random non-existent capability token
      const fakeToken = crypto.randomBytes(32).toString('hex');
      const res3 = await fetch(`http://localhost:${testPort}/finance/finance/${fakeToken}`);
      const test3Pass = res3.status === 404;
      console.log(`[Test 3] Unknown Capability Token Returns 404: Status ${res3.status} -> ${test3Pass ? 'PASSED (404 Not Found)' : 'FAILED'}`);
      if (!test3Pass) allPassed = false;

      // Test 4: Backward Compatibility - Dual lookup by valid Mongo _id
      const res4 = await fetch(`http://localhost:${testPort}/finance/finance/${validFinance._id}`);
      const data4 = await res4.json();
      const test4Pass = res4.status === 200 && data4.finance && data4.finance._id.toString() === validFinance._id.toString();
      console.log(`[Test 4] Dual-Lookup Backward Compatibility (_id lookup): Status ${res4.status} -> ${test4Pass ? 'PASSED (Legacy _id Works)' : 'FAILED'}`);
      if (!test4Pass) allPassed = false;

      // Test 5: Public Acceptance via Capability Token
      const res5 = await fetch(`http://localhost:${testPort}/finance/update/${validToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Status: 'Accepted' })
      });
      const data5 = await res5.json();
      const test5Pass = res5.status === 200 && data5.Status === 'Accepted';
      console.log(`[Test 5] Public Quote Acceptance via Token: Status ${res5.status} -> ${test5Pass ? 'PASSED (Accepted status saved)' : 'FAILED'}`);
      if (!test5Pass) allPassed = false;

      // Test 6: Unauthorized Administrative Mutation Rejected for Anonymous Users
      const res6 = await fetch(`http://localhost:${testPort}/finance/update/${validToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Status: 'Draft', total: 0 })
      });
      const test6Pass = res6.status === 401;
      console.log(`[Test 6] Arbitrary Quote Mutation Without Auth Denied: Status ${res6.status} -> ${test6Pass ? 'PASSED (401 Blocked)' : 'FAILED'}`);
      if (!test6Pass) allPassed = false;

    } catch (testErr) {
      console.error('Error during EXEC-04 test run:', testErr);
      allPassed = false;
    } finally {
      // Cleanup test documents
      await Finance.deleteMany({ _id: { $in: [validFinance._id, expiredFinance._id] } });
      console.log('\n--- CLEANUP COMPLETE ---');
    }

    console.log(`\nOVERALL EXEC-04 VERIFICATION: ${allPassed ? 'ALL TESTS PASSED!' : 'SOME TESTS FAILED'}`);
    httpServer.close();
    process.exit(allPassed ? 0 : 1);
  });
}

runExec04Tests().catch(err => {
  console.error('Fatal runner error:', err);
  if (httpServer) httpServer.close();
  process.exit(1);
});
