const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const assert = require('assert');

const PricingSettings = require('../models/pricingSettingsModel');
const pricingEngine = require('../services/pricingEngineV3Service');
const pricingController = require('../controllers/pricingV3Controller');

async function runTask43Tests() {
  console.log('======================================================');
  console.log('🚀 TASK 43: VERSIONED PRICING SETTINGS CRUD TEST');
  console.log('======================================================');

  console.log('[Task 43] Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI, {
    retryWrites: true,
    serverSelectionTimeoutMS: 15000,
  });
  console.log('[Task 43] Connected to MongoDB.');

  try {
    // --- TEST 1: Database Seeding & Active Settings Retrieval ---
    console.log('\n--- TEST 1: Database Seeding & Active Settings Retrieval ---');
    await pricingEngine.seedDefaultSettingsIfEmpty();

    const activeV3 = await PricingSettings.findOne({ version: 3 });
    assert(activeV3, 'PricingSettings version 3 must exist in database');
    assert.strictEqual(activeV3.isActive, true, 'Version 3 must be active by default');
    assert(activeV3.settings && activeV3.settings.arbeid, 'Settings must contain arbeid block');
    assert.strictEqual(activeV3.settings.comm.marge, 15, 'Default margin must be 15%');
    console.log(`  ✓ Seeded Document: Version=${activeV3.version}, Name="${activeV3.name}", isActive=${activeV3.isActive}`);

    let getSetStatus = 200, getSetData = null;
    await pricingController.getDefaultSettings({}, {
      status(c) { getSetStatus = c; return this; },
      json(d) { getSetData = d; return this; }
    });
    assert.strictEqual(getSetStatus, 200);
    assert.strictEqual(getSetData.version, 3);
    assert.strictEqual(getSetData.settings.comm.marge, 15);
    console.log('✓ TEST 1 PASSED: Version 3 settings seeded and successfully retrieved from database.');

    // --- TEST 2: Create New Pricing Version (v99) ---
    console.log('\n--- TEST 2: Create New Pricing Version (v99) ---');
    // Ensure clean start
    await PricingSettings.deleteOne({ version: 99 });

    let createStatus = 200, createData = null;
    await pricingController.createVersion({
      body: {
        version: 99,
        name: 'Pricing Version 99 - Test Clone',
        description: 'Synthetic test version cloned from v3',
        cloneFromVersion: 3,
        isActive: false,
      },
      user: { id: '67c05a32a7cf083dc7f2fbd6', role: 'Admin' }
    }, {
      status(c) { createStatus = c; return this; },
      json(d) { createData = d; return this; }
    });

    assert.strictEqual(createStatus, 201, 'createVersion must return 201 Created');
    assert.strictEqual(createData.version.version, 99);
    assert.strictEqual(createData.version.settings.comm.marge, 15);

    // Test duplicate creation
    let dupStatus = 200, dupData = null;
    await pricingController.createVersion({
      body: { version: 99 },
      user: { role: 'Admin' }
    }, {
      status(c) { dupStatus = c; return this; },
      json(d) { dupData = d; return this; }
    });
    assert.strictEqual(dupStatus, 409, 'Duplicate version must be rejected with 409 Conflict');
    console.log('✓ TEST 2 PASSED: New pricing version v99 created and duplicate blocked.');

    // --- TEST 3: Update Pricing Configuration in v99 ---
    console.log('\n--- TEST 3: Update Pricing Configuration in v99 ---');
    let updStatus = 200, updData = null;
    await pricingController.updateVersion({
      params: { version: '99' },
      body: {
        name: 'Pricing Version 99 - 25% Margin & €20 Wage',
        settings: {
          comm: { marge: 25 },
          arbeid: { loon: 20 },
        }
      },
      user: { role: 'Admin' }
    }, {
      status(c) { updStatus = c; return this; },
      json(d) { updData = d; return this; }
    });

    assert.strictEqual(updStatus, 200);
    const docV99 = await PricingSettings.findOne({ version: 99 });
    assert.strictEqual(docV99.settings.comm.marge, 25, 'Margin should be updated to 25%');
    assert.strictEqual(docV99.settings.arbeid.loon, 20, 'Loon should be updated to 20');
    assert.strictEqual(docV99.settings.comm.btw, 21, 'Other unedited settings must remain intact');
    console.log(`  ✓ Updated v99 Settings: marge=${docV99.settings.comm.marge}%, loon=€${docV99.settings.arbeid.loon}`);
    console.log('✓ TEST 3 PASSED: Version settings updated with deepMerge preservation.');

    // --- TEST 4: Version Activation Switching & Calculation Effects ---
    console.log('\n--- TEST 4: Version Activation Switching & Calculation Effects ---');
    // 4a. Activate version 99
    let actStatus = 200;
    await pricingController.activateVersion({
      params: { version: '99' },
      user: { role: 'Admin' }
    }, {
      status(c) { actStatus = c; return this; },
      json(d) { return this; }
    });
    assert.strictEqual(actStatus, 200);

    const checkV99 = await PricingSettings.findOne({ version: 99 });
    const checkV3 = await PricingSettings.findOne({ version: 3 });
    assert.strictEqual(checkV99.isActive, true, 'Version 99 should now be active');
    assert.strictEqual(checkV3.isActive, false, 'Version 3 should now be inactive');

    // 4b. Calculate with active settings (should reflect v99 higher price)
    const presetA = pricingEngine.PRESETS.A;
    let calc99Data = null;
    await pricingController.calculatePrice({ body: { job: presetA } }, {
      status(c) { return this; },
      json(d) { calc99Data = d; return this; }
    });
    console.log(`  Preset A under v99 (25% margin): fixed_price_shown = €${calc99Data.calculation.fixed_price_shown}`);
    assert(calc99Data.calculation.fixed_price_shown > 805, 'Price under v99 should be higher than standard €805');

    // 4c. Switch back to Version 3
    await pricingController.activateVersion({
      params: { version: '3' },
      user: { role: 'Admin' }
    }, {
      status(c) { return this; },
      json(d) { return this; }
    });

    const finalV3 = await PricingSettings.findOne({ version: 3 });
    assert.strictEqual(finalV3.isActive, true, 'Version 3 should be active again');

    let calc3Data = null;
    await pricingController.calculatePrice({ body: { job: presetA } }, {
      status(c) { return this; },
      json(d) { calc3Data = d; return this; }
    });
    console.log(`  Preset A under restored v3 (15% margin): fixed_price_shown = €${calc3Data.calculation.fixed_price_shown}`);
    assert.strictEqual(calc3Data.calculation.fixed_price_shown, 805, 'Restored v3 must produce authoritative €805');
    console.log('✓ TEST 4 PASSED: Dynamic activation switching accurately alters calculation pipeline.');

    // --- TEST 5: List Versions and Fetch Version by Number ---
    console.log('\n--- TEST 5: List Versions and Fetch Single Version ---');
    let listData = null;
    await pricingController.listVersions({}, {
      status(c) { return this; },
      json(d) { listData = d; return this; }
    });
    assert(listData.count >= 2, 'Should list at least versions 3 and 99');
    console.log(`  Listed ${listData.count} versions: [${listData.versions.map(v => `v${v.version}${v.isActive ? '*' : ''}`).join(', ')}]`);

    let getV3Data = null;
    await pricingController.getVersion({ params: { version: '3' } }, {
      status(c) { return this; },
      json(d) { getV3Data = d; return this; }
    });
    assert.strictEqual(getV3Data.version.version, 3);
    console.log('✓ TEST 5 PASSED: List and get endpoints returned structured version documents.');

    console.log('\n======================================================');
    console.log('ALL TASK 43 PRICING SETTINGS CRUD TESTS PASSED (5/5)');
    console.log('======================================================');

  } finally {
    console.log('\n[Cleanup] Cleaning up test version 99 and ensuring version 3 is active...');
    await PricingSettings.deleteOne({ version: 99 });
    await PricingSettings.updateOne({ version: 3 }, { $set: { isActive: true } });
    console.log('[Cleanup] Done.');
    await mongoose.connection.close();
  }
}

runTask43Tests().catch((err) => {
  console.error('[Task 43 Error]:', err);
  process.exit(1);
});
