const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const User = require('../models/user');
const authMiddleware = require('../middlewares/authMiddlerware');

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

function mockResponse() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  return res;
}

async function runVerification() {
  console.log('\n======================================================');
  console.log('TASK 16 [UM3-031] AUTOMATED VERIFICATION: TOKEN LIFETIME & DEACTIVATION');
  console.log('======================================================\n');

  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGO_URI, {
      retryWrites: true,
      serverSelectionTimeoutMS: 15000,
    });
  }
  console.log('[Setup] Connected to MongoDB Atlas\n');

  const createdUserIds = [];

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Token Expiration Default (24h, NOT 100h)
    // -------------------------------------------------------------------------
    console.log('--- Section 1: Token Expiration Config ---');
    const jwtSecret = process.env.JWT_SECRET;
    const tokenDuration = process.env.JWT_EXPIRES_IN || '24h';

    const testPayload = { user: { id: new mongoose.Types.ObjectId(), role: 'Staff' } };
    const generatedToken = jwt.sign(testPayload, jwtSecret, { expiresIn: tokenDuration });
    const decoded = jwt.decode(generatedToken);

    const lifespanSeconds = decoded.exp - decoded.iat;
    assert(
      lifespanSeconds <= 86400 + 10 && lifespanSeconds >= 86400 - 10,
      'Test 1.1: Token duration strictly configured to 24 hours (86,400s), NOT 100 hours',
      `Actual lifespan: ${lifespanSeconds}s`
    );

    // -------------------------------------------------------------------------
    // TEST 2: Active User Token Works Normally
    // -------------------------------------------------------------------------
    console.log('\n--- Section 2: Active User Authentication ---');
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('TestPass123!', salt);

    const testUser = await User.create({
      username: `testuser_${Date.now()}`,
      email: `testuser_${Date.now()}@universalmovers.nl`,
      password: hashedPassword,
      role: 'Staff',
      isActive: true,
      isRestricted: false,
    });
    createdUserIds.push(testUser._id);

    const userToken = jwt.sign(
      { user: { id: testUser._id, role: 'Staff' }, userId: testUser._id },
      jwtSecret,
      { expiresIn: '24h' }
    );

    const reqActive = {
      header: (name) => (name.toLowerCase() === 'authorization' ? `Bearer ${userToken}` : null),
    };
    const resActive = mockResponse();
    let nextCalledActive = false;

    await authMiddleware(reqActive, resActive, () => {
      nextCalledActive = true;
    });

    assert(nextCalledActive === true, 'Test 2.1: Active user token passes through authMiddleware');
    assert(reqActive.user && reqActive.user.id.toString() === testUser._id.toString(), 'Test 2.2: req.user attached correctly');

    // -------------------------------------------------------------------------
    // TEST 3: Immediate Invalidation Upon Deactivation
    // -------------------------------------------------------------------------
    console.log('\n--- Section 3: Instant Deactivation Invalidation ---');
    testUser.isActive = false;
    await testUser.save();

    const reqDeactivated = {
      header: (name) => (name.toLowerCase() === 'authorization' ? `Bearer ${userToken}` : null),
    };
    const resDeactivated = mockResponse();
    let nextCalledDeactivated = false;

    await authMiddleware(reqDeactivated, resDeactivated, () => {
      nextCalledDeactivated = true;
    });

    assert(nextCalledDeactivated === false, 'Test 3.1: Deactivated user is blocked immediately');
    assert(resDeactivated.statusCode === 403, 'Test 3.2: HTTP status 403 Forbidden returned', `Actual status: ${resDeactivated.statusCode}`);
    assert(
      resDeactivated.body?.msg?.includes('deactivated'),
      'Test 3.3: Error message indicates account deactivation',
      `Body: ${JSON.stringify(resDeactivated.body)}`
    );

    // -------------------------------------------------------------------------
    // TEST 4: Immediate Invalidation Upon Restriction
    // -------------------------------------------------------------------------
    console.log('\n--- Section 4: Instant Restriction Invalidation ---');
    testUser.isActive = true;
    testUser.isRestricted = true;
    await testUser.save();

    const reqRestricted = {
      header: (name) => (name.toLowerCase() === 'authorization' ? `Bearer ${userToken}` : null),
    };
    const resRestricted = mockResponse();
    let nextCalledRestricted = false;

    await authMiddleware(reqRestricted, resRestricted, () => {
      nextCalledRestricted = true;
    });

    assert(nextCalledRestricted === false, 'Test 4.1: Restricted user is blocked immediately');
    assert(resRestricted.statusCode === 403, 'Test 4.2: HTTP status 403 Forbidden returned');

    // -------------------------------------------------------------------------
    // TEST 5: Out of Service Employee Invalidation
    // -------------------------------------------------------------------------
    console.log('\n--- Section 5: Out of Service Invalidation ---');
    testUser.isRestricted = false;
    testUser.outofservice = new Date(Date.now() - 86400000); // Yesterday
    await testUser.save();

    const reqOutOfService = {
      header: (name) => (name.toLowerCase() === 'authorization' ? `Bearer ${userToken}` : null),
    };
    const resOutOfService = mockResponse();
    let nextCalledOOS = false;

    await authMiddleware(reqOutOfService, resOutOfService, () => {
      nextCalledOOS = true;
    });

    assert(nextCalledOOS === false, 'Test 5.1: Out-of-service employee is blocked immediately');
    assert(resOutOfService.statusCode === 403, 'Test 5.2: HTTP status 403 Forbidden returned');
    assert(resOutOfService.body?.msg?.includes('out of service'), 'Test 5.3: Error message indicates out of service');

    // -------------------------------------------------------------------------
    // TEST 6: Deleted User Invalidation
    // -------------------------------------------------------------------------
    console.log('\n--- Section 6: Deleted User Token Invalidation ---');
    await User.findByIdAndDelete(testUser._id);
    const index = createdUserIds.indexOf(testUser._id);
    if (index > -1) createdUserIds.splice(index, 1);

    const reqDeleted = {
      header: (name) => (name.toLowerCase() === 'authorization' ? `Bearer ${userToken}` : null),
    };
    const resDeleted = mockResponse();
    let nextCalledDeleted = false;

    await authMiddleware(reqDeleted, resDeleted, () => {
      nextCalledDeleted = true;
    });

    assert(nextCalledDeleted === false, 'Test 6.1: Deleted user token is blocked');
    assert(resDeleted.statusCode === 401, 'Test 6.2: HTTP status 401 Unauthorized returned for removed user', `Actual status: ${resDeleted.statusCode}`);

  } catch (err) {
    console.error('Error during test execution:', err);
    failedTests++;
  } finally {
    console.log('\n--- Cleanup ---');
    if (createdUserIds.length > 0) {
      await User.deleteMany({ _id: { $in: createdUserIds } });
      console.log(`Cleaned up ${createdUserIds.length} test users.`);
    }
    await mongoose.disconnect();
    console.log('MongoDB disconnected.\n');
  }

  console.log('======================================================');
  console.log(`TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('======================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runVerification();
