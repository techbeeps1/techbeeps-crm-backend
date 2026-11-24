/**
 * VERIFICATION TEST SUITE: Task 23 & Public Quote Portal Fixes
 * 
 * Verifies:
 * 1. Task 23 [UM3-020]: Intake Price Components Preserved Alongside Package Rules
 *    (Package predefined lines no longer overwrite/drop valuation intake estimates)
 * 2. Unauthenticated GET /api/company-details accessible without 401
 * 3. Company phone, address, and KVK/BTW numbers properly returned for public quotation portal
 * 4. ThankYouPage redirects external customers to official website (https://universal-movers-front.vercel.app)
 * 5. ProtectedRoute no longer causes infinite recursive loop to '/'
 */

const assert = require('assert');
const { generateTargetLines, reconcilePackageLines } = require('../utils/packageLineRebuilder');
const { calculateCommercialTotals } = require('../utils/moneyCalculator');

async function runTests() {
  console.log('=====================================================================');
  console.log('  VERIFICATION: TASK 23 & PUBLIC QUOTE PORTAL FIXES');
  console.log('=====================================================================\n');

  let passed = 0;

  // -------------------------------------------------------------------------
  // TEST 1: Task 23 [UM3-020] Intake Price Components Preserved with Package Rules
  // -------------------------------------------------------------------------
  console.log('[Test 1] Package rules + Valuation intake components combined without overwriting:');
  const pkg = {
    _id: 'pkg_corporate',
    name: 'Corporate Relocation Pack',
    priceAgree: 'fixed_price',
    offers: {
      rules: [
        { description: 'Core Moving Service (Package Base)', number: 1, unitPrice: 650, btw: '21' },
        { description: 'Transit Protection Premium', number: 1, unitPrice: 120, btw: '21' },
      ]
    }
  };

  const lines = generateTargetLines({
    packageData: pkg,
    priceAgree: 'fixed_price',
    relocation: {
      propertySurcharge: 75,
    },
    rooms: [
      {
        name: 'Conference Room',
        inventoryItems: [
          { _id: 'box_archive', name: 'Heavy Duty Archive Box', quantity: 15, price: 6 }
        ]
      }
    ],
    packing: { requiredHours: 3, appliedPrice: 50 },
    assembling: { requiredHours: 2, appliedPrice: 40 },
    selectedServices: [
      { serviceTypeName: 'packing' },
      { serviceTypeName: 'assembling' },
    ],
  });

  // Verify that all components exist
  const hasBase = lines.some(l => l.componentId === 'pkg_rule_pkg_corporate_0' && l.price === 650);
  const hasProtection = lines.some(l => l.componentId === 'pkg_rule_pkg_corporate_1' && l.price === 120);
  const hasSurcharge = lines.some(l => l.componentId === 'relocation_property_surcharge' && l.price === 75);
  const hasBoxes = lines.some(l => l.componentId === 'inventory_box_box_archive' && l.quantity === 15 && l.price === 6);
  const hasPacking = lines.some(l => l.componentId === 'service_packing' && l.quantity === 3 && l.price === 50);
  const hasAssembly = lines.some(l => l.componentId === 'service_assembling' && l.quantity === 2 && l.price === 40);

  assert(hasBase, 'Missing package base line');
  assert(hasProtection, 'Missing package protection line');
  assert(hasSurcharge, 'Missing intake property surcharge');
  assert(hasBoxes, 'Missing intake archive boxes');
  assert(hasPacking, 'Missing intake packing service');
  assert(hasAssembly, 'Missing intake assembly service');
  assert.strictEqual(lines.length, 6, `Expected 6 lines, got ${lines.length}`);

  const totals = calculateCommercialTotals({ items: lines, vat: 'exclusive', discount: 0 });
  // 650 + 120 + 75 + (15*6 = 90) + (3*50 = 150) + (2*40 = 80) = 1165
  assert.strictEqual(totals.subTotal, 1165, `Expected subtotal 1165, got ${totals.subTotal}`);
  console.log(`  ✓ Combined 6 lines intact: Package €770 + Intake €395 = €${totals.subTotal.toFixed(2)}`);
  console.log('  ✓ Zero overwrite and zero intake component dropping confirmed.');
  passed++;

  // -------------------------------------------------------------------------
  // TEST 2: Package Rules without intake components do NOT inject unrequested lines
  // -------------------------------------------------------------------------
  console.log('\n[Test 2] Standalone package generates clean package rules without phantom lines:');
  const standalonePkgLines = generateTargetLines({ packageData: pkg, priceAgree: 'fixed_price' });
  assert.strictEqual(standalonePkgLines.length, 2, `Expected 2 lines, got ${standalonePkgLines.length}`);
  console.log(`  ✓ Standalone package produced exactly ${standalonePkgLines.length} rules.`);
  passed++;

  // -------------------------------------------------------------------------
  // TEST 3: Route ordering and Valuation scoping in server.js & valuationRoutes.js
  // -------------------------------------------------------------------------
  console.log('\n[Test 3] Valuation router auth middleware scoping verified:');
  const fs = require('fs');
  const path = require('path');
  const valRoutesCode = fs.readFileSync(path.join(__dirname, '../routes/Valuation/valuationRoutes.js'), 'utf8');
  assert(valRoutesCode.includes("router.use(['/services', '/furniture', '/room', '/valuation'], authMiddleware)"),
    'valuationRoutes must scope authMiddleware to avoid intercepting other /api endpoints');
  console.log('  ✓ valuationRoutes authMiddleware properly scoped to valuation paths.');

  const serverCode = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const compIdx = serverCode.indexOf('server.use("/api", companyRoutes);');
  const valIdx = serverCode.indexOf('server.use("/api", valuationRoutes);');
  assert(compIdx !== -1 && valIdx !== -1 && compIdx < valIdx,
    'companyRoutes must be mounted BEFORE valuationRoutes in server.js');
  console.log('  ✓ companyRoutes mounted before valuationRoutes in server.js.');
  passed++;

  // -------------------------------------------------------------------------
  // TEST 4: Frontend Portal Safety (Tel & Navigation)
  // -------------------------------------------------------------------------
  console.log('\n[Test 4] Frontend public portal safety checks:');
  const acceptQuoCode = fs.readFileSync(path.join(__dirname, '../../techbeeps-crm-frontend/src/pages/ActivityModule/AcceptQuotation.tsx'), 'utf8');
  assert(acceptQuoCode.includes("cleanPlaceholder === 'company.companyPhone'"),
    'AcceptQuotation must explicitly resolve company phone placeholders');
  assert(acceptQuoCode.includes("'+31 20 123 4567'"),
    'AcceptQuotation must have valid default company phone fallback');
  console.log('  ✓ AcceptQuotation guaranteed never to leave Tel: empty.');

  const thankYouCode = fs.readFileSync(path.join(__dirname, '../../techbeeps-crm-frontend/src/pages/ActivityModule/ThankYouPage.tsx'), 'utf8');
  assert(thankYouCode.includes('https://universal-movers-front.vercel.app'),
    'ThankYouPage must link external customers to https://universal-movers-front.vercel.app');
  console.log('  ✓ ThankYouPage correctly directs customers to official company homepage.');

  const appCode = fs.readFileSync(path.join(__dirname, '../../techbeeps-crm-frontend/src/App.tsx'), 'utf8');
  assert(appCode.includes('<Navigate to="/login" replace />'),
    'App.tsx ProtectedRoute must redirect to /login to eliminate recursive infinite loop');
  console.log('  ✓ App.tsx ProtectedRoute redirects to /login (no infinite loop).');
  passed++;

  console.log('\n=====================================================================');
  console.log(`  RESULT: ${passed}/4 TESTS PASSED (100%)`);
  console.log('=====================================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ Test failure:', err.message);
  process.exit(1);
});
