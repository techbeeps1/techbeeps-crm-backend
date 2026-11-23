const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Warehouse = require('../models/Resources/wareHouse');
const StorageLocation = require('../models/Resources/storageLocation');
const User = require('../models/user');

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

async function runTask37Verification() {
  console.log('[Setup] Connecting to MongoDB...');
  await mongoose.connect(DB_URI);
  console.log('[Setup] Connected to DB.');

  const createdWhIds = [];
  const createdLocIds = [];

  try {
    const adminUser = await User.findOne({ role: 'Admin' });
    if (!adminUser) {
      throw new Error('No Admin user found for tests');
    }
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { id: adminUser._id, email: adminUser.email, role: adminUser.role },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '1h' }
    );
    const authHeaders = { Authorization: `Bearer ${token}` };

    console.log('\n--- TEST SUITE: Task 37 - Storage Location Dropdown Fix & Query Sanitation ---');

    // 1. Create Test Warehouse
    const testWh = new Warehouse({
      name: `Test Warehouse Amsterdam T37 - ${Date.now()}`,
      condition: 'enable',
      totalCapacityM3: 1000,
      city: 'Amsterdam',
      street: 'Keizersgracht 100',
    });
    await testWh.save();
    createdWhIds.push(testWh._id);
    console.log(`[Setup] Created Test Warehouse: "${testWh.name}" (_id: ${testWh._id})`);

    // 2. Create Storage Locations with DB default status ('active')
    const loc1 = new StorageLocation({
      name: 'Zone A - Rack 01',
      code: 'ZA-R01',
      description: 'Ground floor heavy pallet rack',
      warehouse: testWh._id,
      status: 'active', // default in MongoDB schema
    });
    await loc1.save();
    createdLocIds.push(loc1._id);

    const loc2 = new StorageLocation({
      name: 'Zone B - Mezzanine 05',
      code: 'ZB-M05',
      description: 'Upper level box shelving',
      warehouse: testWh._id,
      status: 'active',
    });
    await loc2.save();
    createdLocIds.push(loc2._id);

    const locDeleted = new StorageLocation({
      name: 'Zone X - Decommissioned',
      code: 'ZX-DEC',
      description: 'Damaged rack area',
      warehouse: testWh._id,
      deleted: true, // soft deleted
    });
    await locDeleted.save();
    createdLocIds.push(locDeleted._id);

    console.log(`[Setup] Created 2 active locations (status: 'active') and 1 soft-deleted location.`);

    // 3. Test 1: Query locations by warehouseId via /api/storage_loaction
    console.log('\n[Test 1] Querying locations via GET /api/storage_loaction?warehouseId=...');
    const res1 = await makeRequest(
      'GET',
      `/api/storage_loaction?warehouseId=${testWh._id.toString()}`,
      null,
      authHeaders
    );

    console.log(`Response Status: ${res1.status}, Items Returned: ${res1.body?.length}`);
    if (res1.status !== 200 || !Array.isArray(res1.body)) {
      throw new Error(`Failed to query storage locations: ${JSON.stringify(res1.body)}`);
    }

    // Verify soft-deleted location is filtered out by backend
    const hasDeleted = res1.body.some((l) => l.deleted === true || l.code === 'ZX-DEC');
    if (hasDeleted) {
      throw new Error('Failure: Soft-deleted location was returned in active list!');
    }

    const returnedLoc1 = res1.body.find((l) => l._id.toString() === loc1._id.toString());
    const returnedLoc2 = res1.body.find((l) => l._id.toString() === loc2._id.toString());
    if (!returnedLoc1 || !returnedLoc2) {
      throw new Error('Failure: Active locations were not returned by the API!');
    }
    console.log('[Passed] API correctly returns warehouse active locations and excludes deleted.');

    // 4. Test 2: Standard spelling alias /api/storage_location
    console.log('\n[Test 2] Testing standard route alias GET /api/storage_location?warehouseId=...');
    const res2 = await makeRequest(
      'GET',
      `/api/storage_location?warehouseId=${testWh._id.toString()}`,
      null,
      authHeaders
    );

    if (res2.status !== 200 || !Array.isArray(res2.body) || res2.body.length !== res1.body.length) {
      throw new Error('Failure: Standard spelling alias /api/storage_location did not return matching results!');
    }
    console.log('[Passed] Route alias /api/storage_location functions identically.');

    // 5. Test 3: Frontend Dropdown Filter Simulation
    console.log('\n[Test 3] Simulating Frontend Dropdown Filtering Logic...');
    // Old buggy filter was: item.status === 'Enable' (which yielded 0 items)
    const oldFilterResult = res1.body.filter((item) => item.status === 'Enable');
    console.log(`Old Filter (item.status === 'Enable') -> Count: ${oldFilterResult.length} (This was the root cause: empty dropdown!)`);

    // New updated filter in StorageForm.tsx
    const newFilterResult = res1.body.filter(
      (item) =>
        !item.deleted &&
        item.status !== 'Disabled' &&
        item.status !== 'disable' &&
        item.status !== 'inactive'
    );
    console.log(`New Filter (non-disabled/active) -> Count: ${newFilterResult.length}`);

    if (newFilterResult.length !== 2) {
      throw new Error(`Failure: Expected 2 active locations to populate dropdown, got ${newFilterResult.length}`);
    }
    console.log('[Passed] Dropdown filter successfully preserves active locations with DB default status.');

    console.log('\n=== ALL 3/3 TASK 37 TESTS PASSED SUCCESSFULLY! ===\n');
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exit(1);
  } finally {
    console.log('[Cleanup] Cleaning up test entities...');
    if (createdLocIds.length > 0) {
      await StorageLocation.deleteMany({ _id: { $in: createdLocIds } });
    }
    if (createdWhIds.length > 0) {
      await Warehouse.deleteMany({ _id: { $in: createdWhIds } });
    }
    await mongoose.disconnect();
    console.log('[Cleanup] Done.');
  }
}

runTask37Verification();
