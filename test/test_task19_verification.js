const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const express = require('express');
const request = require('supertest');

const { sanitizeDatabaseError, errorMiddleware } = require('../middlewares/errorMiddleware');

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
  console.log('TASK 19 [UM3-076] AUTOMATED VERIFICATION: DB ERROR SANITIZATION');
  console.log('======================================================\n');

  try {
    // -------------------------------------------------------------------------
    // TEST 1: MongoDB Duplicate Key Error (E11000) Sanitization
    // -------------------------------------------------------------------------
    console.log('--- Section 1: E11000 Duplicate Key Sanitization ---');

    const rawDuplicateError = new Error('E11000 duplicate key error collection: CRMatlas.finances index: index_1 dup key: { index: "2026/0005" }');
    rawDuplicateError.code = 11000;
    rawDuplicateError.keyPattern = { index: 1 };
    rawDuplicateError.keyValue = { index: '2026/0005' };

    const sanitizedDup = sanitizeDatabaseError(rawDuplicateError);

    assert(sanitizedDup.statusCode === 409, 'Test 1.1: Returns HTTP 409 Conflict for duplicate keys');
    assert(sanitizedDup.error === 'DUPLICATE_ENTRY', 'Test 1.2: Standard error code DUPLICATE_ENTRY returned');
    assert(
      !sanitizedDup.message.includes('CRMatlas') &&
      !sanitizedDup.message.includes('collection') &&
      !sanitizedDup.message.includes('index_1'),
      'Test 1.3: Raw collection name and index name completely stripped from message',
      `Sanitized message: "${sanitizedDup.message}"`
    );

    // -------------------------------------------------------------------------
    // TEST 2: Mongoose CastError Sanitization
    // -------------------------------------------------------------------------
    console.log('\n--- Section 2: CastError Sanitization ---');

    const rawCastError = new Error('Cast to ObjectId failed for value "not-an-id" at path "_id" for model "User"');
    rawCastError.name = 'CastError';
    rawCastError.path = '_id';
    rawCastError.value = 'not-an-id';

    const sanitizedCast = sanitizeDatabaseError(rawCastError);

    assert(sanitizedCast.statusCode === 400, 'Test 2.1: Returns HTTP 400 Bad Request for CastError');
    assert(sanitizedCast.error === 'INVALID_IDENTIFIER', 'Test 2.2: Standard error code INVALID_IDENTIFIER returned');
    assert(!sanitizedCast.message.includes('Cast to ObjectId'), 'Test 2.3: Internal Mongoose cast message hidden');

    // -------------------------------------------------------------------------
    // TEST 3: Mongoose ValidationError Sanitization
    // -------------------------------------------------------------------------
    console.log('\n--- Section 3: ValidationError Sanitization ---');

    const rawValidationErr = new Error('User validation failed: email: Path `email` is required.');
    rawValidationErr.name = 'ValidationError';
    rawValidationErr.errors = {
      email: { path: 'email', message: 'Path `email` is required.' },
    };

    const sanitizedVal = sanitizeDatabaseError(rawValidationErr);

    assert(sanitizedVal.statusCode === 400, 'Test 3.1: Returns HTTP 400 for ValidationError');
    assert(sanitizedVal.error === 'VALIDATION_FAILED', 'Test 3.2: Error code is VALIDATION_FAILED');
    assert(Array.isArray(sanitizedVal.errors), 'Test 3.3: Field error details formatted in structured array');

    // -------------------------------------------------------------------------
    // TEST 4: Generic Unhandled Exception (No Stack Leakage)
    // -------------------------------------------------------------------------
    console.log('\n--- Section 4: Unhandled Exception Safety ---');

    const rawSensitiveErr = new Error('Failed to connect to mongodb+srv://muskan30092000:PASSWORD@cluster0.sneqypv.mongodb.net/CRMatlas');
    rawSensitiveErr.stack = 'Error: at QueryReqWrap.onresolve (/var/task/node_modules/mongodb/index.js:140)';

    const sanitizedSensitive = sanitizeDatabaseError(rawSensitiveErr);

    assert(sanitizedSensitive.statusCode === 500, 'Test 4.1: Returns HTTP 500 for unhandled exceptions');
    assert(sanitizedSensitive.error === 'INTERNAL_SERVER_ERROR', 'Test 4.2: Standard error code INTERNAL_SERVER_ERROR returned');
    assert(
      !sanitizedSensitive.message.includes('mongodb+srv') &&
      !sanitizedSensitive.message.includes('muskan30092000') &&
      !sanitizedSensitive.message.includes('cluster0'),
      'Test 4.3: Database credentials and connection strings strictly hidden from response'
    );

    // -------------------------------------------------------------------------
    // TEST 5: Express Pipeline Integration Test
    // -------------------------------------------------------------------------
    console.log('\n--- Section 5: Express Middleware Pipeline ---');

    const app = express();
    app.use((req, res, next) => {
      req.correlationId = 'TEST-CORR-19-XYZ';
      next();
    });

    app.get('/trigger-dup-error', (req, res, next) => {
      const err = new Error('E11000 duplicate key');
      err.code = 11000;
      err.keyPattern = { email: 1 };
      next(err);
    });

    app.get('/trigger-crash', (req, res, next) => {
      next(new Error('Internal driver timeout to cluster0.sneqypv.mongodb.net'));
    });

    app.use(errorMiddleware);

    const dupRes = await request(app).get('/trigger-dup-error');
    assert(dupRes.status === 409, 'Test 5.1: Pipeline maps duplicate error to HTTP 409');
    assert(dupRes.body.correlationId === 'TEST-CORR-19-XYZ', 'Test 5.2: Pipeline includes correlation ID');
    assert(dupRes.body.stack === undefined, 'Test 5.3: Pipeline NEVER exposes stack trace');

    const crashRes = await request(app).get('/trigger-crash');
    assert(crashRes.status === 500, 'Test 5.4: Pipeline maps crash to safe HTTP 500');
    assert(!crashRes.body.message.includes('cluster0'), 'Test 5.5: Database hostnames hidden in pipeline response');

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
