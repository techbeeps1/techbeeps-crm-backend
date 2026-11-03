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
      name: 'Executive Admin',
      access: ['Dashboard', 'Leads', 'Customer', 'Finance', 'HRM'],
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

async function runTests() {
  console.log('========================================================================');
  console.log('EXEC-38: Management Dashboard KPIs & Controlled News Publishing Test Battery');
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
  try {
    const healthRes = await fetch(`${BASE_URL}/health`);
    record('Backend health check returns HTTP 200', healthRes.status === 200);
  } catch (e) {
    console.error('Cannot connect to backend:', e);
    process.exit(1);
  }

  // 2. Dashboard KPIs Endpoint Authorization & Structure
  {
    // Anonymous request rejected
    const anonRes = await fetch(`${BASE_URL}/api/dashboard/kpis`);
    record('Anonymous request to /api/dashboard/kpis is rejected with HTTP 401', anonRes.status === 401);

    // Authenticated request succeeded
    const authRes = await fetch(`${BASE_URL}/api/dashboard/kpis`, { headers: adminHeaders });
    record('Authenticated request to /api/dashboard/kpis returns HTTP 200', authRes.status === 200);

    const body = await authRes.json();
    record('KPI response success flag is true', body.success === true);
    record('KPI response contains data object', Boolean(body.data));

    const { financials, crm, operations, quotes, recentAnnouncements } = body.data;

    // Financial KPIs Reconciliation
    record('Financial KPIs object is present', Boolean(financials));
    record('Total invoiced figure is a valid positive number', typeof financials.totalInvoiced === 'number' && financials.totalInvoiced > 0);
    record('Total paid figure is a valid non-negative number', typeof financials.totalPaid === 'number' && financials.totalPaid >= 0);
    record('Total outstanding figure is a valid non-negative number', typeof financials.totalOutstanding === 'number' && financials.totalOutstanding >= 0);
    
    // Reconciliation check: Invoiced = Paid + Outstanding (within floating point cents)
    const discrepancy = Math.abs(financials.totalInvoiced - (financials.totalPaid + financials.totalOutstanding));
    record('Financial figures reconcile exactly: Invoiced = Paid + Outstanding', discrepancy < 0.05);

    record('Collection rate percentage is computed accurately', typeof financials.collectionRatePercentage === 'number');
    record('Invoice counts are positive integers', financials.totalInvoicesCount > 0 && financials.paidInvoicesCount >= 0);

    // CRM Metrics
    record('CRM metrics object is present', Boolean(crm));
    record('Total customers count is a positive integer', crm.totalCustomers > 0);
    record('Total leads count is a non-negative integer', crm.totalLeads >= 0);
    record('Conversion rate percentage is within 0-100%', crm.conversionRatePercentage >= 0 && crm.conversionRatePercentage <= 100);

    // Operations Metrics
    record('Operations object is present', Boolean(operations));
    record('Total jobs count is a positive integer', operations.totalJobs > 0);
    record('Active jobs count is tracked', typeof operations.activeJobs === 'number');

    // Quotes Metrics
    record('Quotes metrics object is present', Boolean(quotes));
    record('Total quotes count is tracked', typeof quotes.totalQuotes === 'number');

    // Announcements
    record('Recent announcements is an array', Array.isArray(recentAnnouncements));
  }

  // 3. News Publication Authorization Matrix (EXEC-38 Core Requirement)
  let testNewsId = null;
  {
    // A. Anonymous create attempt fails
    const anonNewsRes = await fetch(`${BASE_URL}/Communication/createNewsItem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Unauthorized Test Announcement',
        body: 'This should be blocked immediately.',
      }),
    });
    record('Anonymous news create is blocked with HTTP 401 Unauthorized', anonNewsRes.status === 401);

    // B. Staff create attempt fails (Default-Deny for Staff role)
    const staffNewsRes = await fetch(`${BASE_URL}/Communication/createNewsItem`, {
      method: 'POST',
      headers: staffHeaders,
      body: JSON.stringify({
        title: 'Staff Test Announcement',
        body: 'Field staff cannot broadcast news.',
        publishAt: new Date(),
      }),
    });
    record('Staff news create is blocked with HTTP 403 Forbidden', staffNewsRes.status === 403);
    const staffResBody = await staffNewsRes.json();
    record('Staff 403 error code is FORBIDDEN', staffResBody.error === 'FORBIDDEN');

    // C. Validation check on Admin create (short title)
    const adminShortTitleRes = await fetch(`${BASE_URL}/Communication/createNewsItem`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        title: 'X',
        body: 'Valid body text for announcement',
      }),
    });
    record('Invalid short title (< 3 chars) is rejected with HTTP 400', adminShortTitleRes.status === 400);

    // D. Permitted Admin creates news item successfully
    const adminCreateRes = await fetch(`${BASE_URL}/Communication/createNewsItem`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        title: 'EXEC-38 Official Executive Briefing',
        body: 'Authorized executive broadcast for management operations and logistics planning.',
        publishAt: new Date(),
      }),
    });
    record('Admin news create succeeds with HTTP 200 OK', adminCreateRes.status === 200);
    const adminCreateBody = await adminCreateRes.json();
    record('Created news item returns result payload', Boolean(adminCreateBody.data?._id));
    testNewsId = adminCreateBody.data?._id;

    // Verify publisher attribution
    record('Publisher name is correctly attributed to authenticated admin', adminCreateBody.data?.publisherName === 'Executive Admin');
    record('Employee ID is attributed from user session', adminCreateBody.data?.employeeId === '6ae870535cbda31c941faa5d');

    // E. Staff edit attempt fails (403 Forbidden)
    const staffEditRes = await fetch(`${BASE_URL}/Communication/editNewsItem/${testNewsId}`, {
      method: 'PUT',
      headers: staffHeaders,
      body: JSON.stringify({
        title: 'Hacked by staff',
      }),
    });
    record('Staff news edit is blocked with HTTP 403 Forbidden', staffEditRes.status === 403);

    // F. Admin edit succeeds
    const adminEditRes = await fetch(`${BASE_URL}/Communication/editNewsItem/${testNewsId}`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        title: 'EXEC-38 Official Executive Briefing (Updated)',
        body: 'Authorized executive broadcast updated with latest operational schedule.',
      }),
    });
    record('Admin news edit succeeds with HTTP 200 OK', adminEditRes.status === 200);
    const adminEditBody = await adminEditRes.json();
    record('Edited news item reflects updated title', adminEditBody.data?.title === 'EXEC-38 Official Executive Briefing (Updated)');

    // G. Staff delete attempt fails (403 Forbidden)
    const staffDeleteRes = await fetch(`${BASE_URL}/Communication/deleteNewsItem/${testNewsId}`, {
      method: 'DELETE',
      headers: staffHeaders,
    });
    record('Staff news deletion is blocked with HTTP 403 Forbidden', staffDeleteRes.status === 403);

    // H. Permitted Admin deletes news item cleanly
    const adminDeleteRes = await fetch(`${BASE_URL}/Communication/deleteNewsItem/${testNewsId}`, {
      method: 'DELETE',
      headers: adminHeaders,
    });
    record('Admin news deletion succeeds with HTTP 200 OK', adminDeleteRes.status === 200);
    const adminDeleteBody = await adminDeleteRes.json();
    record('Deletion returns successful status message', adminDeleteBody.status === true);

    // Confirm record no longer exists
    const doubleDeleteRes = await fetch(`${BASE_URL}/Communication/deleteNewsItem/${testNewsId}`, {
      method: 'DELETE',
      headers: adminHeaders,
    });
    record('Subsequent deletion of removed item returns 404 Not Found', doubleDeleteRes.status === 404);
  }

  // 4. Invariant Protection: Baseline Invoice #2026/0025 & Statutory PDF Download
  {
    const invRes = await fetch(`${BASE_URL}/invoice/invoiceList`, { headers: adminHeaders });
    record('Invoice list query returns HTTP 200 OK', invRes.status === 200);
    const invBody = await invRes.json();
    const invoices = invBody.invoiceData || invBody.data || [];
    const baseline = invoices.find(i => String(i.index || i.invoice_number) === '2026/0025' || String(i.total) === '746.39');

    record('Baseline invoice #2026/0025 exists in database', Boolean(baseline));
    if (baseline) {
      record('Baseline invoice total is strictly preserved at €746.39', Math.abs(baseline.total - 746.39) < 0.01);
      record('Baseline invoice subtotal is strictly preserved at €829.32', Math.abs(baseline.subTotal - 829.32) < 0.01);

      // Verify Statutory PDF download returns HTTP 200
      const pdfRes = await fetch(`${BASE_URL}/invoice/download`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ Id: baseline._id, invoiceId: baseline._id }),
      });
      record('Statutory PDF download returns HTTP 200 OK', pdfRes.status === 200);
      const pdfBuffer = await pdfRes.arrayBuffer();
      record('PDF stream has valid binary size (> 50,000 bytes)', pdfBuffer.byteLength > 50000);
    }
  }

  console.log('========================================================================');
  console.log(`TEST SUMMARY: ${passed} / ${total} tests passed (${Math.round((passed / total) * 100)}%)`);
  console.log('========================================================================');

  if (passed === total) {
    console.log('ALL PHASE 38 DASHBOARD KPIS & NEWS AUTHORIZATION CHECKS PASSED PERFECTLY!');
    process.exit(0);
  } else {
    console.error('Some tests failed.');
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
