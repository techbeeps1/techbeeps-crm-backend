const fs = require('fs');
const path = require('path');
const assert = require('assert');

const pricingEngine = require('../services/pricingEngineV3Service');
const pricingController = require('../controllers/pricingV3Controller');

async function runTask42Tests() {
  console.log('======================================================');
  console.log('🚀 TASK 42: PRICING CALCULATION ENGINE V3 BACKEND PORT');
  console.log('======================================================');

  // --- TEST 1: Service Module Import & Defaults ---
  console.log('\n--- TEST 1: Service Module Import & Defaults ---');
  const defaults = pricingEngine.getDefaultSettings();
  assert(defaults, 'Default settings must be loaded');
  assert(defaults.arbeid, 'Settings must contain arbeid block');
  assert(defaults.wagens && defaults.wagens.length >= 4, 'Settings must contain wagens array with at least 4 trucks');
  assert(defaults.specials && defaults.specials.length >= 5, 'Settings must contain specials array');
  assert.strictEqual(defaults.arbeid.loon, 16.5, 'Default hourly wage must be 16.50');
  assert.strictEqual(defaults.comm.marge, 15, 'Default commercial margin must be 15%');
  console.log('✓ TEST 1 PASSED: pricingEngineV3Service initialized and loaded official settings-v3 successfully.');

  // --- TEST 2: All 11 Official Test Cases Verification ---
  console.log('\n--- TEST 2: All 11 Official Test Cases (test-cases-v3.json) ---');
  const testCasesPath = path.join(__dirname, '../../2-Estimate-only/universal-movers-pricing-v3/test-cases-v3.json');
  const { tests } = JSON.parse(fs.readFileSync(testCasesPath, 'utf8'));
  const r2 = (x) => Math.round(Number(x || 0) * 100) / 100;

  let passedCases = 0;
  for (const t of tests) {
    const settings = pricingEngine.resolveSettings(t.settings_overrides || {});
    const r = pricingEngine.calc(settings, t.job);
    const a = pricingEngine.advies(settings, t.job);
    const x = t.expected;

    const got = {
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

    const isMatch = JSON.stringify(got) === JSON.stringify(x);
    if (!isMatch) {
      console.error(`FAIL: ${t.name}`);
      console.error(`  Expected: ${JSON.stringify(x)}`);
      console.error(`  Got:      ${JSON.stringify(got)}`);
      assert.fail(`Test case "${t.name}" output mismatched expected values`);
    } else {
      passedCases++;
      console.log(`  ✓ PASS: ${t.name}`);
    }
  }

  assert.strictEqual(passedCases, 11, 'All 11 official test cases must pass identically');
  console.log(`✓ TEST 2 PASSED: 11/11 official test cases verified with 100% precision.`);

  // --- TEST 3: Controller API Simulation ---
  console.log('\n--- TEST 3: Controller Endpoints Simulation ---');

  // 3a. calculatePrice validation
  let errStatus = 200, errBody = null;
  const mockErrRes = {
    status(c) { errStatus = c; return this; },
    json(d) { errBody = d; return this; },
  };
  await pricingController.calculatePrice({ body: {} }, mockErrRes);
  assert.strictEqual(errStatus, 400, 'calculatePrice should return 400 for empty job');
  assert.strictEqual(errBody.error, 'INVALID_JOB_PAYLOAD');
  console.log('  ✓ 3a: Empty job rejected with 400 INVALID_JOB_PAYLOAD.');

  // 3b. calculatePrice with valid Studio job (Preset A)
  let calcStatus = 200, calcBody = null;
  const mockCalcRes = {
    status(c) { calcStatus = c; return this; },
    json(d) { calcBody = d; return this; },
  };
  await pricingController.calculatePrice({
    body: {
      job: tests[0].job,
    }
  }, mockCalcRes);
  assert.strictEqual(calcStatus, 200, 'calculatePrice should return 200 for valid job');
  assert.strictEqual(calcBody.success, true);
  assert.strictEqual(calcBody.calculation.fixed_price_shown, 805);
  assert.strictEqual(calcBody.calculation.cost_price_excl_vat, 522.09);
  assert.strictEqual(calcBody.calculation.days, 1);
  console.log(`  ✓ 3b: calculatePrice returned status 200 with fixed_price_shown=€${calcBody.calculation.fixed_price_shown}.`);

  // 3c. getAdvice endpoint
  let advStatus = 200, advBody = null;
  const mockAdvRes = {
    status(c) { advStatus = c; return this; },
    json(d) { advBody = d; return this; },
  };
  await pricingController.getAdvice({
    body: {
      job: tests[1].job, // 3-room apartment
    }
  }, mockAdvRes);
  assert.strictEqual(advStatus, 200, 'getAdvice should return 200');
  assert.strictEqual(advBody.success, true);
  assert.strictEqual(advBody.advice.feasible, true);
  assert.strictEqual(advBody.advice.truck, 'bak40');
  console.log(`  ✓ 3c: getAdvice recommended truck="${advBody.advice.truck}", crew=${advBody.advice.crew}, days=${advBody.advice.days}.`);

  // 3d. getDefaultSettings endpoint
  let setStatus = 200, setBody = null;
  const mockSetRes = {
    status(c) { setStatus = c; return this; },
    json(d) { setBody = d; return this; },
  };
  await pricingController.getDefaultSettings({}, mockSetRes);
  assert.strictEqual(setStatus, 200, 'getDefaultSettings should return 200');
  assert.strictEqual(setBody.success, true);
  assert(setBody.settings.meubels.length > 0);
  console.log('  ✓ 3d: getDefaultSettings returned status 200 with complete configuration.');

  console.log('\n======================================================');
  console.log('ALL TASK 42 PRICING ENGINE V3 PORT TESTS PASSED (3/3)');
  console.log('======================================================');
}

runTask42Tests().catch((err) => {
  console.error('[Task 42 Test Failure]:', err);
  process.exit(1);
});
