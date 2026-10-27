const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
require('dotenv').config();
const ws = require('ws');
const jwt = require('jsonwebtoken');

async function runSessionSecurityTests() {
  console.log('--- EXEC-05 SESSION & WEBSOCKET SECURITY VERIFICATION ---');

  const validToken = jwt.sign(
    { userId: '60d0fe4f5311236168a109ca', username: 'TestSessionUser', role: 'Admin' },
    process.env.JWT_SECRET || 'abcdefghijklmnopqrstuvwxyz',
    { expiresIn: '1h' }
  );

  let allPassed = true;

  // Test 1: Safe Message-based WebSocket Auth (Clean URL without query token)
  try {
    const wsUrlClean = 'ws://localhost:4040';
    const client = new ws(wsUrlClean);

    const test1Pass = await new Promise((resolve) => {
      client.on('open', () => {
        // Authenticate via message payload (zero token in URL)
        client.send(JSON.stringify({ type: 'auth', token: validToken }));
        client.send(JSON.stringify({ type: 'getOnline' }));
      });

      client.on('message', (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.online && Array.isArray(parsed.online)) {
            const isUserOnline = parsed.online.some(u => u.userId === '60d0fe4f5311236168a109ca');
            if (isUserOnline) {
              client.close();
              resolve(true);
            }
          }
        } catch (e) {}
      });

      client.on('error', () => resolve(false));
      setTimeout(() => {
        client.close();
        resolve(false);
      }, 4000);
    });

    console.log(`[Test 1] Safe Message-Based WebSocket Auth (Zero Token in URL): ${test1Pass ? 'PASSED (User authenticated & online)' : 'FAILED'}`);
    if (!test1Pass) allPassed = false;
  } catch (err) {
    console.error('Test 1 error:', err);
    allPassed = false;
  }

  // Test 2: Backward Compatibility - Legacy Query Parameter Token
  try {
    const wsUrlLegacy = `ws://localhost:4040?token=${validToken}`;
    const legacyClient = new ws(wsUrlLegacy);

    const test2Pass = await new Promise((resolve) => {
      legacyClient.on('open', () => {
        legacyClient.send(JSON.stringify({ type: 'getOnline' }));
      });

      legacyClient.on('message', (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.online && Array.isArray(parsed.online)) {
            const isUserOnline = parsed.online.some(u => u.userId === '60d0fe4f5311236168a109ca');
            if (isUserOnline) {
              legacyClient.close();
              resolve(true);
            }
          }
        } catch (e) {}
      });

      legacyClient.on('error', () => resolve(false));
      setTimeout(() => {
        legacyClient.close();
        resolve(false);
      }, 4000);
    });

    console.log(`[Test 2] Dual Backward-Compatibility (Legacy ?token=... works): ${test2Pass ? 'PASSED (Fallback active)' : 'FAILED'}`);
    if (!test2Pass) allPassed = false;
  } catch (err) {
    console.error('Test 2 error:', err);
    allPassed = false;
  }

  // Test 3: Zero-Regression Check - Live Invoice Endpoint & PDF Download Verification
  try {
    const resInvoice = await fetch('http://127.0.0.1:8080/invoice/invoice/6ad202dcb67074d4c4540f79', {
      headers: { Authorization: `Bearer ${validToken}` }
    });
    const invData = await resInvoice.json();
    const test3aPass = resInvoice.status === 200 && invData.invoice && invData.invoice.index === '2026/0025';

    const resPdf = await fetch('http://127.0.0.1:8080/invoice/download', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validToken}`
      },
      body: JSON.stringify({ Id: '6ad202dcb67074d4c4540f79' })
    });
    const pdfBuffer = await resPdf.arrayBuffer();
    const test3bPass = resPdf.status === 200 && pdfBuffer.byteLength > 1000;

    const test3Pass = test3aPass && test3bPass;
    console.log(`[Test 3] Zero-Regression Gate (Invoice #2026/0025 & PDF Download): ${test3Pass ? `PASSED (Invoice 200 OK, PDF ${pdfBuffer.byteLength} bytes)` : 'FAILED'}`);
    if (!test3Pass) allPassed = false;
  } catch (err) {
    console.error('Test 3 error:', err);
    allPassed = false;
  }

  console.log(`\nOVERALL EXEC-05 VERIFICATION: ${allPassed ? 'ALL TESTS PASSED!' : 'SOME TESTS FAILED'}`);
  process.exit(allPassed ? 0 : 1);
}

runSessionSecurityTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
