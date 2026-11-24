const assert = require('assert');
const path = require('path');
const pricingEngine = require('../services/pricingEngineV3Service');
const pricingController = require('../controllers/pricingV3Controller');

function runMockController(handler, reqBody) {
  return new Promise((resolve) => {
    const req = { body: reqBody };
    const res = {
      statusCode: 200,
      jsonData: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.jsonData = data;
        resolve({ status: this.statusCode, body: this.jsonData });
      },
    };
    handler(req, res);
  });
}

async function runTask45ValidationProbes() {
  console.log('================================================================');
  console.log('🚀 TASK 45: EXTRA VALIDATION PROBES (N16-01 TO N16-12)');
  console.log('================================================================\n');

  const S = pricingEngine.getDefaultSettings();
  const clone = (x) => JSON.parse(JSON.stringify(x));

  let passed = 0;
  let failed = 0;

  function record(id, name, success, detail) {
    if (success) {
      passed++;
      console.log(`  [PASS] ${id} - ${name}: ${detail}`);
    } else {
      failed++;
      console.error(`  [FAIL] ${id} - ${name}: ${detail}`);
    }
  }

  // --- PROBE N16-01: Text volume ---
  {
    const id = 'N16-01';
    const name = 'Text volume';
    const s = clone(S);
    const k = clone(pricingEngine.PRESETS.A);
    k.m3 = 'abc';
    let rejected = false;
    let errCode = null;
    try {
      pricingEngine.calc(s, k);
    } catch (e) {
      rejected = true;
      errCode = e.code;
    }
    const httpRes = await runMockController(pricingController.calculatePrice, { job: k });
    const ok = rejected && errCode === 'INVALID_VOLUME' && httpRes.status === 400 && httpRes.body.error === 'INVALID_VOLUME';
    record(id, name, ok, `Service rejected=${rejected} (code=${errCode}), HTTP status=${httpRes.status}`);
  }

  // --- PROBE N16-02: Zero crew ---
  {
    const id = 'N16-02';
    const name = 'Zero crew';
    const s = clone(S);
    const k = clone(pricingEngine.PRESETS.A);
    k.ploeg = 0;
    let rejected = false;
    let errCode = null;
    try {
      pricingEngine.calc(s, k);
    } catch (e) {
      rejected = true;
      errCode = e.code;
    }
    const httpRes = await runMockController(pricingController.calculatePrice, { job: k });
    const ok = rejected && errCode === 'INVALID_CREW' && httpRes.status === 400 && httpRes.body.error === 'INVALID_CREW';
    record(id, name, ok, `Service rejected=${rejected} (code=${errCode}), HTTP status=${httpRes.status}`);
  }

  // --- PROBE N16-03: Unknown truck ---
  {
    const id = 'N16-03';
    const name = 'Unknown truck';
    const s = clone(S);
    const k = clone(pricingEngine.PRESETS.A);
    k.wagen = 'NONEXISTENT';
    let rejected = false;
    let errCode = null;
    try {
      pricingEngine.calc(s, k);
    } catch (e) {
      rejected = true;
      errCode = e.code;
    }
    const httpRes = await runMockController(pricingController.calculatePrice, { job: k });
    const ok = rejected && errCode === 'UNKNOWN_TRUCK' && httpRes.status === 400 && httpRes.body.error === 'UNKNOWN_TRUCK';
    record(id, name, ok, `Service rejected=${rejected} (code=${errCode}), HTTP status=${httpRes.status}`);
  }

  // --- PROBE N16-04: Unknown tax regime ---
  {
    const id = 'N16-04';
    const name = 'Unknown tax regime';
    const s = clone(S);
    const k = clone(pricingEngine.PRESETS.A);
    k.btw_regime = 'NONEXISTENT';
    let rejected = false;
    let errCode = null;
    try {
      pricingEngine.calc(s, k);
    } catch (e) {
      rejected = true;
      errCode = e.code;
    }
    const httpRes = await runMockController(pricingController.calculatePrice, { job: k });
    const ok = rejected && errCode === 'UNKNOWN_VAT_REGIME' && httpRes.status === 400 && httpRes.body.error === 'UNKNOWN_VAT_REGIME';
    record(id, name, ok, `Service rejected=${rejected} (code=${errCode}), HTTP status=${httpRes.status}`);
  }

  // --- PROBE N16-05: Negative volume ---
  {
    const id = 'N16-05';
    const name = 'Negative volume';
    const s = clone(S);
    const k = clone(pricingEngine.PRESETS.A);
    k.m3 = -12;
    let rejected = false;
    let errCode = null;
    try {
      pricingEngine.calc(s, k);
    } catch (e) {
      rejected = true;
      errCode = e.code;
    }
    const httpRes = await runMockController(pricingController.calculatePrice, { job: k });
    const ok = rejected && errCode === 'INVALID_VOLUME' && httpRes.status === 400 && httpRes.body.error === 'INVALID_VOLUME';
    record(id, name, ok, `Service rejected=${rejected} (code=${errCode}), HTTP status=${httpRes.status}`);
  }

  // --- PROBE N16-06: Fractional crew ---
  {
    const id = 'N16-06';
    const name = 'Fractional crew';
    const s = clone(S);
    const k = clone(pricingEngine.PRESETS.A);
    k.ploeg = 2.5;
    let rejected = false;
    let errCode = null;
    try {
      pricingEngine.calc(s, k);
    } catch (e) {
      rejected = true;
      errCode = e.code;
    }
    const httpRes = await runMockController(pricingController.calculatePrice, { job: k });
    const ok = rejected && errCode === 'INVALID_CREW_INTEGER' && httpRes.status === 400 && httpRes.body.error === 'INVALID_CREW_INTEGER';
    record(id, name, ok, `Service rejected=${rejected} (code=${errCode}), HTTP status=${httpRes.status}`);
  }

  // --- PROBE N16-07: Invalid clock ---
  {
    const id = 'N16-07';
    const name = 'Invalid clock';
    const s = clone(S);
    const k = clone(pricingEngine.PRESETS.A);
    k.venster.laden = { van: '25:99', tot: '28:99' };
    let rejected = false;
    let errCode = null;
    try {
      pricingEngine.calc(s, k);
    } catch (e) {
      rejected = true;
      errCode = e.code;
    }
    const httpRes = await runMockController(pricingController.calculatePrice, { job: k });
    const ok = rejected && errCode === 'INVALID_TIME_WINDOW' && httpRes.status === 400 && httpRes.body.error === 'INVALID_TIME_WINDOW';
    record(id, name, ok, `Service rejected=${rejected} (code=${errCode}), HTTP status=${httpRes.status}`);
  }

  // --- PROBE N16-08: Unloading before loading ---
  {
    const id = 'N16-08';
    const name = 'Unloading before loading';
    const s = clone(S);
    const k = clone(pricingEngine.PRESETS.A);
    k.venster.laden = { van: '15:00', tot: '18:00' };
    k.venster.lossen = { van: '09:00', tot: '12:00' };
    let rejected = false;
    let errCode = null;
    try {
      pricingEngine.calc(s, k);
    } catch (e) {
      rejected = true;
      errCode = e.code;
    }
    const httpRes = await runMockController(pricingController.calculatePrice, { job: k });
    const ok = rejected && errCode === 'CHRONOLOGICAL_WINDOW_CONFLICT' && httpRes.status === 400 && httpRes.body.error === 'CHRONOLOGICAL_WINDOW_CONFLICT';
    record(id, name, ok, `Service rejected=${rejected} (code=${errCode}), HTTP status=${httpRes.status}`);
  }

  // --- PROBE N16-09: Zero customs in fixed mode ---
  {
    const id = 'N16-09';
    const name = 'Zero customs in fixed mode';
    const s = clone(S);
    const k = clone(pricingEngine.PRESETS.A);
    s.internationaal.douane_verkoop_modus = 'vast';
    k.land_naar = 'buiten';
    let rejected = false;
    let warnings = [];
    try {
      const r = pricingEngine.calc(s, k);
      warnings = r.warnings || [];
    } catch (e) {
      rejected = true;
    }
    const hasDouaneWarning = warnings.some((w) => w.toLowerCase().includes('customs') || w.toLowerCase().includes('douane'));
    const ok = !rejected && hasDouaneWarning;
    record(id, name, ok, `Calculated without error, customs warning flagged: "${hasDouaneWarning}"`);
  }

  // --- PROBE N16-10: Lift 1.25h in fixed mode ---
  {
    const id = 'N16-10';
    const name = 'Lift 1.25h in fixed mode (per started half hour policy)';
    const s = clone(S);
    const k = clone(pricingEngine.PRESETS.A);
    s.lift.verkoop_modus = 'vast';
    k.lift_inzet = true;
    k.lift_uren = 1.25;
    let rejected = false;
    let liftVerkoop = null;
    try {
      const r = pricingEngine.calc(s, k);
      liftVerkoop = r.liftVerkoop;
    } catch (e) {
      rejected = true;
    }
    // Eerste uur = 139, per halfuur = 60. 1.25h = 1h + 1 started half hour = 139 + 60 = 199 EUR.
    const ok = !rejected && liftVerkoop === 199;
    record(id, name, ok, `liftVerkoop=${liftVerkoop} EUR (expected exactly 199 EUR for 1.25 hours)`);
  }

  // --- PROBE N16-11: Unknown material ---
  {
    const id = 'N16-11';
    const name = 'Unknown material';
    const s = clone(S);
    const k = clone(pricingEngine.PRESETS.A);
    k.materiaal = [{ id: 'NONEXISTENT', n: 10 }];
    let rejected = false;
    let errCode = null;
    try {
      pricingEngine.calc(s, k);
    } catch (e) {
      rejected = true;
      errCode = e.code;
    }
    const httpRes = await runMockController(pricingController.calculatePrice, { job: k });
    const ok = rejected && errCode === 'UNKNOWN_MATERIAL' && httpRes.status === 400 && httpRes.body.error === 'UNKNOWN_MATERIAL';
    record(id, name, ok, `Service rejected=${rejected} (code=${errCode}), HTTP status=${httpRes.status}`);
  }

  // --- PROBE N16-12: Unknown profile ---
  {
    const id = 'N16-12';
    const name = 'Unknown profile';
    const s = clone(S);
    const k = clone(pricingEngine.PRESETS.A);
    k.profiel = 'NONEXISTENT';
    let rejected = false;
    let errCode = null;
    try {
      pricingEngine.calc(s, k);
    } catch (e) {
      rejected = true;
      errCode = e.code;
    }
    const httpRes = await runMockController(pricingController.calculatePrice, { job: k });
    const ok = rejected && errCode === 'UNKNOWN_PROFILE' && httpRes.status === 400 && httpRes.body.error === 'UNKNOWN_PROFILE';
    record(id, name, ok, `Service rejected=${rejected} (code=${errCode}), HTTP status=${httpRes.status}`);
  }

  // --- VERIFY CANONICAL PRESETS REMAIN INTACT ---
  console.log('\n--- Verifying Canonical Presets (A, B, C, D) ---');
  const canonical = {
    A: { fixed: 805, cost: 522.09 },
    B: { fixed: 1970, cost: 1284.71 },
    C: { fixed: 3535, cost: 2300.07 },
    D: { fixed: 5145, cost: 4354.45 },
  };

  for (const [key, exp] of Object.entries(canonical)) {
    const r = pricingEngine.calc(S, pricingEngine.PRESETS[key]);
    const rCost = Math.round(r.kost * 100) / 100;
    const match = r.vastShow === exp.fixed && Math.abs(rCost - exp.cost) < 0.05;
    if (match) {
      console.log(`  [PASS] Preset ${key}: vastShow=${r.vastShow} (exp: ${exp.fixed}), kost=${rCost} (exp: ${exp.cost})`);
      passed++;
    } else {
      console.error(`  [FAIL] Preset ${key}: vastShow=${r.vastShow} (exp: ${exp.fixed}), kost=${rCost} (exp: ${exp.cost})`);
      failed++;
    }
  }

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 ALL 12 VALIDATION PROBES (N16-01 TO N16-12) & PRESETS PASSED 100%!');
  }
}

runTask45ValidationProbes().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
