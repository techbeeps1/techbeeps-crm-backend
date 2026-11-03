const assert = require('assert');
const path = require('path');
const jwt = require('jsonwebtoken');

const BASE_URL = 'http://localhost:8080';
const JWT_SECRET = 'abcdefghijklmnopqrstuvwxyz';

const ADMIN_TOKEN = jwt.sign(
  {
    user: {
      id: '6ae870535cbda31c941faa5d',
      userId: '6ae870535cbda31c941faa5d',
      role: 'Admin',
      access: ['Dashboard', 'Leads', 'Customer', 'Finance', 'HRM'],
      username: 'Mizbahuddin Qasim',
    },
  },
  JWT_SECRET
);

const authHeaders = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${ADMIN_TOKEN}`,
};

async function runTests() {
  console.log('========================================================================');
  console.log('EXEC-37: Historical Data Inventory & Migration Rehearsal Test Battery');
  console.log('========================================================================');

  let passed = 0;
  let total = 0;

  function record(description, condition) {
    total++;
    if (condition) {
      console.log(`[PASS] ${description}`);
      passed++;
    } else {
      console.error(`[FAIL] ${description}`);
      assert.fail(`Test failed: ${description}`);
    }
  }

  // 1. Health check
  const pingRes = await fetch(`${BASE_URL}/`);
  record('Backend is alive on port 8080', pingRes.status === 200);

  // 2. Default-Deny Security Check on Migration Audit Endpoint
  const anonRes = await fetch(`${BASE_URL}/api/system/migration-audit`);
  record('Anonymous request to migration audit blocked with HTTP 401', anonRes.status === 401);

  // 3. Authenticated Admin Call to Migration Audit Endpoint
  const auditRes = await fetch(`${BASE_URL}/api/system/migration-audit`, { headers: authHeaders });
  record('Authenticated admin request returns HTTP 200', auditRes.status === 200);

  const auditJson = await auditRes.json();
  record('Audit response reports success: true', auditJson.success === true);
  const auditData = auditJson.data;

  // 4. Verify Inventory Record Counts in Report
  record('Report contains customers collection count', typeof auditData.collections.customers.initialCount === 'number' && auditData.collections.customers.initialCount > 0);
  record('Report contains invoices collection count', typeof auditData.collections.invoices.initialCount === 'number' && auditData.collections.invoices.initialCount >= 20);
  record('Report contains finances/quotes collection count', typeof auditData.collections.finances.initialCount === 'number' && auditData.collections.finances.initialCount >= 20);
  record('Report contains jobSchedules collection count', typeof auditData.collections.jobSchedules.initialCount === 'number');
  record('Report contains leads collection count', typeof auditData.collections.leads.initialCount === 'number');
  record('Report contains appointments collection count', typeof auditData.collections.appointments.initialCount === 'number');
  record('Report contains addresses collection count', typeof auditData.collections.addresses.initialCount === 'number');
  record('Report contains payments collection count', typeof auditData.collections.payments.initialCount === 'number');

  // 5. Zero Data Loss Guarantee
  record('Zero data loss guaranteed in audit report', auditData.zeroDataLossGuaranteed === true);

  for (const [key, val] of Object.entries(auditData.collections)) {
    record(`Zero data loss verified for collection '${key}' (${val.initialCount} -> ${val.finalCount})`, val.initialCount === val.finalCount);
  }

  // 6. Statutory Baseline Invariant Check (#2026/0025)
  record('Baseline invoice #2026/0025 identified in audit', Boolean(auditData.baselineInvariant));
  record('Baseline invoice index is 2026/0025', auditData.baselineInvariant && auditData.baselineInvariant.index === '2026/0025');
  record('Baseline invoice total is strictly €746.39', auditData.baselineInvariant && Number(auditData.baselineInvariant.total) === 746.39);

  // 7. Verify In-Process Dry-Run Engine
  const { runMigrationDryRun } = require('../scripts/migrationDryRun');
  const dryRunResult = await runMigrationDryRun({ isLive: false });
  record('In-process dry-run executes successfully', Boolean(dryRunResult));
  record('Dry-run reports mode: DRY-RUN', dryRunResult.mode === 'DRY-RUN');
  record('Dry-run applied changes count is 0', dryRunResult.backfillsApplied.invoicesTokensAdded === 0 && dryRunResult.backfillsApplied.quotesTokensAdded === 0);

  // 8. Live Migration Rehearsal (Backfill missing capability tokens idempotently)
  const liveResult = await runMigrationDryRun({ isLive: true });
  record('Live migration executes successfully', Boolean(liveResult));
  record('Live migration reports mode: LIVE', liveResult.mode === 'LIVE');
  record('Live migration guarantees zero data loss', liveResult.zeroDataLossGuaranteed === true);

  // 9. Idempotency Check (Running second live migration produces 0 further backfills)
  const secondLiveResult = await runMigrationDryRun({ isLive: true });
  record('Second live run backfills 0 additional invoice tokens (Idempotent)', secondLiveResult.backfillsApplied.invoicesTokensAdded === 0);
  record('Second live run backfills 0 additional quote tokens (Idempotent)', secondLiveResult.backfillsApplied.quotesTokensAdded === 0);

  // 10. Post-Migration Statutory Invariant Verification
  const invRes = await fetch(`${BASE_URL}/invoice/invoiceList`, { headers: authHeaders });
  const invData = await invRes.json();
  const targetInvoice = (invData.invoiceData || []).find(i => String(i.total) === '746.39');
  record('Post-migration baseline invoice preserved at €746.39', Boolean(targetInvoice) && Number(targetInvoice.total) === 746.39);
  record('Post-migration baseline invoice retains index 2026/0025', Boolean(targetInvoice) && (targetInvoice.index === '2026/0025' || targetInvoice.invoice_number === '2026/0025'));

  // 11. Statutory PDF Generation Check
  console.log('Target invoice for PDF:', targetInvoice ? { id: targetInvoice._id, index: targetInvoice.index, total: targetInvoice.total } : null);
  const pdfRes = await fetch(`${BASE_URL}/invoice/download`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ Id: targetInvoice._id, invoiceId: targetInvoice._id }),
  });
  console.log('PDF Res status:', pdfRes.status);
  if (pdfRes.status !== 200) {
    const errText = await pdfRes.text();
    console.error('PDF error text:', errText);
  }
  record('Statutory PDF download returns HTTP 200', pdfRes.status === 200);
  const pdfBuffer = await pdfRes.arrayBuffer();
  record(`Statutory PDF generated with valid byte payload (${pdfBuffer.byteLength} bytes > 50,000)`, pdfBuffer.byteLength > 50000);

  console.log('========================================================================');
  console.log(`EXEC-37 BATTERY RESULTS: ${passed} / ${total} TESTS PASSED (100%)`);
  console.log('========================================================================');
}

runTests().catch(err => {
  console.error('[FATAL TEST FAILURE]:', err);
  process.exit(1);
});
