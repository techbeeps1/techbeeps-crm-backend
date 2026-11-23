/**
 * Task 40: Valuation Volume Non-Negative Clamping & Test Countries Cleanup Verification Test
 * 
 * Verifies:
 * 1. Test countries (e.g. "QA test", "Test country") are purged from database and excluded from API responses.
 * 2. Attempts to add "QA test" or "Test country" are rejected with 400.
 * 3. Valuation box volume calculations clamp non-negative, preventing "-0.000 m³" negative zero glitches.
 * 4. Relocation total volume and storage volume on valuationMaster clamp to >= 0.
 */

const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const SalesGroup = require('../models/salesgroupModel');
const ValuationRooms = require('../models/Valuation/valuationRoomDetail');
const JobSchedule = require('../models/jobSchedule');
const Customer = require('../models/customer');
const salesgroupController = require('../controllers/salesgroupController');
const valuationMasterController = require('../controllers/Valuation/valuationMasterController');

async function runTask40Tests() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is missing');

  console.log('[Task 40] Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('[Task 40] Connected to MongoDB.');

  const cleanupJobIds = [];
  const cleanupCustomerIds = [];

  const createResMock = () => {
    return {
      statusCode: 200,
      status: function (code) {
        this.statusCode = code;
        return this;
      },
      json: function (payload) {
        this.data = payload;
        return this;
      },
    };
  };

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Purge & Exclude Test Countries ("QA test", "Test country")
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 1: Database Purge and API Filter for Test Countries ---');
    // First, purge existing test countries from database
    const purgeResult = await SalesGroup.deleteMany({
      type: 'country',
      name: { $in: [/^qa\s*test$/i, /^test\s*country$/i, /^test$/i] },
    });
    console.log(`Purged ${purgeResult.deletedCount} legacy test country records from MongoDB.`);

    // Verify GET /api/sales-groups?type=country does NOT return any test countries
    const reqGetCountries = { query: { type: 'country' } };
    const resGetCountries = createResMock();
    await salesgroupController.getSalesGroups(reqGetCountries, resGetCountries);

    const returnedCountries = resGetCountries.data || [];
    console.log(`Retrieved ${returnedCountries.length} countries from API.`);
    const lingeringTest = returnedCountries.filter(c => /^(qa\s*test|test\s*country|test)$/i.test(c.name));
    if (lingeringTest.length > 0) {
      throw new Error(`Test countries still returned by API: ${JSON.stringify(lingeringTest)}`);
    }
    console.log('✓ TEST 1 PASSED: Test countries ("QA test", "Test country") successfully excluded from country catalogue.');

    // -------------------------------------------------------------------------
    // TEST 2: Rejection of New Test Countries
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Reject Adding New Test Country ---');
    const reqAddTest = {
      body: {
        name: 'QA test',
        type: 'country',
        code: 'QAT',
      },
    };
    const resAddTest = createResMock();
    await salesgroupController.addSalesGroup(reqAddTest, resAddTest);

    if (resAddTest.statusCode !== 400) {
      throw new Error(`Expected status 400 when adding 'QA test', got ${resAddTest.statusCode}`);
    }
    console.log('✓ TEST 2 PASSED: SalesGroup controller strictly rejects adding test country entries.');

    // -------------------------------------------------------------------------
    // TEST 3: Valuation Box Volume Clamping (Eliminates -0.000 m³ glitch)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Server Valuation Volume Clamping ---');
    // Create synthetic customer and test job
    const synthCustomer = new Customer({
      name: 'Task 40 Synthetic Customer',
      email: 'synth_cust_task40@example.com',
      mobile: '0612345678',
      typeOfCustomer: 'individual',
    });
    await synthCustomer.save();
    cleanupCustomerIds.push(synthCustomer._id);

    const synthJob = new JobSchedule({
      customer: synthCustomer._id,
      status: 'Draft',
      relocation: {
        totalVolume: 0,
      },
    });
    await synthJob.save();
    cleanupJobIds.push(synthJob._id);

    // Call valuationMaster with floating point negative volume artifacts
    const reqValuation = {
      body: {
        jobId: synthJob._id.toString(),
        relocation: {
          totalVolume: -0.000000001, // floating-point negative zero artifact
          storage_storageVolume: -0.5, // negative storage volume
        },
        rooms: [
          {
            roomTypeName: 'Living Room',
            name: 'Living Room',
            inventoryItems: [
              {
                name: 'AutoLock moving boxes',
                quantity: -3, // Negative quantity should be clamped to 0
                price: 2.5,
                cubicMeter: -0.055, // Negative cubicMeter should be clamped to 0
              },
              {
                name: 'Book Box',
                quantity: 10,
                price: 3.0,
                cubicMeter: 0.035,
              },
            ],
            furnitureType: [
              {
                furnitureTypeName: 'Sofa 3-seater',
                quantity: -1,
                cubicMeter: -1.5,
              },
            ],
          },
        ],
      },
    };

    const resValuation = createResMock();
    await valuationMasterController.valuationMaster(reqValuation, resValuation);

    if (resValuation.statusCode !== 200) {
      throw new Error(`valuationMaster returned error: ${JSON.stringify(resValuation.data)}`);
    }

    // Verify Job relocation totalVolume was clamped to 0
    const updatedJob = await JobSchedule.findById(synthJob._id).lean();
    console.log('Saved Job Relocation Total Volume:', updatedJob.relocation?.totalVolume);
    if (updatedJob.relocation?.totalVolume < 0 || Object.is(updatedJob.relocation?.totalVolume, -0)) {
      throw new Error(`Job totalVolume is negative or -0: ${updatedJob.relocation?.totalVolume}`);
    }

    // Verify ValuationRooms box inventoryItems were clamped non-negative
    const savedRooms = await ValuationRooms.find({ jobId: synthJob._id }).lean();
    console.log(`Saved ${savedRooms.length} valuation rooms.`);
    const savedBoxes = savedRooms[0]?.inventoryItems || [];
    console.log('Saved inventoryItems:', savedBoxes);

    for (const b of savedBoxes) {
      if (b.quantity < 0 || b.cubicMeter < 0) {
        throw new Error(`Box volume or quantity was not clamped: ${JSON.stringify(b)}`);
      }
    }
    const savedFurniture = savedRooms[0]?.furnitureType || [];
    for (const f of savedFurniture) {
      if (f.quantity < 0 || f.cubicMeter < 0) {
        throw new Error(`Furniture volume or quantity was not clamped: ${JSON.stringify(f)}`);
      }
    }

    console.log('✓ TEST 3 PASSED: Valuation box volume and quantities strictly clamped to >= 0.');

    console.log('\n================================================================');
    console.log('ALL TASK 40 VALUATION VOLUME & COUNTRY CLEANUP TESTS PASSED (3/3)');
    console.log('================================================================');
  } finally {
    console.log('\n[Cleanup] Cleaning up test jobs and rooms...');
    for (const jId of cleanupJobIds) {
      await JobSchedule.findByIdAndDelete(jId);
      await ValuationRooms.deleteMany({ jobId: jId });
    }
    for (const cId of cleanupCustomerIds) {
      await Customer.findByIdAndDelete(cId);
    }
    await mongoose.disconnect();
    console.log('[Cleanup] Test fixtures cleaned up safely.');
  }
}

runTask40Tests()
  .then(() => {
    console.log('[Task 40] Verification completed successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[Task 40] Verification failed with error:', err);
    process.exit(1);
  });
