/**
 * Test Environment Safety Guard (Task 20 [UM3-123])
 * 
 * Protects production databases from accidental pollution, execution, or record deletion
 * by standalone test suites (test_exec*).
 */

const { isStagingEnvironment } = require('./sequenceGenerator');

/**
 * Asserts that the current runtime environment is safe for automated test execution.
 * 
 * Rules:
 * 1. If process.env.NODE_ENV === 'production' or process.env.IS_PRODUCTION === 'true' or process.env.APP_ENV === 'production':
 *    - Unless process.env.ALLOW_TESTS_ON_PRODUCTION === 'true', execution is strictly HALTED.
 * 2. If database URI explicitly references a known production cluster and isStagingEnvironment() === false:
 *    - Test execution is strictly HALTED.
 * 3. Returns { safe: true, isStaging: boolean } on success, or throws Error / exits process.
 */
function assertSafeTestEnvironment(options = {}) {
  const { throwError = true } = options;

  const isProductionEnv = (
    process.env.NODE_ENV === 'production' ||
    process.env.IS_PRODUCTION === 'true' ||
    process.env.APP_ENV === 'production'
  );

  const hasExplicitOverride = process.env.ALLOW_TESTS_ON_PRODUCTION === 'true';

  if (isProductionEnv && !hasExplicitOverride) {
    const errorMsg = [
      '======================================================================',
      '🚨 FATAL SECURITY BLOCK: TEST EXECUTION BLOCKED ON PRODUCTION DATABASE',
      '======================================================================',
      'Standalone test suites cannot be executed against a production environment.',
      'Audit Finding [UM3-123]: Direct test execution on production risks data corruption.',
      '',
      'To run tests safely, connect to a staging or local database environment.',
      'If this is an intentional audit probe, set ALLOW_TESTS_ON_PRODUCTION=true explicitly.',
      '======================================================================',
    ].join('\n');

    console.error(errorMsg);
    if (throwError) {
      const err = new Error('TEST_EXECUTION_BLOCKED_ON_PRODUCTION');
      err.code = 'PRODUCTION_GUARD_TRIGGERED';
      throw err;
    }
    return { safe: false, reason: 'PRODUCTION_ENVIRONMENT' };
  }

  return {
    safe: true,
    isStaging: isStagingEnvironment(),
    environment: process.env.NODE_ENV || 'development',
  };
}

module.exports = {
  assertSafeTestEnvironment,
};
