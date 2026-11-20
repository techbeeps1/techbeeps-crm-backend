const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { assertSafeTestEnvironment } = require('../utils/testEnvironmentGuard');

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
  console.log('TASK 20 [UM3-123] AUTOMATED VERIFICATION: TEST ENV GUARD');
  console.log('======================================================\n');

  // Preserve original environment variables
  const origNodeEnv = process.env.NODE_ENV;
  const origIsProd = process.env.IS_PRODUCTION;
  const origAllowTest = process.env.ALLOW_TESTS_ON_PRODUCTION;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Safe Execution in Development / Staging
    // -------------------------------------------------------------------------
    console.log('--- Section 1: Standard Staging / Dev Safety Check ---');
    delete process.env.IS_PRODUCTION;
    process.env.NODE_ENV = 'development';

    const resultDev = assertSafeTestEnvironment({ throwError: false });
    assert(resultDev.safe === true, 'Test 1.1: Guard permits tests in development/staging environment');
    assert(resultDev.isStaging !== undefined, 'Test 1.2: Guard reports staging status correctly');

    // -------------------------------------------------------------------------
    // TEST 2: Strict Block on Production (NODE_ENV=production)
    // -------------------------------------------------------------------------
    console.log('\n--- Section 2: Production Guard Block ---');
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_TESTS_ON_PRODUCTION;

    let blockedByNodeEnv = false;
    try {
      assertSafeTestEnvironment();
    } catch (err) {
      if (err.code === 'PRODUCTION_GUARD_TRIGGERED') {
        blockedByNodeEnv = true;
      }
    }
    assert(blockedByNodeEnv === true, 'Test 2.1: Tests strictly blocked when NODE_ENV === "production"');

    // -------------------------------------------------------------------------
    // TEST 3: Strict Block when IS_PRODUCTION === 'true'
    // -------------------------------------------------------------------------
    console.log('\n--- Section 3: IS_PRODUCTION Guard Block ---');
    process.env.NODE_ENV = 'test';
    process.env.IS_PRODUCTION = 'true';
    delete process.env.ALLOW_TESTS_ON_PRODUCTION;

    let blockedByIsProd = false;
    try {
      assertSafeTestEnvironment();
    } catch (err) {
      if (err.code === 'PRODUCTION_GUARD_TRIGGERED') {
        blockedByIsProd = true;
      }
    }
    assert(blockedByIsProd === true, 'Test 3.1: Tests strictly blocked when IS_PRODUCTION === "true"');

    // Non-throwing mode check
    const nonThrowResult = assertSafeTestEnvironment({ throwError: false });
    assert(nonThrowResult.safe === false, 'Test 3.2: Non-throwing mode returns safe: false');
    assert(nonThrowResult.reason === 'PRODUCTION_ENVIRONMENT', 'Test 3.3: Reason reported as PRODUCTION_ENVIRONMENT');

    // -------------------------------------------------------------------------
    // TEST 4: Authorized Audit Override Flag
    // -------------------------------------------------------------------------
    console.log('\n--- Section 4: Authorized Production Probe Override ---');
    process.env.ALLOW_TESTS_ON_PRODUCTION = 'true';

    let allowedWithOverride = false;
    try {
      const overrideResult = assertSafeTestEnvironment();
      allowedWithOverride = overrideResult.safe === true;
    } catch (err) {
      allowedWithOverride = false;
    }
    assert(
      allowedWithOverride === true,
      'Test 4.1: Explicit ALLOW_TESTS_ON_PRODUCTION=true permits controlled audit probes'
    );

  } catch (err) {
    console.error('Error during test execution:', err);
    failedTests++;
  } finally {
    // Restore original environment variables
    if (origNodeEnv !== undefined) process.env.NODE_ENV = origNodeEnv; else delete process.env.NODE_ENV;
    if (origIsProd !== undefined) process.env.IS_PRODUCTION = origIsProd; else delete process.env.IS_PRODUCTION;
    if (origAllowTest !== undefined) process.env.ALLOW_TESTS_ON_PRODUCTION = origAllowTest; else delete process.env.ALLOW_TESTS_ON_PRODUCTION;
  }

  console.log('\n======================================================');
  console.log(`TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('======================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runVerification();
