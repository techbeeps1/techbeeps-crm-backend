const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const BASE_URL = 'http://localhost:8080';
const Warehouse = require('../models/Resources/wareHouse');
const Storage = require('../models/Resources/storageModel');
const Customer = require('../models/customer');
const Invoice = require('../models/invoice');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passCount++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failCount++;
  }
}

async function runTests() {
  console.log('===============================================================');
  console.log('EXEC-34 TEST SUITE: STORAGE ALLOCATION & RECURRING BILLING');
  console.log('===============================================================');

  const createdStorageIds = [];
  const createdWarehouseIds = [];
  const createdCustomerIds = [];
  const createdInvoiceIds = [];

  try {
    // 0. Connect DB & generate Auth token
    await mongoose.connect(process.env.MONGO_URI);
    console.log('[Setup] Connected to MongoDB');

    const jwtSecret = process.env.JWT_SECRET || 'techbeeps_crm_default_jwt_secret_key_2026';
    const adminId = new mongoose.Types.ObjectId();
    const adminToken = jwt.sign(
      { userId: adminId.toString(), role: 'Admin', username: 'Warehouse Storage Admin' },
      jwtSecret,
      { expiresIn: '1h' }
    );
    const authHeaders = {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    };

    // --- Section 1: Storage Volume Validation ---
    console.log('\n--- Section 1: Storage Volume Validation ---');

    // 1.1 Reject volume <= 0
    try {
      await axios.post(
        `${BASE_URL}/api/storages`,
        {
          storageCode: `TEST-VOL-ZERO-${Date.now()}`,
          storageType: 'Chest Unit',
          cubicMeter: 0,
        },
        authHeaders
      );
      assert(false, 'Expected HTTP 400 for 0 m³ storage volume');
    } catch (err) {
      assert(
        err.response?.status === 400 && err.response?.data?.code === 'INVALID_STORAGE_VOLUME',
        'API rejects 0 m³ storage volume with HTTP 400 INVALID_STORAGE_VOLUME'
      );
    }

    // 1.2 Reject negative volume
    try {
      await axios.post(
        `${BASE_URL}/api/storages`,
        {
          storageCode: `TEST-VOL-NEG-${Date.now()}`,
          storageType: 'Chest Unit',
          cubicMeter: -15,
        },
        authHeaders
      );
      assert(false, 'Expected HTTP 400 for negative volume');
    } catch (err) {
      assert(
        err.response?.status === 400 && err.response?.data?.code === 'INVALID_STORAGE_VOLUME',
        'API rejects negative storage volume with HTTP 400 INVALID_STORAGE_VOLUME'
      );
    }

    // 1.3 Create valid standalone storage unit
    const validCode = `TEST-ST-VALID-${Date.now()}`;
    const validRes = await axios.post(
      `${BASE_URL}/api/storages`,
      {
        storageCode: validCode,
        storageType: 'Container Unit',
        cubicMeter: 25,
        selfOwned: true,
        price: 120,
      },
      authHeaders
    );
    assert(validRes.status === 201, 'Valid storage unit created with HTTP 201');
    assert(validRes.data.cubicMeter === 25, 'Storage unit volume accurately recorded (25 m³)');
    assert(validRes.data.storageStatus === 'free', 'Initial storageStatus defaults to "free"');
    createdStorageIds.push(validRes.data._id);

    // --- Section 2: Warehouse Total Capacity & 120% Allocation Block ---
    console.log('\n--- Section 2: Warehouse Total Capacity & 120% Allocation Block ---');

    // 2.1 Create warehouse with rated capacity of 100 m³ (120% cap = 120 m³)
    const whRes = await axios.post(
      `${BASE_URL}/api/warehouses`,
      {
        name: `QA Test Warehouse Amsterdam ${Date.now()}`,
        postcode: '1012 AB',
        houseNumber: '10',
        street: 'Damrak',
        city: 'Amsterdam',
        country: 'Netherlands',
        totalCapacityM3: 100,
        condition: 'enable',
      },
      authHeaders
    );
    assert(whRes.status === 201, 'Warehouse created successfully with totalCapacityM3 = 100');
    const testWhId = whRes.data.warehouse._id;
    createdWarehouseIds.push(testWhId);

    // 2.2 Allocate 70 m³ into warehouse (70 m³ <= 120 m³)
    const st1Res = await axios.post(
      `${BASE_URL}/api/storages`,
      {
        storageCode: `TEST-WH-ST1-${Date.now()}`,
        storageType: 'Large Room',
        cubicMeter: 70,
        warehouse: testWhId,
        price: 250,
      },
      authHeaders
    );
    assert(st1Res.status === 201, 'Storage unit 1 (70 m³) allocated successfully into warehouse');
    createdStorageIds.push(st1Res.data._id);

    // 2.3 Allocate 40 m³ into warehouse (Total = 110 m³ <= 120 m³, utilizes buffer)
    const st2Res = await axios.post(
      `${BASE_URL}/api/storages`,
      {
        storageCode: `TEST-WH-ST2-${Date.now()}`,
        storageType: 'Medium Room',
        cubicMeter: 40,
        warehouse: testWhId,
        price: 180,
      },
      authHeaders
    );
    assert(st2Res.status === 201, 'Storage unit 2 (40 m³) allocated (Total: 110 m³, within 120% limit)');
    createdStorageIds.push(st2Res.data._id);

    // 2.4 Attempt to allocate 15 m³ (Projected Total = 125 m³ > 120 m³ -> MUST BE BLOCKED)
    try {
      await axios.post(
        `${BASE_URL}/api/storages`,
        {
          storageCode: `TEST-WH-OVERFLOW-${Date.now()}`,
          storageType: 'Small Room',
          cubicMeter: 15,
          warehouse: testWhId,
          price: 90,
        },
        authHeaders
      );
      assert(false, 'Expected HTTP 422 for allocating beyond 120% warehouse capacity');
    } catch (err) {
      assert(
        err.response?.status === 422 && err.response?.data?.code === 'WAREHOUSE_CAPACITY_EXCEEDED',
        'API strictly blocks allocation exceeding 120% warehouse capacity with HTTP 422 WAREHOUSE_CAPACITY_EXCEEDED'
      );
      assert(
        err.response?.data?.details?.ratedCapacity === 100 &&
        err.response?.data?.details?.maxAllowedM3 === 120 &&
        err.response?.data?.details?.currentAllocatedM3 === 110 &&
        err.response?.data?.details?.attemptedAdditionM3 === 15 &&
        err.response?.data?.details?.excessM3 === 5,
        'Capacity error response returns exact diagnostic metrics (Rated: 100, Max: 120, Current: 110, Attempt: 15, Excess: 5)'
      );
    }

    // --- Section 3: Storage Update Capacity Guard ---
    console.log('\n--- Section 3: Storage Update Capacity Guard ---');

    // 3.1 Updating existing unit 2 from 40 m³ to 60 m³ (Projected total: 70 + 60 = 130 m³ > 120 m³)
    try {
      await axios.post(
        `${BASE_URL}/api/storages/${st2Res.data._id}`,
        {
          cubicMeter: 60,
        },
        authHeaders
      );
      assert(false, 'Expected HTTP 422 when updating storage to exceed 120% warehouse capacity');
    } catch (err) {
      assert(
        err.response?.status === 422 && err.response?.data?.code === 'WAREHOUSE_CAPACITY_EXCEEDED',
        'API strictly blocks updating storage volume to exceed 120% warehouse limit (HTTP 422)'
      );
    }

    // 3.2 Updating existing unit 2 from 40 m³ to 45 m³ (Projected total: 70 + 45 = 115 m³ <= 120 m³)
    const updateRes = await axios.post(
      `${BASE_URL}/api/storages/${st2Res.data._id}`,
      {
        cubicMeter: 45,
      },
      authHeaders
    );
    assert(updateRes.status === 200, 'Valid storage volume update (45 m³, total: 115 m³) succeeds with HTTP 200');
    assert(updateRes.data.updatedStorage?.cubicMeter === 45, 'Storage unit updated volume confirmed at 45 m³');

    // --- Section 4: Storage Occupancy & Customer Collision Guard ---
    console.log('\n--- Section 4: Storage Occupancy & Customer Collision Guard ---');

    // 4.1 Create Customer A and Customer B
    const custA = await Customer.create({
      firstName: 'Jan',
      lastName: 'de Vries',
      email: `jan.devries.${Date.now()}@example.nl`,
      contactNumber: '0612345678',
    });
    createdCustomerIds.push(custA._id);

    const custB = await Customer.create({
      firstName: 'Sophie',
      lastName: 'Bakker',
      email: `sophie.bakker.${Date.now()}@example.nl`,
      contactNumber: '0687654321',
    });
    createdCustomerIds.push(custB._id);

    // 4.2 Assign Customer A and mark storage "In use"
    const assignCustARes = await axios.post(
      `${BASE_URL}/api/storages/${validRes.data._id}`,
      {
        customer: custA._id,
        storageStatus: 'In use',
        invoicingStartDate: new Date('2026-09-01'),
        price: 150,
        invoicingPeriod: 'monthly',
        includingVat: 'Including VAT',
      },
      authHeaders
    );
    assert(assignCustARes.status === 200, 'Customer A assigned and storage status transitioned to "In use"');

    // 4.3 Attempt to overwrite with Customer B while storage is still "In use"
    try {
      await axios.post(
        `${BASE_URL}/api/storages/${validRes.data._id}`,
        {
          customer: custB._id,
          storageStatus: 'In use',
        },
        authHeaders
      );
      assert(false, 'Expected HTTP 409 for colliding customer assignment on occupied storage');
    } catch (err) {
      assert(
        err.response?.status === 409 && err.response?.data?.code === 'STORAGE_ALREADY_OCCUPIED',
        'API blocks reassigning occupied storage to another customer with HTTP 409 STORAGE_ALREADY_OCCUPIED'
      );
    }

    // 4.4 Empty storage unit
    const emptyRes = await axios.put(
      `${BASE_URL}/api/empty-storage/${validRes.data._id}`,
      {},
      authHeaders
    );
    assert(emptyRes.status === 200, 'Empty storage endpoint returns HTTP 200');
    assert(emptyRes.data.storage?.storageStatus === 'free', 'Emptied storage status reset to "free"');
    assert(emptyRes.data.storage?.customer === null, 'Emptied storage customer reference reset to null');

    // 4.5 Now assign Customer B to the freed storage
    const assignCustBRes = await axios.post(
      `${BASE_URL}/api/storages/${validRes.data._id}`,
      {
        customer: custB._id,
        storageStatus: 'In use',
        invoicingStartDate: new Date('2026-09-01'),
        price: 150,
        invoicingPeriod: 'monthly',
        includingVat: 'Including VAT',
      },
      authHeaders
    );
    assert(assignCustBRes.status === 200, 'Freed storage successfully assigned to Customer B');

    // --- Section 5: Live Warehouse Capacity Enriched API ---
    console.log('\n--- Section 5: Live Warehouse Capacity Enriched API ---');

    // 5.1 Enriched getAllWarehouses
    const allWhRes = await axios.get(`${BASE_URL}/api/warehouses`, authHeaders);
    assert(allWhRes.status === 200, 'GET /api/warehouses returns HTTP 200');
    const matchedWh = allWhRes.data.find(w => String(w._id) === String(testWhId));
    assert(matchedWh !== undefined, 'Created test warehouse found in list');
    assert(matchedWh.totalCapacityM3 === 100, 'Warehouse rated capacity reported as 100 m³');
    assert(matchedWh.allocatedM3 === 115, 'Warehouse live allocated volume computed accurately (70 + 45 = 115 m³)');
    assert(matchedWh.maxAllowedM3 === 120, 'Warehouse 120% max allowed reported as 120 m³');
    assert(matchedWh.utilizationPercentage === 115, 'Warehouse utilization percentage computed as 115%');
    assert(matchedWh.remainingM3 === 5, 'Remaining volume before 120% overflow reported as 5 m³');

    // 5.2 Warehouse capacity endpoint
    const whCapRes = await axios.get(`${BASE_URL}/api/warehouses/${testWhId}/capacity`, authHeaders);
    assert(whCapRes.status === 200, 'GET /api/warehouses/:id/capacity returns HTTP 200');
    assert(whCapRes.data.storageCount === 2, 'Warehouse capacity endpoint reports 2 storage units');
    assert(Array.isArray(whCapRes.data.storages) && whCapRes.data.storages.length === 2, 'Roster of storages returned');

    // 5.3 Capacity pre-check endpoint
    const checkValidRes = await axios.get(
      `${BASE_URL}/api/storages/capacity-check?warehouseId=${testWhId}&cubicMeter=4`,
      authHeaders
    );
    assert(checkValidRes.data.valid === true, 'Capacity check endpoint allows 4 m³ (Total: 119 <= 120 m³)');

    const checkOverRes = await axios.get(
      `${BASE_URL}/api/storages/capacity-check?warehouseId=${testWhId}&cubicMeter=10`,
      authHeaders
    );
    assert(
      checkOverRes.data.valid === false && checkOverRes.data.code === 'WAREHOUSE_CAPACITY_EXCEEDED',
      'Capacity check endpoint detects 10 m³ overflow (Total: 125 > 120 m³)'
    );

    // --- Section 6: Recurring Storage Invoicing & Billing Scheduler ---
    console.log('\n--- Section 6: Recurring Storage Invoicing & Billing Scheduler ---');

    // 6.1 Check pending billing as of 2026-11-01 (should find 2026-09, 2026-10, 2026-11 = 3 cycles)
    const asOfDate = '2026-11-01';
    const pendingRes = await axios.get(
      `${BASE_URL}/api/storages/pending-billing?asOfDate=${asOfDate}`,
      authHeaders
    );
    assert(pendingRes.status === 200, 'GET /api/storages/pending-billing returns HTTP 200');
    assert(pendingRes.data.pendingCount >= 3, `Discovered at least 3 pending billing cycles (got: ${pendingRes.data.pendingCount})`);

    const customerBPending = pendingRes.data.pendingItems.filter(
      p => String(p.storageId) === String(validRes.data._id)
    );
    assert(customerBPending.length === 3, 'Found exactly 3 monthly billing cycles for Customer B (Sept, Oct, Nov)');
    assert(customerBPending[0].periodKey === '2026-09', 'First period key is 2026-09');
    assert(customerBPending[1].periodKey === '2026-10', 'Second period key is 2026-10');
    assert(customerBPending[2].periodKey === '2026-11', 'Third period key is 2026-11');

    // 6.2 Process recurring billing for Customer B
    const processRes = await axios.post(
      `${BASE_URL}/api/storages/process-recurring-billing`,
      {
        asOfDate,
        storageIds: [validRes.data._id],
      },
      authHeaders
    );
    assert(processRes.status === 200, 'POST /api/storages/process-recurring-billing returns HTTP 200');
    assert(processRes.data.processedCount === 3, 'Successfully processed 3 monthly invoices for Customer B');
    assert(processRes.data.totalBilledAmount === 450, 'Total billed amount accurately summed to €450.00 (€150 x 3)');

    processRes.data.generatedInvoices.forEach(inv => {
      createdInvoiceIds.push(inv.invoiceId);
    });

    // 6.3 Verify storage document state
    const billedStorageDoc = await Storage.findById(validRes.data._id).lean();
    assert(
      billedStorageDoc.invoicedPeriods.includes('2026-09') &&
      billedStorageDoc.invoicedPeriods.includes('2026-10') &&
      billedStorageDoc.invoicedPeriods.includes('2026-11'),
      'Storage document invoicedPeriods properly saved ["2026-09", "2026-10", "2026-11"]'
    );

    // 6.4 IDEMPOTENCY CHECK: Run recurring billing again for the same date
    const repeatRes = await axios.post(
      `${BASE_URL}/api/storages/process-recurring-billing`,
      {
        asOfDate,
        storageIds: [validRes.data._id],
      },
      authHeaders
    );
    assert(repeatRes.status === 200, 'Repeat execution returns HTTP 200');
    assert(
      repeatRes.data.processedCount === 0 && repeatRes.data.totalBilledAmount === 0,
      'Idempotency verified: Repeat run produces exactly 0 duplicate invoices and €0 billed amount'
    );

    // 6.5 Verify pending endpoint reports 0 for Customer B
    const postPendingRes = await axios.get(
      `${BASE_URL}/api/storages/pending-billing?asOfDate=${asOfDate}&storageId=${validRes.data._id}`,
      authHeaders
    );
    assert(
      postPendingRes.data.pendingCount === 0,
      'Pending billing list for Customer B is now empty (all periods up to date)'
    );

    // --- Section 7: Baseline Invariant Check ---
    console.log('\n--- Section 7: Baseline Invariant Check ---');
    const baselineInv = await Invoice.findOne({
      $or: [
        { invoiceNumber: '2026/0025' },
        { index: '2026/0025' },
        { invoiceNumber: '#2026/0025' },
        { index: '#2026/0025' },
      ],
    }).lean();
    assert(baselineInv !== null, 'Baseline invoice #2026/0025 preserved in database');
    const baselineTotal = Number(baselineInv.total || baselineInv.amount || 0);
    assert(
      Math.abs(baselineTotal - 746.39) < 0.01,
      `Baseline invoice #2026/0025 total strictly preserved at €746.39 (actual: €${baselineTotal})`
    );

    const pdfRes = await axios.post(
      `${BASE_URL}/invoice/download`,
      { Id: baselineInv._id },
      {
        headers: { Authorization: `Bearer ${adminToken}` },
        responseType: 'arraybuffer',
        timeout: 15000,
      }
    );
    assert(pdfRes.status === 200, 'Baseline invoice PDF endpoint returns HTTP 200');
    assert(pdfRes.data.length > 50000, `Baseline invoice PDF payload is healthy (${pdfRes.data.length} bytes)`);

  } catch (error) {
    console.error('[FATAL] Unexpected error during test run:', error.message);
    if (error.response?.data) {
      console.error('Response data:', error.response.data);
    }
    failCount++;
  } finally {
    // Cleanup
    console.log('\n[Cleanup] Cleaning up test fixtures...');
    if (createdStorageIds.length > 0) {
      await Storage.deleteMany({ _id: { $in: createdStorageIds } });
    }
    if (createdWarehouseIds.length > 0) {
      await Warehouse.deleteMany({ _id: { $in: createdWarehouseIds } });
    }
    if (createdCustomerIds.length > 0) {
      await Customer.deleteMany({ _id: { $in: createdCustomerIds } });
    }
    if (createdInvoiceIds.length > 0) {
      await Invoice.deleteMany({ _id: { $in: createdInvoiceIds } });
    }
    console.log('[Cleanup] Cleanup complete.');
    await mongoose.disconnect();
  }

  console.log('\n===============================================================');
  console.log(`EXEC-34 TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('===============================================================');

  process.exit(failCount > 0 ? 1 : 0);
}

runTests();
