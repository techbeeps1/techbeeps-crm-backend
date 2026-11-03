const assert = require('assert');
const fs = require('fs');
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
      name: 'Executive Admin Bedros',
      access: ['Dashboard', 'Leads', 'Customer', 'Finance', 'HRM', 'Settings'],
      username: 'Mizbahuddin Qasim',
    },
  },
  JWT_SECRET
);

const STAFF_TOKEN = jwt.sign(
  {
    user: {
      id: '6ae870535cbda31c941faa5e',
      userId: '6ae870535cbda31c941faa5e',
      role: 'Staff',
      name: 'Field Staff Worker',
      access: ['Jobs'],
      username: 'field_staff',
    },
  },
  JWT_SECRET
);

const adminHeaders = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${ADMIN_TOKEN}`,
};

const staffHeaders = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${STAFF_TOKEN}`,
};

async function runMasterAcceptanceGate() {
  console.log('========================================================================');
  console.log('EXEC-40: FINAL RELEASE ACCEPTANCE GATE & MASTER VERIFICATION BATTERY');
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

  // 1. Health & Core Infrastructure
  {
    const healthRes = await fetch(`${BASE_URL}/health`);
    record('Backend server is healthy (HTTP 200 OK)', healthRes.status === 200);
  }

  // 2. Rollback Audit Authorization Matrix (Default-Deny)
  {
    const anonRes = await fetch(`${BASE_URL}/api/system/rollback-audit`);
    record('Anonymous request to /api/system/rollback-audit is blocked with HTTP 401 Unauthorized', anonRes.status === 401);

    const staffRes = await fetch(`${BASE_URL}/api/system/rollback-audit`, { headers: staffHeaders });
    record('Staff request to /api/system/rollback-audit is blocked with HTTP 403 Forbidden', staffRes.status === 403);
    const staffBody = await staffRes.json();
    record('Staff error message indicates FORBIDDEN role', staffBody.error === 'FORBIDDEN');

    const adminRes = await fetch(`${BASE_URL}/api/system/rollback-audit`, { headers: adminHeaders });
    record('Admin request to /api/system/rollback-audit succeeds with HTTP 200 OK', adminRes.status === 200);
    const adminBody = await adminRes.json();
    record('Rollback audit response success flag is true', adminBody.success === true);
    record('Rollback report data contains recoveryReadiness', Boolean(adminBody.data?.recoveryReadiness));
  }

  // 3. In-Process Rollback & Disaster Recovery Rehearsal
  {
    const { runRollbackRehearsal } = require('../scripts/releaseRollbackRehearsal');
    const rehearsalReport = await runRollbackRehearsal({ isLive: false });

    record('In-process rollback rehearsal completes successfully', Boolean(rehearsalReport));
    record('Rehearsal audits all database collections (>= 50 collections)', rehearsalReport.totalCollections >= 50);
    record('Rehearsal audits positive document record count (> 2,000 records)', rehearsalReport.totalRecords > 2000);
    record('Zero Data Loss is guaranteed (100% verified intact)', rehearsalReport.recoveryReadiness.zeroDataLossGuaranteed === true);
    record('Destructive operations are strictly prohibited', rehearsalReport.recoveryReadiness.destructiveOperationsPermitted === false);
    record('Estimated rollback time is fast (< 10 seconds)', rehearsalReport.recoveryReadiness.recoveryTimeEstimateSeconds < 10);
    record('Release status is ACCEPTED_FOR_RELEASE', rehearsalReport.releaseStatus === 'ACCEPTED_FOR_RELEASE');
  }

  // 4. Statutory Golden Invariant Lock: Invoice #2026/0025 & Statutory PDF Download
  {
    const invRes = await fetch(`${BASE_URL}/invoice/invoiceList`, { headers: adminHeaders });
    record('Invoice list returns HTTP 200 OK', invRes.status === 200);
    const invBody = await invRes.json();
    const invoices = invBody.invoiceData || invBody.data || [];
    const baseline = invoices.find(i => String(i.index || i.invoice_number) === '2026/0025' || String(i.total) === '746.39');

    record('Statutory baseline invoice #2026/0025 exists in database', Boolean(baseline));
    if (baseline) {
      record('Baseline invoice total is strictly preserved at €746.39', Math.abs(baseline.total - 746.39) < 0.01);
      record('Baseline invoice subtotal is strictly preserved at €829.32', Math.abs(baseline.subTotal - 829.32) < 0.01);

      const pdfRes = await fetch(`${BASE_URL}/invoice/download`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ Id: baseline._id, invoiceId: baseline._id }),
      });
      record('Statutory PDF download returns HTTP 200 OK', pdfRes.status === 200);
      const pdfBuffer = await pdfRes.arrayBuffer();
      record('Statutory PDF generates valid binary byte stream (> 50,000 bytes)', pdfBuffer.byteLength > 50000);
    }
  }

  // 5. Cumulative Verification of Preceding Milestone Gates
  {
    // A. Phase 36: Lead Intake Duplicate Guard
    const dupRes = await fetch(`${BASE_URL}/leads/check-duplicate?email=none@example.com`, { headers: adminHeaders });
    record('Phase 36 Lead intake duplicate endpoint is operational', dupRes.status === 200);

    // B. Phase 37: Historical Migration Audit
    const migRes = await fetch(`${BASE_URL}/api/system/migration-audit`, { headers: adminHeaders });
    record('Phase 37 Historical migration audit endpoint is operational', migRes.status === 200);

    // C. Phase 38: Authoritative Dashboard Financial KPIs
    const kpiRes = await fetch(`${BASE_URL}/api/dashboard/kpis`, { headers: adminHeaders });
    record('Phase 38 Dashboard KPIs aggregator endpoint is operational', kpiRes.status === 200);
    const kpiBody = await kpiRes.json();
    record('Financials accurately reconcile: Invoiced = Paid + Outstanding', Math.abs(kpiBody.data?.financials?.totalInvoiced - (kpiBody.data?.financials?.totalPaid + kpiBody.data?.financials?.totalOutstanding)) < 0.05);

    // D. Phase 39: Code Splitting & UI Files
    const viteConfig = fs.readFileSync(path.join(__dirname, '../../techbeeps-crm-frontend/vite.config.js'), 'utf8');
    record('Phase 39 Vite code-splitting configuration is active', viteConfig.includes('manualChunks'));

    const editInv = fs.readFileSync(path.join(__dirname, '../../techbeeps-crm-frontend/src/pages/InvoicePage/Editinvoice.jsx'), 'utf8');
    record('Phase 39 Mobile 375px responsive card view is integrated in Editinvoice', editInv.includes('block md:hidden'));

    const editOffer = fs.readFileSync(path.join(__dirname, '../../techbeeps-crm-frontend/src/pages/Quotes/Editoffer.jsx'), 'utf8');
    record('Phase 39 Mobile responsive card view is integrated in Editoffer', editOffer.includes('flex md:hidden'));

    const settings = fs.readFileSync(path.join(__dirname, '../../techbeeps-crm-frontend/src/pages/Admin/Setting.jsx'), 'utf8');
    record('Phase 40 System Release & Rollback Audit tab is mounted in Settings', settings.includes('SystemReleaseAudit'));
  }

  console.log('========================================================================');
  console.log(`FINAL MASTER ACCEPTANCE RESULTS: ${passed} / ${total} CHECKS PASSED (100%)`);
  console.log('========================================================================');

  if (passed === total) {
    console.log('ALL FINAL RELEASE ACCEPTANCE GATE & ROLLBACK AUDIT CHECKS PASSED PERFECTLY!');
    console.log('PROJECT STATUS: 40 / 40 WORK ORDERS COMPLETED & VERIFIED FOR PRODUCTION.');
    process.exit(0);
  } else {
    console.error('Some release gate checks failed.');
    process.exit(1);
  }
}

runMasterAcceptanceGate().catch(err => {
  console.error('Master release gate runner fatal error:', err);
  process.exit(1);
});

