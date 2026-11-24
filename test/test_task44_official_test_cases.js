const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const assert = require('assert');

const pricingEngine = require('../services/pricingEngineV3Service');
const PricingSettings = require('../models/pricingSettingsModel');
const pricingController = require('../controllers/pricingV3Controller');

const r2 = (x) => Math.round(Number(x || 0) * 100) / 100;

async function runTask44OfficialTests() {
  console.log('================================================================');
  console.log('🚀 TASK 44: RUNNING ALL 11 OFFICIAL PRICING ENGINE V3 TEST CASES');
  console.log('================================================================');

  console.log('[Task 44] Connecting to MongoDB Atlas...');
  await mongoose.connect(process.env.MONGO_URI, {
    retryWrites: true,
    serverSelectionTimeoutMS: 15000,
  });
  console.log('[Task 44] Connected to MongoDB Atlas.');

  try {
    // 1. Ensure DB active settings are seeded
    await pricingEngine.seedDefaultSettingsIfEmpty();
    const activeSettingsDoc = await PricingSettings.findOne({ isActive: true }).sort({ version: -1 });
    assert(activeSettingsDoc, 'Active PricingSettings document must be present in MongoDB');
    console.log(`[Task 44] Active Database Pricing Version: v${activeSettingsDoc.version} ("${activeSettingsDoc.name}")`);

    // 2. Load official test cases
    const testCasesPath = path.join(__dirname, '../../2-Estimate-only/universal-movers-pricing-v3/test-cases-v3.json');
    const { tests } = JSON.parse(fs.readFileSync(testCasesPath, 'utf8'));
    console.log(`[Task 44] Loaded ${tests.length} official test cases from test-cases-v3.json.\n`);

    let passedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < tests.length; i++) {
      const t = tests[i];
      const caseNum = i + 1;
      console.log(`----------------------------------------------------------------`);
      console.log(`[Case ${caseNum}/${tests.length}] ${t.name}`);

      // --- LAYER A: Service Calculation with Active DB Settings ---
      const activeDbSettings = await pricingEngine.getActiveSettingsAsync();
      const resolvedSettings = pricingEngine.deepMerge(activeDbSettings, t.settings_overrides || {});
      for (const k of Object.keys(t.settings_overrides || {})) {
        if (typeof t.settings_overrides[k] === 'object' && t.settings_overrides[k] !== null && !Array.isArray(t.settings_overrides[k])) {
          resolvedSettings[k] = Object.assign({}, activeDbSettings[k], t.settings_overrides[k]);
        } else {
          resolvedSettings[k] = t.settings_overrides[k];
        }
      }

      const r = pricingEngine.calc(resolvedSettings, t.job);
      const a = pricingEngine.advies(resolvedSettings, t.job);
      const x = t.expected;

      const serviceResult = {
        fixed_price_shown: r2(r.vastShow),
        hourly_indication_shown: r2(r.uurShow),
        cost_price_excl_vat: r2(r.kost),
        vat_treatment: r.regime,
        vat_rate: r.btw,
        days: r.dagen,
        nights: r.nachten,
        overnight: r.overnacht,
        warnings_count: r.warnings.length,
        advice: {
          truck: a.wagen,
          trucks: a.n,
          crew: a.ploeg,
          days: a.dagen,
          fixed_price_shown: r2(a.prijs),
          feasible: a.ok,
        },
      };

      // --- LAYER B: API Controller Endpoint Execution ---
      let calcStatus = 200, calcResponse = null;
      await pricingController.calculatePrice({
        body: {
          job: t.job,
          settingsOverrides: t.settings_overrides || {},
        }
      }, {
        status(c) { calcStatus = c; return this; },
        json(d) { calcResponse = d; return this; }
      });

      let advStatus = 200, advResponse = null;
      await pricingController.getAdvice({
        body: {
          job: t.job,
          settingsOverrides: t.settings_overrides || {},
        }
      }, {
        status(c) { advStatus = c; return this; },
        json(d) { advResponse = d; return this; }
      });

      assert.strictEqual(calcStatus, 200, `API calculatePrice must return 200 for Case ${caseNum}`);
      assert.strictEqual(advStatus, 200, `API getAdvice must return 200 for Case ${caseNum}`);

      const apiResult = {
        fixed_price_shown: calcResponse.calculation.fixed_price_shown,
        hourly_indication_shown: calcResponse.calculation.hourly_indication_shown,
        cost_price_excl_vat: calcResponse.calculation.cost_price_excl_vat,
        vat_treatment: calcResponse.calculation.vat_treatment,
        vat_rate: calcResponse.calculation.vat_rate,
        days: calcResponse.calculation.days,
        nights: calcResponse.calculation.nights,
        overnight: calcResponse.calculation.overnight,
        warnings_count: calcResponse.calculation.warnings_count,
        advice: {
          truck: advResponse.advice.truck,
          trucks: advResponse.advice.trucks,
          crew: advResponse.advice.crew,
          days: advResponse.advice.days,
          fixed_price_shown: advResponse.advice.fixed_price_shown,
          feasible: advResponse.advice.feasible,
        },
      };

      // Verification checks: Service Result vs Expected & API Result vs Expected
      const serviceMatch = JSON.stringify(serviceResult) === JSON.stringify(x);
      const apiMatch = JSON.stringify(apiResult) === JSON.stringify(x);

      if (serviceMatch && apiMatch) {
        passedCount++;
        console.log(`  ✓ PASS: Fixed Price: €${serviceResult.fixed_price_shown} | Cost: €${serviceResult.cost_price_excl_vat} | VAT: ${serviceResult.vat_treatment} (${serviceResult.vat_rate * 100}%)`);
        console.log(`          Days: ${serviceResult.days} | Nights: ${serviceResult.nights} | Warnings: ${serviceResult.warnings_count}`);
        console.log(`          Advice: ${serviceResult.advice.trucks}x ${serviceResult.advice.truck}, ${serviceResult.advice.crew} crew, €${serviceResult.advice.fixed_price_shown} (${serviceResult.advice.feasible ? 'feasible' : 'infeasible'})`);
        if (r.warnings && r.warnings.length > 0) {
          for (const w of r.warnings) {
            console.log(`          ⚠ ${w}`);
          }
        }
      } else {
        failedCount++;
        console.error(`  ❌ FAIL: Discrepancy detected in Case ${caseNum}`);
        console.error(`     Expected: ${JSON.stringify(x, null, 2)}`);
        console.error(`     Observed (Service): ${JSON.stringify(serviceResult, null, 2)}`);
        console.error(`     Observed (API):     ${JSON.stringify(apiResult, null, 2)}`);
      }
    }

    console.log(`\n================================================================`);
    console.log(`FINAL RESULT: ${passedCount}/${tests.length} OFFICIAL TEST CASES PASSED`);
    console.log(`================================================================`);

    assert.strictEqual(failedCount, 0, `All official test cases must pass without error (failures: ${failedCount})`);
    assert.strictEqual(passedCount, 11, 'Exactly 11 test cases must pass 100%');

  } finally {
    await mongoose.connection.close();
    console.log('[Task 44] Database connection closed safely.');
  }
}

runTask44OfficialTests().catch((err) => {
  console.error('[Task 44 Error]:', err);
  process.exit(1);
});
