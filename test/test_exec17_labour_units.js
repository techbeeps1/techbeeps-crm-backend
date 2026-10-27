/**
 * EXEC-17 RELEASE GATE TEST SUITE
 * Labour service, crew units, lift calculation, property surcharges, and catalogue dimension validation.
 * 
 * Verifies:
 * 1. F-08 Canonical Labour Calculation: 1.7 elapsed hours x 2 crew x €40/hr = €136.00 net.
 * 2. Aggregate Worker-Hour Protection: 3.4 worker-hours x €40/hr = €136.00 (no double multiplication by crew).
 * 3. SRC-14 Time Formatting: Eliminates '01:60' artifact via division and remainder (1.999h -> '02:00').
 * 4. Lift Service Selection: Unselected contributes €0.00, selected appears once at approved unit rate.
 * 5. Canonical Property Surcharge Resolution: Stable alias mapping across Dutch/English property IDs.
 * 6. Moving Box Positive Dimension Validation: API rejects non-positive/zero box dimensions with 400.
 * 7. Zero-Regression Guarantee: Invoice #2026/0025 (€746.39) and PDF download route intact.
 */

const axios = require('axios');
const jwt = require('jsonwebtoken');
const {
  calculateLabourCost,
  calculateLiftService,
  resolvePropertySurcharge,
  validateBoxDimensions,
  convertToTimeFormat,
  handleTimeToQuantity,
} = require('../utils/labourCalculator');

const API_BASE = 'http://127.0.0.1:8080';
const JWT_SECRET = 'abcdefghijklmnopqrstuvwxyz';

const token = jwt.sign(
  {
    id: '67c05a32a7cf083dc7f2fbd6',
    username: 'techbeeps',
    email: 'mprofessionalwfh@gmail.com',
    role: 'Admin',
  },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const authHeader = {
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
};

async function runExec17Tests() {
  console.log('=====================================================================');
  console.log('  EXEC-17 RELEASE GATE: LABOUR SERVICE & CATALOGUE UNITS TEST SUITE');
  console.log('=====================================================================\n');

  let passedTests = 0;
  const totalTests = 7;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: F-08 Canonical Labour Calculation (1.7h x 2 workers x €40 = €136.00)
    // -------------------------------------------------------------------------
    console.log('[Test 1] F-08 Canonical Labour Calculation Verification:');
    const f08Result = calculateLabourCost({
      elapsedHours: 1.7,
      crewCount: 2,
      ratePerHour: 40,
      isAggregateWorkerHours: false,
    });

    console.log(`  Elapsed Hours: ${f08Result.elapsedHours} (formatted: ${f08Result.formattedElapsed})`);
    console.log(`  Crew Count: ${f08Result.crewCount}`);
    console.log(`  Rate Per Hour: €${f08Result.ratePerHour}`);
    console.log(`  Total Worker Hours: ${f08Result.workerHours} (formatted: ${f08Result.formattedWorkerHours})`);
    console.log(`  Calculated Net Charge: €${f08Result.netCharge.toFixed(2)}`);

    if (
      f08Result.netCharge === 136.00 &&
      f08Result.workerHours === 3.4 &&
      f08Result.formattedElapsed === '01:42' &&
      f08Result.formattedWorkerHours === '03:24'
    ) {
      console.log('  -> PASS: F-08 correctly computed €136.00 (3.4 worker-hours at €40/hr).\n');
      passedTests++;
    } else {
      throw new Error(`F-08 calculation mismatch: expected netCharge=136.00, workerHours=3.4, got ${JSON.stringify(f08Result)}`);
    }

    // -------------------------------------------------------------------------
    // TEST 2: SRC-10 Aggregate Worker-Hour Protection (No Double Multiplication)
    // -------------------------------------------------------------------------
    console.log('[Test 2] Aggregate Worker-Hour Protection (SRC-10):');
    const aggResult = calculateLabourCost({
      workerHours: 3.4,
      crewCount: 2,
      ratePerHour: 40,
      isAggregateWorkerHours: true,
    });

    console.log(`  Input Worker Hours: ${aggResult.workerHours}`);
    console.log(`  Crew Count: ${aggResult.crewCount}`);
    console.log(`  Computed Net Charge: €${aggResult.netCharge.toFixed(2)}`);

    if (aggResult.netCharge === 136.00 && aggResult.workerHours === 3.4) {
      console.log('  -> PASS: Aggregate worker-hours (3.4) charged directly at €40/hr (€136.00) without double multiplying by crew count (2).\n');
      passedTests++;
    } else {
      throw new Error(`Double-multiplication detected: expected netCharge=136.00, got ${aggResult.netCharge}`);
    }

    // -------------------------------------------------------------------------
    // TEST 3: SRC-14 Division & Remainder Time Formatting (No 01:60 Artifact)
    // -------------------------------------------------------------------------
    console.log('[Test 3] Time Formatting Division & Remainder Seam (SRC-14):');
    const t1_999 = convertToTimeFormat(1.999);
    const t0_9999 = convertToTimeFormat(0.9999);
    const t1_5 = convertToTimeFormat(1.5);
    const t0_001 = convertToTimeFormat(0.001);
    const t0 = convertToTimeFormat(0);

    console.log(`  1.999h -> '${t1_999}' (must be '02:00', NOT '01:60')`);
    console.log(`  0.9999h -> '${t0_9999}' (must be '01:00', NOT '00:60')`);
    console.log(`  1.5h -> '${t1_5}'`);
    console.log(`  0.001h -> '${t0_001}'`);

    const q1 = handleTimeToQuantity('01:30');
    const q2 = handleTimeToQuantity('02:00');
    console.log(`  handleTimeToQuantity('01:30') -> ${q1}`);
    console.log(`  handleTimeToQuantity('02:00') -> ${q2}`);

    if (
      t1_999 === '02:00' &&
      t0_9999 === '01:00' &&
      t1_5 === '01:30' &&
      t0_001 === '00:00' &&
      t0 === '00:00' &&
      q1 === 1.5 &&
      q2 === 2.0
    ) {
      console.log('  -> PASS: Division/remainder time formatting strictly eliminates 01:60 artifact.\n');
      passedTests++;
    } else {
      throw new Error(`Time formatting seam failure: t1_999=${t1_999}, t0_9999=${t0_9999}, t1_5=${t1_5}`);
    }

    // -------------------------------------------------------------------------
    // TEST 4: Lift Service Selection & Direct Workflow
    // -------------------------------------------------------------------------
    console.log('[Test 4] Lift Service Calculation Contract:');
    const unselectedLift = calculateLiftService({
      isSelected: false,
      quantity: 1,
      unitPrice: 95.00,
    });
    const selectedLift = calculateLiftService({
      isSelected: true,
      quantity: 1,
      unitPrice: 95.00,
    });
    const zeroLift = calculateLiftService({
      isSelected: true,
      quantity: 0,
      unitPrice: 95.00,
    });

    console.log(`  Unselected Lift: charge=€${unselectedLift.charge.toFixed(2)}, isSelected=${unselectedLift.isSelected}`);
    console.log(`  Selected Lift (1 x €95.00): charge=€${selectedLift.charge.toFixed(2)}, quantity=${selectedLift.quantity}`);
    console.log(`  Zero Qty Lift: charge=€${zeroLift.charge.toFixed(2)}`);

    if (
      unselectedLift.charge === 0.00 &&
      unselectedLift.isSelected === false &&
      selectedLift.charge === 95.00 &&
      selectedLift.quantity === 1 &&
      zeroLift.charge === 0.00
    ) {
      console.log('  -> PASS: Lift service adheres strictly to selection contract.\n');
      passedTests++;
    } else {
      throw new Error(`Lift service contract mismatch: unselected=${JSON.stringify(unselectedLift)}, selected=${JSON.stringify(selectedLift)}`);
    }

    // -------------------------------------------------------------------------
    // TEST 5: Stable Canonical Property Surcharge Resolution
    // -------------------------------------------------------------------------
    console.log('[Test 5] Canonical Property Surcharge Resolution:');
    const sampleSurcharges = {
      Appartement: 45.00,
      Huis: 0.00,
      '2-onder-1-kap': 35.00,
      Boerderij: 60.00,
      Bedrijfspand: 85.00,
      Opslag: 20.00,
    };

    const s1 = resolvePropertySurcharge('apartment', sampleSurcharges);
    const s2 = resolvePropertySurcharge('Appartement', sampleSurcharges);
    const s3 = resolvePropertySurcharge('flat', sampleSurcharges);
    const s4 = resolvePropertySurcharge('prop_apartment', sampleSurcharges);
    const s5 = resolvePropertySurcharge('semi-detached', sampleSurcharges);
    const s6 = resolvePropertySurcharge('2-onder-1-kap', sampleSurcharges);
    const s7 = resolvePropertySurcharge('commercial space', sampleSurcharges);
    const s8 = resolvePropertySurcharge('unknown_type', sampleSurcharges);

    console.log(`  'apartment' -> €${s1}`);
    console.log(`  'Appartement' -> €${s2}`);
    console.log(`  'flat' -> €${s3}`);
    console.log(`  'prop_apartment' -> €${s4}`);
    console.log(`  'semi-detached' -> €${s5}`);
    console.log(`  '2-onder-1-kap' -> €${s6}`);
    console.log(`  'commercial space' -> €${s7}`);
    console.log(`  'unknown_type' -> €${s8}`);

    if (
      s1 === 45.00 &&
      s2 === 45.00 &&
      s3 === 45.00 &&
      s4 === 45.00 &&
      s5 === 35.00 &&
      s6 === 35.00 &&
      s7 === 85.00 &&
      s8 === 0.00
    ) {
      console.log('  -> PASS: Property surcharge aliases resolved deterministically to canonical settings.\n');
      passedTests++;
    } else {
      throw new Error(`Property surcharge resolution mismatch: s1=${s1}, s2=${s2}, s5=${s5}, s6=${s6}, s7=${s7}`);
    }

    // -------------------------------------------------------------------------
    // TEST 6: Moving Box Positive Dimension Validation (API & Model)
    // -------------------------------------------------------------------------
    console.log('[Test 6] Moving Box Dimension Validation via API:');
    let createdBoxId = null;

    // 6a: Valid box creation
    const validRes = await axios.post(
      `${API_BASE}/api/moving-boxes`,
      {
        name: 'EXEC-17 Standard Moving Box',
        length: 60,
        width: 40,
        height: 40,
        sellingPrice: 3.50,
        inventoryType: 'Box',
      },
      authHeader
    );

    if (validRes.status === 201 && validRes.data?._id && validRes.data?.cubicMeter > 0) {
      createdBoxId = validRes.data._id;
      console.log(`  Valid box created: ID=${createdBoxId}, cubicMeter=${validRes.data.cubicMeter} m³`);
    } else {
      throw new Error(`Valid box creation failed: ${JSON.stringify(validRes.data)}`);
    }

    // 6b: Reject negative dimensions
    let negativeRejected = false;
    try {
      await axios.post(
        `${API_BASE}/api/moving-boxes`,
        {
          name: 'EXEC-17 Negative Box',
          length: -60,
          width: 40,
          height: 40,
        },
        authHeader
      );
    } catch (err) {
      if (err.response && err.response.status === 400) {
        negativeRejected = true;
        console.log(`  Negative length correctly rejected with HTTP 400: ${err.response.data.error || err.response.data.message}`);
      }
    }

    // 6c: Reject zero dimensions
    let zeroRejected = false;
    try {
      await axios.post(
        `${API_BASE}/api/moving-boxes`,
        {
          name: 'EXEC-17 Zero Box',
          length: 60,
          width: 0,
          height: 40,
        },
        authHeader
      );
    } catch (err) {
      if (err.response && err.response.status === 400) {
        zeroRejected = true;
        console.log(`  Zero width correctly rejected with HTTP 400: ${err.response.data.error || err.response.data.message}`);
      }
    }

    // Clean up created box
    if (createdBoxId) {
      await axios.delete(`${API_BASE}/api/moving-boxes/${createdBoxId}`, authHeader);
      console.log(`  Test box ${createdBoxId} cleaned up.`);
    }

    if (negativeRejected && zeroRejected) {
      console.log('  -> PASS: Moving box dimensions strictly validated (zero and negative rejected).\n');
      passedTests++;
    } else {
      throw new Error(`Dimension validation failed: negativeRejected=${negativeRejected}, zeroRejected=${zeroRejected}`);
    }

    // -------------------------------------------------------------------------
    // TEST 7: Zero-Regression Guarantee (Invoice #2026/0025 €746.39 & PDF)
    // -------------------------------------------------------------------------
    console.log('[Test 7] Baseline Non-Regression Guarantee (Invoice #2026/0025):');
    const invoicesRes = await axios.get(`${API_BASE}/invoice/invoiceList`, authHeader);
    const invoiceList = invoicesRes.data?.invoiceData || [];
    const baseline = invoiceList.find(inv => inv.index === '2026/0025' || inv.reference === '2026/0025');

    if (!baseline) {
      throw new Error('CRITICAL: Baseline Invoice #2026/0025 missing from database!');
    }

    const baselineTotal = Number(baseline.grandTotal || baseline.total);
    console.log(`  Baseline Invoice #2026/0025 Grand Total: €${baselineTotal.toFixed(2)}`);

    if (Math.abs(baselineTotal - 746.39) > 0.01) {
      throw new Error(`CRITICAL REGRESSION: Invoice #2026/0025 total changed! Expected €746.39, found €${baselineTotal}`);
    }

    // Verify PDF download route 200 OK
    const pdfRes = await axios.post(
      `${API_BASE}/invoice/download`,
      { Id: baseline._id },
      {
        ...authHeader,
        responseType: 'arraybuffer',
      }
    );

    const pdfBuffer = Buffer.from(pdfRes.data);
    const isPdf = pdfBuffer.slice(0, 4).toString() === '%PDF';
    console.log(`  Baseline PDF Download: HTTP ${pdfRes.status}, Size=${pdfBuffer.length} bytes, Header=${pdfBuffer.slice(0, 4).toString()}`);

    if (pdfRes.status === 200 && isPdf) {
      console.log('  -> PASS: Baseline Invoice #2026/0025 remains exactly €746.39 and PDF downloads cleanly.\n');
      passedTests++;
    } else {
      throw new Error(`Baseline PDF download failed: status=${pdfRes.status}, isPdf=${isPdf}`);
    }

    // -------------------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------------------
    console.log('=====================================================================');
    console.log(`  EXEC-17 TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log('=====================================================================');

    if (passedTests === totalTests) {
      console.log('>>> EXEC-17 RELEASE GATE: ALL VERIFICATIONS PASSED SUCCESSFULLY! <<<\n');
      process.exit(0);
    } else {
      console.error(`>>> EXEC-17 RELEASE GATE FAILED: ${totalTests - passedTests} tests failed. <<<\n`);
      process.exit(1);
    }
  } catch (error) {
    console.error('\nEXEC-17 TEST SUITE ERROR:', error.response?.data || error.message);
    process.exit(1);
  }
}

runExec17Tests();
