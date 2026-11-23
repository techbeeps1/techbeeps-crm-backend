/**
 * Task 39: Vehicle Fuel Card Security & Sensitive Field Removal Verification Test
 * 
 * Verifies:
 * 1. Vehicle Mongoose model schema does NOT store Fuel Card CVC or PIN code.
 * 2. Vehicle controller strips any incoming CVC or PIN code on creation and update.
 * 3. Only safe fields (supplier, cardNumber) are stored and returned.
 * 4. Zero sensitive payment card credentials in vehicle fleet database (PCI-DSS compliance).
 */

const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Vehicle = require('../models/Resources/vehicle');
const vehicleController = require('../controllers/Resources/vehicleController');

async function runTask39Tests() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is not set in .env');
  }

  console.log('[Task 39] Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('[Task 39] Connected to MongoDB successfully.');

  const createdVehicleIds = [];

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
    // TEST 1: Model Schema Rejection of CVC and PIN
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 1: Vehicle Model Fuel Card Schema Verification ---');
    const directVehicle = new Vehicle({
      name: 'Synthetic Test Truck Task 39',
      vehicleType: 'Truck',
      licensePlate: 'TEST-39-NL',
      fuelCard: {
        supplier: 'Shell Fleet Card',
        cardNumber: '1111222233334444',
        cvc: '789', // Should be ignored by schema
        pincode: '4321', // Should be ignored by schema
      },
    });

    const savedDirect = await directVehicle.save();
    createdVehicleIds.push(savedDirect._id);

    // Fetch raw object directly from DB to verify schema strictness
    const fetchedRaw = await Vehicle.findById(savedDirect._id).lean();
    console.log('Saved Fuel Card in DB:', JSON.stringify(fetchedRaw.fuelCard));

    if (fetchedRaw.fuelCard.cvc !== undefined || fetchedRaw.fuelCard.pincode !== undefined) {
      throw new Error(`Security Violation: CVC or PIN was stored in DB! cvc=${fetchedRaw.fuelCard.cvc}, pincode=${fetchedRaw.fuelCard.pincode}`);
    }
    if (fetchedRaw.fuelCard.supplier !== 'Shell Fleet Card' || fetchedRaw.fuelCard.cardNumber !== '1111222233334444') {
      throw new Error('Safe fields (supplier, cardNumber) were not saved correctly.');
    }
    console.log('✓ TEST 1 PASSED: Vehicle schema strictly rejects CVC and PIN code.');

    // -------------------------------------------------------------------------
    // TEST 2: Controller Sanitization on Create Vehicle
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Controller Strips CVC & PIN on Create ---');
    const reqCreate = {
      body: {
        name: 'Synthetic Delivery Van Task 39',
        vehicleType: 'Van',
        licensePlate: 'VAN-39-NL',
        fuelCard: {
          supplier: 'BP Plus Card',
          cardNumber: '5555666677778888',
          cvc: '123',
          pincode: '9999',
          pin: '9999',
        },
      },
    };
    const resCreate = createResMock();
    await vehicleController.createVehicle(reqCreate, resCreate);

    if (resCreate.statusCode !== 201 || !resCreate.data?._id) {
      throw new Error(`Failed to create vehicle via controller: ${JSON.stringify(resCreate.data)}`);
    }
    const createdVehicleId = resCreate.data._id;
    createdVehicleIds.push(createdVehicleId);

    const fetchedCreated = await Vehicle.findById(createdVehicleId).lean();
    console.log('Created Vehicle Fuel Card via Controller:', JSON.stringify(fetchedCreated.fuelCard));

    if (fetchedCreated.fuelCard.cvc !== undefined || fetchedCreated.fuelCard.pincode !== undefined || fetchedCreated.fuelCard.pin !== undefined) {
      throw new Error(`Security Violation: Controller failed to strip CVC/PIN on creation!`);
    }
    if (fetchedCreated.fuelCard.supplier !== 'BP Plus Card' || fetchedCreated.fuelCard.cardNumber !== '5555666677778888') {
      throw new Error('Safe fuelCard data was not preserved on creation.');
    }
    console.log('✓ TEST 2 PASSED: Controller successfully strips sensitive CVC/PIN on vehicle creation.');

    // -------------------------------------------------------------------------
    // TEST 3: Controller Sanitization on Update Vehicle
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Controller Strips CVC & PIN on Update ---');
    const reqUpdate = {
      params: { id: createdVehicleId.toString() },
      body: {
        fuelCard: {
          supplier: 'TotalEnergies Card',
          cardNumber: '9999888877776666',
          cvc: '456',
          pincode: '1111',
        },
      },
    };
    const resUpdate = createResMock();
    await vehicleController.updateVehicleById(reqUpdate, resUpdate);

    if (resUpdate.statusCode !== 200) {
      throw new Error(`Failed to update vehicle via controller: ${JSON.stringify(resUpdate.data)}`);
    }

    const fetchedUpdated = await Vehicle.findById(createdVehicleId).lean();
    console.log('Updated Vehicle Fuel Card via Controller:', JSON.stringify(fetchedUpdated.fuelCard));

    if (fetchedUpdated.fuelCard.cvc !== undefined || fetchedUpdated.fuelCard.pincode !== undefined) {
      throw new Error(`Security Violation: Controller failed to strip CVC/PIN on update!`);
    }
    if (fetchedUpdated.fuelCard.supplier !== 'TotalEnergies Card' || fetchedUpdated.fuelCard.cardNumber !== '9999888877776666') {
      throw new Error('Safe fuelCard updated data was not preserved.');
    }
    console.log('✓ TEST 3 PASSED: Controller successfully strips sensitive CVC/PIN on vehicle update.');

    console.log('\n=============================================================');
    console.log('ALL TASK 39 VEHICLE FUEL CARD SECURITY TESTS PASSED (3/3)');
    console.log('=============================================================');
  } finally {
    console.log('\n[Cleanup] Cleaning up synthetic vehicle test records...');
    for (const vId of createdVehicleIds) {
      await Vehicle.findByIdAndDelete(vId);
    }
    console.log('[Cleanup] Cleaned up synthetic fixtures safely.');
    await mongoose.disconnect();
  }
}

runTask39Tests()
  .then(() => {
    console.log('[Task 39] Verification completed successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[Task 39] Verification failed with error:', err);
    process.exit(1);
  });
