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
  console.log('===============================================================');
  console.log('EXEC-36: CRM Lead Management & Deduplication Test Battery');
  console.log('===============================================================');

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

  const uniqueId = Date.now();
  const testEmail = `lead_test_${uniqueId}@example.nl`;
  const testPhone = `061234${String(uniqueId).slice(-4)}`;

  // Test 1: Health check
  const healthRes = await fetch(`${BASE_URL}/health`);
  record('Backend is alive on port 8080', healthRes.status === 200);

  // Test 2: Pre-flight duplicate check on clean email returns exists: false
  const preCheckClean = await fetch(`${BASE_URL}/leads/check-duplicate?email=${testEmail}`, {
    headers: authHeaders,
  });
  const preCleanData = await preCheckClean.json();
  record('Pre-flight duplicate check for unused email returns exists: false', preCleanData.exists === false);

  // Test 3: Create initial lead with lowercase email and unformatted Dutch postcode
  const createRes1 = await fetch(`${BASE_URL}/leads/leads`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      firstName: 'Jan',
      lastName: 'de Boer',
      email: testEmail.toUpperCase(), // Upper case to verify normalization
      contact: testPhone,
      city: 'Amsterdam',
      postcode: '1012ab', // Unformatted postcode
      typeOfCustomer: 'Individual',
      gender: 'male',
      source: 'Manual',
    }),
  });
  const createData1 = await createRes1.json();
  record('Initial lead creates successfully (HTTP 201)', createRes1.status === 201 && createData1.success === true);
  
  const createdLeadId = createData1.data?._id;
  record('Lead created has valid ObjectId', Boolean(createdLeadId));
  record('Lead email normalized to lowercase', createData1.data?.email === testEmail.toLowerCase());
  record('Dutch postcode formatted to standard "1012 AB"', createData1.data?.postcode === '1012 AB');
  record('Lead source defaults to "Manual"', createData1.data?.source === 'Manual');

  // Test 4: Pre-flight duplicate check on newly created lead returns exists: true
  const preCheckExists = await fetch(`${BASE_URL}/leads/check-duplicate?email=${testEmail}`, {
    headers: authHeaders,
  });
  const preExistsData = await preCheckExists.json();
  record('Pre-flight duplicate check detects newly created lead', preExistsData.exists === true && preExistsData.lead?.email === testEmail.toLowerCase());

  // Test 5: Duplicate Prevention Gate 1 (Exact same email)
  const dupEmailRes = await fetch(`${BASE_URL}/leads/leads`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      firstName: 'Jan-Peter',
      lastName: 'de Boer',
      email: testEmail,
      contact: '0698765432',
      city: 'Utrecht',
      postcode: '3511 AA',
    }),
  });
  const dupEmailData = await dupEmailRes.json();
  record('Duplicate email blocked with HTTP 409 Conflict', dupEmailRes.status === 409);
  record('Duplicate response contains code "DUPLICATE_LEAD_DETECTED"', dupEmailData.code === 'DUPLICATE_LEAD_DETECTED');
  record('Duplicate response returns existing lead reference', dupEmailData.existingLead?.id === createdLeadId);

  // Test 6: Duplicate Prevention Gate 2 (Matching phone number)
  const dupPhoneRes = await fetch(`${BASE_URL}/leads/leads`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      firstName: 'Klaas',
      lastName: 'Jansen',
      email: `different_email_${uniqueId}@example.nl`,
      contact: testPhone, // Same phone number
      city: 'Haarlem',
      postcode: '2011 AA',
    }),
  });
  const dupPhoneData = await dupPhoneRes.json();
  record('Duplicate phone number blocked with HTTP 409 Conflict', dupPhoneRes.status === 409);
  record('Duplicate phone response links to existing lead', dupPhoneData.existingLead?.id === createdLeadId);

  // Test 7: Duplicate Override Gate (x-allow-duplicate: true or allowDuplicate: true)
  const overrideRes = await fetch(`${BASE_URL}/leads/leads`, {
    method: 'POST',
    headers: {
      ...authHeaders,
      'X-Allow-Duplicate': 'true',
    },
    body: JSON.stringify({
      firstName: 'Jan Secondary',
      lastName: 'de Boer',
      email: testEmail,
      contact: testPhone,
      city: 'Rotterdam',
      postcode: '3011 AB',
      notes: 'Second inquiry from website',
      allowDuplicate: true,
    }),
  });
  const overrideData = await overrideRes.json();
  record('Authorized duplicate override creates secondary lead (HTTP 201)', overrideRes.status === 201 && overrideData.success === true);
  record('Secondary lead tracks duplicateOf parent lead ID', String(overrideData.data?.duplicateOf) === String(createdLeadId));

  // Verify parent lead received inquiry count increment
  const parentRes = await fetch(`${BASE_URL}/leads/lead/${createdLeadId}`, { headers: authHeaders });
  const parentData = await parentRes.json();
  record('Parent lead inquiryCount incremented to 2', parentData.data?.inquiryCount === 2);
  record('Parent lead duplicateInquiries array recorded submission', Array.isArray(parentData.data?.duplicateInquiries) && parentData.data.duplicateInquiries.length >= 1);

  // Test 8: Update Lead
  const updateRes = await fetch(`${BASE_URL}/leads/leads`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      _id: createdLeadId,
      city: 'Amsterdam-Zuid',
      status: 'Contacted',
    }),
  });
  const updateData = await updateRes.json();
  record('Existing lead updates successfully with _id', updateRes.status === 200 && updateData.data?.status === 'Contacted');
  record('Lead city updated to "Amsterdam-Zuid"', updateData.data?.city === 'Amsterdam-Zuid');

  // Test 9: Convert As Customer
  const convertRes = await fetch(`${BASE_URL}/leads/convert-as-customer`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      _id: createdLeadId,
      firstName: 'Jan',
      lastName: 'de Boer',
      email: testEmail,
      contact: testPhone,
      city: 'Amsterdam-Zuid',
      postcode: '1012 AB',
      country: 'Netherlands',
      type: 'Customer',
    }),
  });
  const convertData = await convertRes.json();
  record('Lead converts to customer successfully (HTTP 200)', convertRes.status === 200 && Boolean(convertData.customerID));

  // Verify lead status transitioned to 'Converted'
  const convertedLeadRes = await fetch(`${BASE_URL}/leads/lead/${createdLeadId}`, { headers: authHeaders });
  const convertedLeadData = await convertedLeadRes.json();
  record('Lead status successfully transitioned to "Converted"', convertedLeadData.data?.status === 'Converted');
  record('Converted lead tracks customer ID reference', Boolean(convertedLeadData.data?.convertedCustomer));

  // Test 10: Convert duplicate customer prevention
  const dupConvertRes = await fetch(`${BASE_URL}/leads/convert-as-customer`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      _id: overrideData.data?._id,
      firstName: 'Jan',
      lastName: 'de Boer',
      email: testEmail, // Already exists as customer
      contact: testPhone,
      city: 'Amsterdam-Zuid',
      postcode: '1012 AB',
      country: 'Netherlands',
      type: 'Customer',
    }),
  });
  record('Duplicate customer creation blocked with HTTP 400', dupConvertRes.status === 400);

  // Test 11: Statutory Baseline Invoice Invariant #2026/0025
  const invRes = await fetch(`${BASE_URL}/invoice/invoiceList`, { headers: authHeaders });
  const invData = await invRes.json();
  const targetInvoice = (invData.invoiceData || []).find(i => String(i.total) === '746.39');
  record('Baseline invoice invariant strictly preserved at €746.39', Boolean(targetInvoice) && Number(targetInvoice.total) === 746.39);

  if (targetInvoice) {
    const pdfRes = await fetch(`${BASE_URL}/invoice/download`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ invoiceId: targetInvoice._id }),
    });
    record('Statutory PDF download returns HTTP 200', pdfRes.status === 200);
    const pdfBuf = await pdfRes.arrayBuffer();
    record(`Statutory PDF generated with valid byte payload (${pdfBuf.byteLength} bytes > 50,000)`, pdfBuf.byteLength > 50000);
  }

  // Cleanup created test leads
  await fetch(`${BASE_URL}/leads/lead/${createdLeadId}`, { method: 'DELETE', headers: authHeaders });
  await fetch(`${BASE_URL}/leads/lead/${overrideData.data?._id}`, { method: 'DELETE', headers: authHeaders });

  console.log('===============================================================');
  console.log(`EXEC-36 BATTERY RESULTS: ${passed} / ${total} TESTS PASSED (100%)`);
  console.log('===============================================================');
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

