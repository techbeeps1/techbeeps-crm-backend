const axios = require('axios');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const BASE_URL = 'http://localhost:8080';
const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';

// Tokens for Admin and Staff
const adminToken = jwt.sign(
  { id: '6ad202dcb67074d4c4540f70', email: 'admin@universalmovers.nl', role: 'Admin' },
  JWT_SECRET,
  { expiresIn: '2h' }
);

const staffToken = jwt.sign(
  { id: '6ad202dcb67074d4c4540f71', email: 'gurjeet@universalmovers.nl', role: 'Staff' },
  JWT_SECRET,
  { expiresIn: '2h' }
);

const adminHeaders = { headers: { Authorization: `Bearer ${adminToken}` } };
const staffHeaders = { headers: { Authorization: `Bearer ${staffToken}` } };

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

async function testEndpoint(name, requestFn) {
  totalTests++;
  try {
    const res = await requestFn();
    if (res.status >= 200 && res.status < 400) {
      console.log(`  ✓ PASS: ${name} (HTTP ${res.status})`);
      passedTests++;
      return res.data;
    } else {
      console.error(`  ✗ FAIL: ${name} (Unexpected HTTP ${res.status})`);
      failedTests++;
      failures.push({ name, error: `HTTP ${res.status}` });
      return null;
    }
  } catch (err) {
    const status = err.response?.status || 'ERR';
    const msg = err.response?.data?.message || err.message;
    console.error(`  ✗ FAIL: ${name} (HTTP ${status}: ${msg})`);
    failedTests++;
    failures.push({ name, error: `HTTP ${status}: ${msg}` });
    return null;
  }
}

async function runAudit() {
  console.log('================================================================');
  console.log('COMPREHENSIVE CRM SYSTEM & ENDPOINT HEALTH AUDIT');
  console.log('Testing: Core APIs, Staff Access, Jobs, Invoices, Planning, etc.');
  console.log('================================================================\n');

  // 1. Health & CORS
  console.log('--- 1. Infrastructure, Health & CORS ---');
  await testEndpoint('GET /health (probe test)', () => axios.get(`${BASE_URL}/health`));
  await testEndpoint('GET /api/health (probe test)', () => axios.get(`${BASE_URL}/api/health`));
  await testEndpoint('OPTIONS /invoice/new_invoice (Preflight)', () =>
    axios.options(`${BASE_URL}/invoice/new_invoice`, {
      headers: {
        'Origin': 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, X-Idempotency-Key, Authorization'
      }
    })
  );

  // 2. Settings & Company Config
  console.log('\n--- 2. App Settings & Company Details ---');
  await testEndpoint('GET /api/available-settings (Staff)', () => axios.get(`${BASE_URL}/api/available-settings`, staffHeaders));
  await testEndpoint('GET /api/company-details (Staff)', () => axios.get(`${BASE_URL}/api/company-details`, staffHeaders));
  await testEndpoint('GET /api/services (Staff)', () => axios.get(`${BASE_URL}/api/services`, staffHeaders));

  // 3. Customers & Leads
  console.log('\n--- 3. Customers & Leads ---');
  await testEndpoint('GET /customer/customerList (Staff)', () => axios.get(`${BASE_URL}/customer/customerList`, staffHeaders));
  await testEndpoint('GET /leads/leadList (Staff)', () => axios.get(`${BASE_URL}/leads/leadList`, staffHeaders));

  // 4. Jobs & Schedules
  console.log('\n--- 4. Jobs & Scheduling ---');
  const jobsData = await testEndpoint('GET /api/jobList (Staff)', () => axios.get(`${BASE_URL}/api/jobList`, staffHeaders));
  const jobs = jobsData?.jobs || jobsData?.jobSchedules || [];
  const sampleJob = jobs[0] || null;

  if (sampleJob) {
    await testEndpoint(`GET /api/jobs/${sampleJob._id} (Staff)`, () => axios.get(`${BASE_URL}/api/jobs/${sampleJob._id}`, staffHeaders));
    await testEndpoint(`GET /api/notesListByJobId?jobId=${sampleJob._id} (Staff)`, () =>
      axios.get(`${BASE_URL}/api/notesListByJobId?jobId=${sampleJob._id}`, staffHeaders)
    );
    await testEndpoint(`PUT /api/job-schedule/${sampleJob._id} (Staff job update check)`, () =>
      axios.put(`${BASE_URL}/api/job-schedule/${sampleJob._id}`, { remarks: sampleJob.remarks || '' }, staffHeaders)
    );
  }

  // 5. Valuation
  console.log('\n--- 5. Valuation Module ---');
  await testEndpoint('GET /api/room (Staff)', () => axios.get(`${BASE_URL}/api/room`, staffHeaders));
  await testEndpoint('GET /api/furniture (Staff)', () => axios.get(`${BASE_URL}/api/furniture`, staffHeaders));
  await testEndpoint('GET /api/services (Valuation services) (Staff)', () => axios.get(`${BASE_URL}/api/services`, staffHeaders));

  // 6. Templates & Sales Groups
  console.log('\n--- 6. Financial Templates & Sales Groups ---');
  await testEndpoint('GET /api/templates?type=invoice (Staff)', () => axios.get(`${BASE_URL}/api/templates?type=invoice`, staffHeaders));
  await testEndpoint('GET /api/sale_group?type=salesGroup (Staff)', () => axios.get(`${BASE_URL}/api/sale_group?type=salesGroup`, staffHeaders));
  await testEndpoint('GET /api/sale_group?type=tax (Staff)', () => axios.get(`${BASE_URL}/api/sale_group?type=tax`, staffHeaders));

  // 7. Invoices (Staff Access & Operations)
  console.log('\n--- 7. Invoices & Workflow Creation ---');
  await testEndpoint('GET /invoice/invoiceList (Staff)', () => axios.get(`${BASE_URL}/invoice/invoiceList`, staffHeaders));
  await testEndpoint('GET /invoice/invoiceCount (Staff)', () => axios.get(`${BASE_URL}/invoice/invoiceCount`, staffHeaders));

  // Baseline invoice #2026/0025 check
  const baselineId = '6ad202dcb67074d4c4540f79';
  const baselineDetail = await testEndpoint(`GET /invoice/invoice/${baselineId} (Staff)`, () =>
    axios.get(`${BASE_URL}/invoice/invoice/${baselineId}`, staffHeaders)
  );

  if (baselineDetail?.invoice) {
    const total = Number(baselineDetail.invoice.total);
    totalTests++;
    if (Math.abs(total - 746.39) < 0.01) {
      console.log(`  ✓ PASS: Baseline invoice #2026/0025 total strictly €746.39 (got €${total.toFixed(2)})`);
      passedTests++;
    } else {
      console.error(`  ✗ FAIL: Baseline invoice total mismatch: expected 746.39, got ${total}`);
      failedTests++;
      failures.push({ name: 'Baseline total check', error: `got ${total}` });
    }
  }

  // Baseline PDF download
  await testEndpoint(`POST /invoice/download for baseline invoice (Staff)`, () =>
    axios.post(
      `${BASE_URL}/invoice/download`,
      { Id: baselineId },
      { headers: staffHeaders.headers, responseType: 'arraybuffer' }
    )
  );

  // 8. Payment Ledger & Balance
  console.log('\n--- 8. Financial Ledger, Balance & Payments ---');
  await testEndpoint('GET /api/payments (Staff)', () => axios.get(`${BASE_URL}/api/payments`, staffHeaders));
  await testEndpoint('GET /api/financial-audit-log (Staff)', () => axios.get(`${BASE_URL}/api/financial-audit-log`, staffHeaders));

  // 9. Planning & Calendar
  console.log('\n--- 9. Planning & Calendar ---');
  await testEndpoint('GET /api/appointment (Staff)', () => axios.get(`${BASE_URL}/api/appointment`, staffHeaders));
  await testEndpoint('GET /api/availability/employee/6ad202dcb67074d4c4540f71 (Staff)', () =>
    axios.get(`${BASE_URL}/api/availability/employee/6ad202dcb67074d4c4540f71`, staffHeaders)
  );

  // 10. Tasks Module
  console.log('\n--- 10. Tasks Module ---');
  await testEndpoint('GET /api/task/ (Staff)', () => axios.get(`${BASE_URL}/api/task/`, staffHeaders));

  // 11. Resources
  console.log('\n--- 11. Resources (Vehicles, Staff, Storage, Materials) ---');
  await testEndpoint('GET /api/vehicles (Staff)', () => axios.get(`${BASE_URL}/api/vehicles`, staffHeaders));
  await testEndpoint('GET /api/moving-boxes (Staff)', () => axios.get(`${BASE_URL}/api/moving-boxes`, staffHeaders));
  await testEndpoint('GET /api/storage_loaction (Staff)', () => axios.get(`${BASE_URL}/api/storage_loaction`, staffHeaders));
  await testEndpoint('GET /api/warehouses (Staff)', () => axios.get(`${BASE_URL}/api/warehouses`, staffHeaders));

  // 12. Claims & HR
  console.log('\n--- 12. Claims & Leave / HRM ---');
  await testEndpoint('GET /api/damage-claims/ (Staff)', () => axios.get(`${BASE_URL}/api/damage-claims/`, staffHeaders));
  await testEndpoint('GET /api/leave/requests (Staff)', () => axios.get(`${BASE_URL}/api/leave/requests`, staffHeaders));
  await testEndpoint('GET /api/leave/balances (Staff)', () => axios.get(`${BASE_URL}/api/leave/balances`, staffHeaders));

  // Summary
  console.log('\n================================================================');
  console.log(`AUDIT COMPLETE: ${passedTests} passed, ${failedTests} failed out of ${totalTests} checks`);
  console.log('================================================================');

  if (failures.length > 0) {
    console.log('\nFailures summary:');
    failures.forEach(f => console.log(`  - ${f.name}: ${f.error}`));
  }
}

runAudit().catch(err => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});
