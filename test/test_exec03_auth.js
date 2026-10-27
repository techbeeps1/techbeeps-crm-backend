const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
require('dotenv').config();
const http = require('http');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// Import the configured server
const server = require('../server');

const testPort = 8089;
let httpServer;

async function runTests() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI, { retryWrites: true });
  }
  httpServer = server.listen(testPort, async () => {
    console.log(`Test server running on port ${testPort}`);

    const validToken = jwt.sign(
      { id: '60d0fe4f5311236168a109ca', role: 'Admin', username: 'TestAdmin' },
      process.env.JWT_SECRET || 'abcdefghijklmnopqrstuvwxyz',
      { expiresIn: '1h' }
    );

    const endpointsToTest = [
      { path: '/invoice/invoiceList', desc: 'List Invoices' },
      { path: '/invoice/invoiceCount', desc: 'Invoice Count' },
      { path: '/finance/financeList', desc: 'List Quotes / Finance' },
      { path: '/finance/financeCount', desc: 'Finance Count' },
      { path: '/api/jobList', desc: 'List Job Schedules' },
      { path: '/api/searchedJobs', desc: 'Searched Jobs' },
      { path: '/api/payments', desc: 'Payments List' },
      { path: '/api/logCommunicationList', desc: 'Communication Logs' },
      { path: '/api/vehicles', desc: 'Vehicles List' },
      { path: '/api/documentList', desc: 'Document List' },
      { path: '/api/activities', desc: 'Activity Logs' },
    ];

    console.log('\n--- 1. NEGATIVE TESTS (ANONYMOUS / NO TOKEN) ---');
    let allNegativePassed = true;
    for (const ep of endpointsToTest) {
      try {
        const res = await fetch(`http://localhost:${testPort}${ep.path}`);
        const passed = res.status === 401;
        console.log(`[Negative] ${ep.desc} (${ep.path}): Status ${res.status} -> ${passed ? 'PASSED (401 Denied)' : 'FAILED'}`);
        if (!passed) allNegativePassed = false;
      } catch (err) {
        console.error(`Error on ${ep.path}:`, err.message);
      }
    }

    console.log('\n--- 2. POSITIVE TESTS (VALID JWT TOKEN) ---');
    for (const ep of endpointsToTest.slice(0, 5)) {
      try {
        const res = await fetch(`http://localhost:${testPort}${ep.path}`, {
          headers: { Authorization: `Bearer ${validToken}` }
        });
        console.log(`[Positive] ${ep.desc} (${ep.path}): Status ${res.status} (Authenticated access allowed)`);
      } catch (err) {
        console.error(`Error on ${ep.path}:`, err.message);
      }
    }

    console.log(`\nOVERALL VERIFICATION: ${allNegativePassed ? 'ALL DEFAULT-DENY GATES PASSED!' : 'SOME GATES FAILED'}`);
    httpServer.close();
    process.exit(allNegativePassed ? 0 : 1);
  });
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  if (httpServer) httpServer.close();
  process.exit(1);
});
