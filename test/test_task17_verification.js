const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const express = require('express');
const request = require('supertest');
const helmet = require('helmet');

const { authLimiter, otpLimiter } = require('../middlewares/rateLimiter');

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, detail = '') {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] ${testName} - ${detail}`);
    failedTests++;
  }
}

async function runVerification() {
  console.log('\n======================================================');
  console.log('TASK 17 [UM3-032] AUTOMATED VERIFICATION: RATE LIMITING & HELMET');
  console.log('======================================================\n');

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Helmet Security Headers Verification
    // -------------------------------------------------------------------------
    console.log('--- Section 1: Helmet Security Headers ---');

    const app = express();
    app.use(helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: false,
    }));
    app.get('/test-headers', (req, res) => res.json({ ok: true }));

    const headerRes = await request(app).get('/test-headers');

    assert(
      headerRes.headers['x-content-type-options'] === 'nosniff',
      'Test 1.1: X-Content-Type-Options: nosniff header is set',
      `Actual: ${headerRes.headers['x-content-type-options']}`
    );
    assert(
      headerRes.headers['x-frame-options'] === 'SAMEORIGIN',
      'Test 1.2: X-Frame-Options: SAMEORIGIN header is set',
      `Actual: ${headerRes.headers['x-frame-options']}`
    );
    assert(
      headerRes.headers['cross-origin-resource-policy'] === 'cross-origin',
      'Test 1.3: Cross-Origin-Resource-Policy: cross-origin is configured',
      `Actual: ${headerRes.headers['cross-origin-resource-policy']}`
    );
    assert(
      headerRes.headers['strict-transport-security'] !== undefined,
      'Test 1.4: Strict-Transport-Security (HSTS) header is enabled'
    );

    // -------------------------------------------------------------------------
    // TEST 2: Auth Rate Limiter Verification (25 requests max)
    // -------------------------------------------------------------------------
    console.log('\n--- Section 2: Auth Endpoints Rate Limiter ---');

    const authApp = express();
    authApp.use(express.json());
    authApp.post('/login', authLimiter, (req, res) => res.status(400).json({ msg: 'Invalid Credentials' }));

    // Send 25 valid requests within the limit
    let allInitialPassed = true;
    for (let i = 1; i <= 25; i++) {
      const res = await request(authApp).post('/login').send({ email: 'test@example.com', password: 'wrong' });
      if (res.status === 429) {
        allInitialPassed = false;
        break;
      }
    }
    assert(allInitialPassed, 'Test 2.1: First 25 login requests succeed within rate limit threshold');

    // 26th request must be rejected with 429 Too Many Requests
    const blockedAuthRes = await request(authApp).post('/login').send({ email: 'test@example.com', password: 'wrong' });
    assert(
      blockedAuthRes.status === 429,
      'Test 2.2: 26th login request blocked with HTTP 429 (Too Many Requests)',
      `Actual status: ${blockedAuthRes.status}`
    );
    assert(
      blockedAuthRes.body?.error === 'TOO_MANY_REQUESTS',
      'Test 2.3: Error response body specifies TOO_MANY_REQUESTS',
      `Body: ${JSON.stringify(blockedAuthRes.body)}`
    );

    // -------------------------------------------------------------------------
    // TEST 3: OTP Rate Limiter Verification (10 requests max)
    // -------------------------------------------------------------------------
    console.log('\n--- Section 3: OTP Endpoints Rate Limiter ---');

    const otpApp = express();
    otpApp.use(express.json());
    otpApp.post('/send-otp', otpLimiter, (req, res) => res.json({ success: true }));

    let allOtpInitialPassed = true;
    for (let i = 1; i <= 10; i++) {
      const res = await request(otpApp).post('/send-otp').send({ email: 'otp-test@example.com' });
      if (res.status === 429) {
        allOtpInitialPassed = false;
        break;
      }
    }
    assert(allOtpInitialPassed, 'Test 3.1: First 10 OTP requests succeed within limit');

    // 11th request must be rejected with 429
    const blockedOtpRes = await request(otpApp).post('/send-otp').send({ email: 'otp-test@example.com' });
    assert(
      blockedOtpRes.status === 429,
      'Test 3.2: 11th OTP request blocked with HTTP 429',
      `Actual status: ${blockedOtpRes.status}`
    );
    assert(
      blockedOtpRes.body?.error === 'TOO_MANY_REQUESTS',
      'Test 3.3: Error response body specifies TOO_MANY_REQUESTS for OTP rate limit'
    );

  } catch (err) {
    console.error('Error during test execution:', err);
    failedTests++;
  }

  console.log('\n======================================================');
  console.log(`TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('======================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runVerification();
