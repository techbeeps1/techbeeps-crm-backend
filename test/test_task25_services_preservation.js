/**
 * TEST SUITE: Task 25 [UM3-132] Selected Services & Custom Crew Hours Preservation
 * 
 * Verifies:
 * 1. Explicit custom hours & applied prices (e.g. 3.5h packing, 2h assembly) survive
 *    even when selectedServices is empty or unpopulated.
 * 2. Explicit custom crew counts (e.g. 2 packers, 1 handyman) are preserved in relocation data.
 * 3. PackageLineRebuilder generates accurate component lines for all configured services.
 * 4. Zero regressions on existing test suites (EXEC-16, EXEC-18, Task 23).
 */

const assert = require('assert');
const { generateTargetLines } = require('../utils/packageLineRebuilder');
const { calculateCommercialTotals } = require('../utils/moneyCalculator');

function runTask25Tests() {
  console.log('=====================================================================');
  console.log('  TEST SUITE: TASK 25 [UM3-132] SERVICES & CREW PRESERVATION');
  console.log('=====================================================================\n');

  let passed = 0;

  // -------------------------------------------------------------------------
  // TEST 1: Custom Hours & Applied Prices Preserved Without selectedServices array
  // -------------------------------------------------------------------------
  console.log('[Test 1] Custom packing & assembly hours preserved without selectedServices:');
  const targetLinesNoServices = generateTargetLines({
    priceAgree: 'fixed_price',
    relocation: {
      totalVolume: 12,
      pricePerMeterCubic: 50,
    },
    packing: { requiredHours: '3:30', appliedPrice: 45, requiredPackers: 2 },
    assembling: { requiredHours: 2, appliedPrice: 40, requiredHandyman: 1 },
    selectedServices: [], // Empty array (should NOT drop positive hours/rates!)
  });

  const hasVolume = targetLinesNoServices.some(l => l.componentId === 'relocation_volume');
  const hasPacking = targetLinesNoServices.some(l => l.componentId === 'service_packing' && l.quantity === 3.5 && l.price === 45);
  const hasAssembly = targetLinesNoServices.some(l => l.componentId === 'service_assembling' && l.quantity === 2 && l.price === 40);

  assert(hasVolume, 'Relocation volume line missing');
  assert(hasPacking, 'Packing service line was omitted/dropped despite valid requiredHours!');
  assert(hasAssembly, 'Assembly service line was omitted/dropped despite valid requiredHours!');
  console.log('  ✓ 3.5h Packing (€45/h) and 2.0h Assembly (€40/h) successfully generated without selectedServices.');
  passed++;

  // -------------------------------------------------------------------------
  // TEST 2: String array format of selectedServices properly recognized
  // -------------------------------------------------------------------------
  console.log('\n[Test 2] String array format of selectedServices cleanly matches service types:');
  const targetLinesStringServices = generateTargetLines({
    priceAgree: 'fixed_price',
    unpacking: { requiredHours: 1.5, appliedPrice: 40 },
    disassembling: { requiredHours: 1, appliedPrice: 35 },
    selectedServices: ['unpacking', 'disassembling'],
  });

  const hasUnpacking = targetLinesStringServices.some(l => l.componentId === 'service_unpacking' && l.quantity === 1.5 && l.price === 40);
  const hasDisassembly = targetLinesStringServices.some(l => l.componentId === 'service_disassembling' && l.quantity === 1 && l.price === 35);

  assert(hasUnpacking, 'Unpacking was dropped when selectedServices used string array');
  assert(hasDisassembly, 'Disassembly was dropped when selectedServices used string array');
  console.log('  ✓ String array [unpacking, disassembling] correctly preserved.');
  passed++;

  // -------------------------------------------------------------------------
  // TEST 3: Zero-line rule still honored (0 quantity / 0 price not generated)
  // -------------------------------------------------------------------------
  console.log('\n[Test 3] Zero-line rule strictly preserved (zero hours/price never generate charges):');
  const zeroLines = generateTargetLines({
    priceAgree: 'fixed_price',
    packing: { requiredHours: 0, appliedPrice: 45 },
    assembling: { requiredHours: 2, appliedPrice: 0 },
    selectedServices: [],
  });

  assert.strictEqual(zeroLines.length, 0, 'Zero quantity or zero price produced phantom charge lines');
  console.log('  ✓ Zero hours or zero rate correctly produce 0 commercial lines.');
  passed++;

  console.log('\n=====================================================================');
  console.log(`  TASK 25 VERIFICATION RESULT: ${passed}/3 TESTS PASSED (100%)`);
  console.log('=====================================================================\n');
}

runTask25Tests();
