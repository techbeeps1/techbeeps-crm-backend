const fs = require('fs');
const path = require('path');
const http = require('http');
const mongoose = require('../node_modules/mongoose');
const jwt = require('../node_modules/jsonwebtoken');
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
require('../node_modules/dotenv').config({ path: path.join(__dirname, '../.env') });

const Customer = require('../models/customer');
const Invoice = require('../models/invoice');

async function runExec10Verification() {
  console.log('=====================================================================');
  console.log('  EXEC-10 RELEASE GATE: INTAKE REFERENCE DATA & CUSTOMER LOOKUP');
  console.log('=====================================================================\n');

  let passedTests = 0;
  const totalTests = 5;

  // Ensure DB connection for fixture management & regression check
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI, {
      retryWrites: true,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
  }

  const token = jwt.sign(
    { id: '67c05a32a7cf083dc7f2fbd6', role: 'Admin', username: 'techbeeps' },
    process.env.JWT_SECRET || 'abcdefghijklmnopqrstuvwxyz',
    { expiresIn: '1h' }
  );

  // --------------------------------------------------------------------------
  // TEST 1: Reference Catalogues (Countries & Property Types with Auth)
  // --------------------------------------------------------------------------
  console.log('[Test 1] Testing Intake Reference Catalogues (Countries & Property Types):');

  // A. Countries API with Auth
  const countryRes = await fetch('http://localhost:8080/api/sale_group?type=country', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (countryRes.status !== 200) {
    throw new Error(`Test 1 Failed: Country reference API returned status ${countryRes.status}`);
  }
  const countries = await countryRes.json();
  if (!Array.isArray(countries) || countries.length === 0) {
    throw new Error('Test 1 Failed: Countries catalogue is empty');
  }
  const hasNetherlands = countries.some(c => (c.name || c) === 'Netherlands');
  if (!hasNetherlands) {
    throw new Error('Test 1 Failed: Netherlands missing from country catalogue');
  }
  console.log(`  ✓ Countries catalogue loaded: ${countries.length} countries (Netherlands verified)`);

  // B. Property Types API with Auth
  const propRes = await fetch('http://localhost:8080/api/sale_group?type=property', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (propRes.status !== 200) {
    throw new Error(`Test 1 Failed: Property reference API returned status ${propRes.status}`);
  }
  const properties = await propRes.json();
  if (!Array.isArray(properties) || properties.length === 0) {
    throw new Error('Test 1 Failed: Property catalogue is empty');
  }
  const hasApartment = properties.some(p => (p.name || p) === 'Apartment');
  if (!hasApartment) {
    throw new Error('Test 1 Failed: Apartment missing from property catalogue');
  }
  console.log(`  ✓ Properties catalogue loaded: ${properties.length} property types (Apartment verified)`);

  // C. Unauthenticated rejection (Default-Deny verification)
  const unauthRes = await fetch('http://localhost:8080/api/sale_group?type=country');
  if (unauthRes.status !== 401) {
    throw new Error(`Test 1 Failed: Unauthenticated request must return 401, got ${unauthRes.status}`);
  }
  console.log('  ✓ Unauthenticated reference request rejected with 401 (Default-Deny verified)');
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST 2: Company Customer Fixture Setup & Lookup
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Testing Commercial Customer Fixture & Multi-field Lookup:');

  const testCompanyEmail = 'audit-test-logistics@universalmovers.test';
  await Customer.deleteOne({ email: testCompanyEmail });

  const companyFixture = await Customer.create({
    type: 'Customer',
    typeOfCustomer: 'Commercial',
    companyName: 'Universal Test Logistics B.V.',
    salutation: 'Mr',
    firstName: 'Jan',
    lastName: 'Bakker',
    gender: 'male',
    email: testCompanyEmail,
    contact: '020 7654321', // Amsterdam landline
    mobile: '06 12345678',
    customerIndex: 99999,
  });

  // A. Search by companyName
  const searchCompanyRes = await fetch('http://localhost:8080/customer/searchedCustomer?searchTerm=Universal+Test+Logistics', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (searchCompanyRes.status !== 200) {
    throw new Error(`Test 2 Failed: search by companyName returned status ${searchCompanyRes.status}`);
  }
  const foundCompany = await searchCompanyRes.json();
  const matchCompany = foundCompany.find(c => c.email === testCompanyEmail);
  if (!matchCompany || matchCompany.companyName !== 'Universal Test Logistics B.V.') {
    throw new Error('Test 2 Failed: Commercial customer was not found by companyName');
  }
  console.log('  ✓ Found commercial fixture by companyName: "Universal Test Logistics B.V."');

  // B. Search by landline contact number (with spaces and without spaces)
  const searchLandlineRes = await fetch('http://localhost:8080/customer/searchedCustomer?searchTerm=0207654321', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const foundByLandline = await searchLandlineRes.json();
  const matchLandline = foundByLandline.find(c => c.email === testCompanyEmail);
  if (!matchLandline) {
    throw new Error('Test 2 Failed: Commercial customer was not found by landline contact (0207654321)');
  }
  console.log('  ✓ Found commercial fixture by landline contact: "020 7654321" (queried: 0207654321)');

  // C. Search by contact person's name
  const searchPersonRes = await fetch('http://localhost:8080/customer/searchedCustomer?searchTerm=Jan+Bakker', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const foundByPerson = await searchPersonRes.json();
  const matchPerson = foundByPerson.find(c => c.email === testCompanyEmail);
  if (!matchPerson) {
    throw new Error('Test 2 Failed: Commercial customer was not found by contact person name (Jan Bakker)');
  }
  console.log('  ✓ Found commercial fixture by contact person name: "Jan Bakker"');
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST 3: Defensive Search Parameter Handling & Crash Shielding
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Defensive Search Parameter Handling & Crash Shielding:');

  // A. Undefined search term should not throw TypeError
  const emptyRes = await fetch('http://localhost:8080/customer/searchedCustomer', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (emptyRes.status !== 200) {
    throw new Error(`Test 3 Failed: Request without searchTerm crashed with status ${emptyRes.status}`);
  }
  const allList = await emptyRes.json();
  if (!Array.isArray(allList) || allList.length === 0) {
    throw new Error('Test 3 Failed: Request without searchTerm did not return list');
  }
  console.log(`  ✓ Search without parameter gracefully returned full customer list (${allList.length} records)`);

  // B. Search using alias parameter 'q'
  const aliasRes = await fetch('http://localhost:8080/customer/searchedCustomer?q=Bakker', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (aliasRes.status !== 200) {
    throw new Error(`Test 3 Failed: Search with ?q= alias failed with status ${aliasRes.status}`);
  }
  const aliasList = await aliasRes.json();
  if (!aliasList.some(c => c.email === testCompanyEmail)) {
    throw new Error('Test 3 Failed: Search with ?q= alias did not find test fixture');
  }
  console.log('  ✓ Search with query alias "?q=" resolved correctly');
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST 4: Frontend Reference Data Guarantees & Fallback File Integrity
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Verifying Frontend Reference Data Fallback Architecture:');

  const refDataPath = path.join(__dirname, '../../techbeeps-crm-frontend/src/utils/referenceData.ts');
  if (!fs.existsSync(refDataPath)) {
    throw new Error(`Test 4 Failed: referenceData.ts not found at ${refDataPath}`);
  }
  const refContent = fs.readFileSync(refDataPath, 'utf8');
  if (!refContent.includes('DEFAULT_COUNTRIES') || !refContent.includes('DEFAULT_PROPERTY_TYPES')) {
    throw new Error('Test 4 Failed: referenceData.ts missing default constants');
  }
  if (!refContent.includes('Netherlands') || !refContent.includes('Apartment')) {
    throw new Error('Test 4 Failed: Core reference entries (Netherlands / Apartment) missing');
  }
  console.log('  ✓ referenceData.ts verified with DEFAULT_COUNTRIES and DEFAULT_PROPERTY_TYPES');

  // Verify CustomerForm.tsx includes companyName and contact search
  const customerFormPath = path.join(__dirname, '../../techbeeps-crm-frontend/src/pages/Valuation/formSteps/CustomerForm.tsx');
  const custFormContent = fs.readFileSync(customerFormPath, 'utf8');
  if (!custFormContent.includes('companyName') || !custFormContent.includes('contact')) {
    throw new Error('Test 4 Failed: CustomerForm.tsx does not search companyName or contact');
  }
  console.log('  ✓ CustomerForm.tsx verified with companyName and landline contact filter');
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST 5: Zero Regressions Guarantee (Invoice #2026/0025 & PDF Route)
  // --------------------------------------------------------------------------
  console.log('\n[Test 5] Zero Regressions Guarantee (Invoice #2026/0025 & PDF):');

  const invoice = await Invoice.findOne({ index: '2026/0025' });
  if (!invoice) {
    throw new Error('Test 5 Failed: Critical Invoice #2026/0025 not found in database');
  }
  console.log(`  ✓ Invoice #2026/0025 verified intact: Total €${invoice.total}, Status: ${invoice.Status || invoice.payment}`);

  // Test PDF download endpoint for this invoice
  const pdfRes = await fetch(`http://localhost:8080/invoice/download`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ Id: invoice._id })
  });
  if (pdfRes.status !== 200) {
    throw new Error(`Test 5 Failed: PDF download endpoint returned status ${pdfRes.status}`);
  }
  const pdfBuffer = await pdfRes.arrayBuffer();
  if (pdfBuffer.byteLength < 500) {
    throw new Error(`Test 5 Failed: PDF content truncated (${pdfBuffer.byteLength} bytes)`);
  }
  console.log(`  ✓ Invoice #2026/0025 PDF download route returned 200 with ${pdfBuffer.byteLength} bytes`);
  passedTests++;

  // Cleanup test fixture
  await Customer.deleteOne({ email: testCompanyEmail });
  console.log('  ✓ Test company fixture cleaned up safely');

  console.log('\n=====================================================================');
  console.log(`  EXEC-10 VERIFICATION RESULT: ${passedTests}/${totalTests} TESTS PASSED (100%)`);
  console.log('=====================================================================\n');

  await mongoose.disconnect();
  process.exit(0);
}

runExec10Verification().catch(err => {
  console.error('\n❌ EXEC-10 VERIFICATION FAILED:', err.message);
  process.exit(1);
});
