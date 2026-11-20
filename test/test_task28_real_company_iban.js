const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const axios = require('axios');
const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Finance = require('../models/finance');
const Customer = require('../models/customer');
const Address = require('../models/addressModel');
const CompanyDetails = require('../models/companyModel');
const { executeAcceptance } = require('../utils/quoteAcceptanceEngine');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

let testCustomer;
let testQuote;
let originalCompanyDetails;

async function setup() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('[Setup] Connected to MongoDB');

  // Save original company details
  originalCompanyDetails = await CompanyDetails.findOne().lean();

  await Customer.deleteMany({ email: /jan\.devries\.iban\.test/ });
  await Finance.deleteMany({ capabilityToken: /CAP-IBAN-TEST/ });

  const testAddr = await Address.create({
    street: 'Keizersgracht',
    houseNumber: '421',
    postcode: '1016 EK',
    city: 'Amsterdam',
    country: 'Netherlands'
  });

  testCustomer = await Customer.create({
    firstName: 'Jan',
    lastName: 'de Vries',
    email: `jan.devries.iban.test.${Date.now()}@example.com`,
    contact: '0612345678',
    address: [testAddr._id]
  });

  testQuote = await Finance.create({
    capabilityToken: `CAP-IBAN-TEST-${Date.now()}`,
    customer: testCustomer._id,
    Status: 'Pending',
    date: new Date(),
    expire_date: new Date(Date.now() + 30 * 86400000),
    total: 850,
    subtotal: 700,
    subTotal: 700,
    btw: 150,
    tax: 150,
    version: 1,
    isAccepted: false,
    items: [
      {
        description: 'Standard Relocation Service',
        price: 700,
        quantity: 1,
        lineTotal: 700,
        btw: 21,
        tax: 21
      }
    ]
  });
}

async function cleanup() {
  try {
    if (testQuote) await Finance.deleteOne({ _id: testQuote._id });
    if (testCustomer) await Customer.deleteOne({ _id: testCustomer._id });

    // Restore original company details
    if (originalCompanyDetails) {
      await CompanyDetails.updateOne(
        { _id: originalCompanyDetails._id },
        { $set: originalCompanyDetails }
      );
    }
    await mongoose.disconnect();
    console.log('[Cleanup] Finished');
  } catch (err) {
    console.error('Error during cleanup:', err.message);
  }
}

async function runTests() {
  try {
    await setup();
    console.log('\n=== RUNNING TASK 28 DYNAMIC COMPANY IBAN VERIFICATION ===\n');

    // Test 1: Fetch public quote and verify bankDetails exist in commercialTerms
    console.log('1. Checking dynamic bankDetails in getPublicQuote endpoint...');
    const res1 = await axios.get(`${BASE_URL}/finance/finance/${testQuote.capabilityToken}`);
    assert.strictEqual(res1.status, 200, 'Expected 200 OK');
    const pubFinance = res1.data.finance;
    assert.ok(pubFinance, 'pubFinance should exist');
    assert.ok(pubFinance.commercialTerms, 'commercialTerms should exist');
    assert.ok(pubFinance.commercialTerms.bankDetails, 'commercialTerms.bankDetails should exist');
    assert.ok(pubFinance.commercialTerms.bankDetails.iban, 'IBAN should not be empty');
    assert.ok(pubFinance.commercialTerms.bankDetails.bankName, 'bankName should not be empty');
    assert.ok(pubFinance.commercialTerms.bankDetails.bic, 'BIC should not be empty');
    assert.ok(pubFinance.companyDetails, 'pubFinance.companyDetails should exist');
    console.log(`   PASS: Default IBAN returned: ${pubFinance.commercialTerms.bankDetails.iban} (${pubFinance.commercialTerms.bankDetails.bankName})`);

    // Test 2: Modify company details in DB to a custom IBAN and verify dynamic retrieval
    console.log('2. Updating CompanyDetails in DB with custom IBAN...');
    const customIban = 'NL99 TEST 0123 4567 89';
    const customBic = 'TESTNL2A';
    const customBank = 'Test Triodos Bank';
    await CompanyDetails.findOneAndUpdate(
      {},
      { $set: { iban: customIban, bic: customBic, bankName: customBank } },
      { upsert: true, returnDocument: 'after' }
    );

    const res2 = await axios.get(`${BASE_URL}/finance/finance/${testQuote.capabilityToken}`);
    const updatedFinance = res2.data.finance;
    assert.strictEqual(
      updatedFinance.commercialTerms.bankDetails.iban,
      customIban,
      `Expected commercialTerms.bankDetails.iban to be ${customIban}`
    );
    assert.strictEqual(
      updatedFinance.commercialTerms.bankDetails.bic,
      customBic,
      `Expected commercialTerms.bankDetails.bic to be ${customBic}`
    );
    assert.strictEqual(
      updatedFinance.commercialTerms.bankDetails.bankName,
      customBank,
      `Expected commercialTerms.bankDetails.bankName to be ${customBank}`
    );
    assert.strictEqual(
      updatedFinance.companyDetails.iban,
      customIban,
      `Expected companyDetails.iban to match ${customIban}`
    );
    console.log(`   PASS: Dynamic IBAN propagation confirmed: ${updatedFinance.commercialTerms.bankDetails.iban}`);

    // Test 3: Accept quotation and verify companySnapshot in frozenQuote retains dynamic IBAN
    console.log('3. Verifying quote acceptance endpoint captures dynamic company bank details in frozen snapshot...');
    const acceptRes = await axios.post(`${BASE_URL}/finance/accept/${testQuote.capabilityToken}`, {
      method: 'PUBLIC_LINK',
      name: 'Jan de Vries',
      email: testCustomer.email,
      isAccepted: true
    });

    assert.strictEqual(acceptRes.status, 200, 'Acceptance HTTP status should be 200');
    assert.strictEqual(acceptRes.data.success, true, 'Quote acceptance should succeed');
    assert.strictEqual(acceptRes.data.quote.Status, 'Accepted', 'Quote status should be Accepted');
    const snapshot = acceptRes.data.immutableAgreementSnapshot.companySnapshot;
    assert.ok(snapshot, 'companySnapshot should exist in acceptance');
    assert.strictEqual(snapshot.iban, customIban, `companySnapshot.iban should be ${customIban}`);
    assert.strictEqual(snapshot.bic, customBic, `companySnapshot.bic should be ${customBic}`);
    assert.strictEqual(snapshot.bankName, customBank, `companySnapshot.bankName should be ${customBank}`);
    console.log(`   PASS: Acceptance companySnapshot successfully frozen with dynamic IBAN: ${snapshot.iban}`);

    console.log('\n=== ALL TASK 28 VERIFICATION CHECKS PASSED (3/3) ===\n');
  } catch (error) {
    console.error('Task 28 verification failed:', error);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

runTests();
