const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const jwt = require('jsonwebtoken');

const authMiddleware = require('../middlewares/authMiddlerware');
const roleMiddleware = require('../middlewares/roleMiddleware');

function createMockReqRes({ token, user, body = {}, method = 'POST' }) {
  const req = {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    header(name) {
      return this.headers[name.toLowerCase()];
    },
    body,
    user,
  };

  let statusCode = 200;
  let responseData = null;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
    getStatusCode: () => statusCode,
    getData: () => responseData,
  };

  return { req, res };
}

async function runTask11Tests() {
  console.log('================================================================');
  console.log('🚀 TASK 11: DOCUMENT TEMPLATE ADMIN ROLE PROTECTION [UM3-011]');
  console.log('================================================================\n');

  const jwtSecret = process.env.JWT_SECRET || 'testsecret123';

  // 1. Test Unauthenticated Request (No Token)
  console.log('--- TEST 1: Unauthenticated request to templates mutation ---');
  {
    const { req, res } = createMockReqRes({ token: null });
    let nextCalled = false;
    await authMiddleware(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, false, 'authMiddleware must not proceed without token');
    assert.strictEqual(res.getStatusCode(), 401, 'Must return HTTP 401 without token');
    console.log('✓ TEST 1 PASSED: Unauthenticated request blocked with HTTP 401.\n');
  }

  // 2. Test Staff Role (Non-Admin) -> Must return 403 Forbidden
  console.log('--- TEST 2: Non-Admin (Staff) user attempting template mutation ---');
  {
    const staffUser = { id: '507f1f77bcf86cd799439011', role: 'Staff', username: 'john_staff' };
    const { req, res } = createMockReqRes({ user: staffUser });

    const guard = roleMiddleware(['Admin', 'SuperAdmin', 'admin', 'superadmin']);
    let nextCalled = false;
    guard(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, false, 'Staff user must NOT be allowed to create/modify templates');
    assert.strictEqual(res.getStatusCode(), 403, 'Must return HTTP 403 for Staff user');
    console.log(`✓ TEST 2 PASSED: Non-admin Staff user blocked with HTTP 403 ("${res.getData()?.msg}").\n`);
  }

  // 3. Test Admin Role -> Must pass roleMiddleware
  console.log('--- TEST 3: Admin user attempting template mutation ---');
  {
    const adminUser = { id: '507f1f77bcf86cd799439012', role: 'Admin', username: 'jane_admin' };
    const { req, res } = createMockReqRes({ user: adminUser });

    const guard = roleMiddleware(['Admin', 'SuperAdmin', 'admin', 'superadmin']);
    let nextCalled = false;
    guard(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, true, 'Admin user must pass roleMiddleware');
    assert.strictEqual(res.getStatusCode(), 200, 'Admin must not be blocked');
    console.log('✓ TEST 3 PASSED: Admin user authorized to manage templates.\n');
  }

  // 4. Test SuperAdmin Role -> Must pass roleMiddleware
  console.log('--- TEST 4: SuperAdmin user attempting template mutation ---');
  {
    const superAdminUser = { id: '507f1f77bcf86cd799439013', role: 'superadmin', username: 'boss_superadmin' };
    const { req, res } = createMockReqRes({ user: superAdminUser });

    const guard = roleMiddleware(['Admin', 'SuperAdmin', 'admin', 'superadmin']);
    let nextCalled = false;
    guard(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, true, 'superadmin user must pass roleMiddleware');
    assert.strictEqual(res.getStatusCode(), 200, 'superadmin must not be blocked');
    console.log('✓ TEST 4 PASSED: SuperAdmin user authorized to manage templates.\n');
  }

  console.log('================================================================');
  console.log('🎉 ALL TASK 11 DOCUMENT TEMPLATE AUTH TESTS PASSED (4/4)!');
  console.log('================================================================');
}

runTask11Tests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
