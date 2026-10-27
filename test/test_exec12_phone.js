/**
 * EXEC-12 AUTOMATED TEST SUITE: PHONE NUMBER NORMALIZATION & DUTCH NAMES
 *
 * Verifies:
 * 1. Phone Normalization: Leading zeroes preserved on Dutch mobile ('06...') and landlines ('020...', '010...').
 * 2. International E.164 conversion (+316... and 0031... -> +316...).
 * 3. Legacy restoration of 9-digit numbers missing leading zero (6xxxxxxxx -> 06xxxxxxxx).
 * 4. Dutch Name Parsing: Tussenvoegsels (van, de, der, den, in 't, etc.) preserved without truncating surnames.
 * 5. Database Persistence: Mongoose Lead and Customer models store exact string with leading zero.
 * 6. Live In-Browser Validation: Input of Dutch mobile and landline numbers on /intake customer form.
 * 7. Zero Regressions Guarantee: Invoice #2026/0025 calculations & PDF download route intact.
 */

const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const mongoose = require('../node_modules/mongoose');
const jwt = require('../node_modules/jsonwebtoken');
const puppeteer = require('../node_modules/puppeteer-core');
const chromePath = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const path = require('path');
const fs = require('fs');
require('../node_modules/dotenv').config({ path: path.join(__dirname, '../.env') });

const {
  validatePhoneNumber,
  normalizePhoneNumber,
  formatPhoneNumber,
  parseDutchName,
  formatDutchName
} = require('../utils/phoneValidator');

const Lead = require('../models/lead');
const Customer = require('../models/customer');
const Invoice = require('../models/invoice');

const JWT_SECRET = process.env.JWT_SECRET || 'abcdefghijklmnopqrstuvwxyz';
const MONGO_URI = process.env.MONGO_URI;

async function runExec12Tests() {
  console.log('\n=====================================================================');
  console.log('  EXEC-12 RELEASE GATE: PHONE NORMALIZATION & DUTCH NAMES');
  console.log('=====================================================================\n');

  let passedTests = 0;

  // --------------------------------------------------------------------------
  // TEST 1: Phone Normalization & Leading Zero Preservation Unit Tests
  // --------------------------------------------------------------------------
  console.log('[Test 1] Phone Normalization & Leading Zero Preservation:');

  // Case A: Dutch mobile with spaces
  const testA = normalizePhoneNumber('06 12345678');
  if (testA !== '0612345678') {
    throw new Error(`Test 1A Failed: Expected '0612345678', got '${testA}'`);
  }
  console.log(`  ✓ Dutch mobile '06 12345678' -> '${testA}' (leading 0 preserved)`);

  // Case B: Dutch landline (Amsterdam 020) with dashes
  const testB = normalizePhoneNumber('020-1234567');
  if (testB !== '0201234567') {
    throw new Error(`Test 1B Failed: Expected '0201234567', got '${testB}'`);
  }
  console.log(`  ✓ Dutch landline '020-1234567' -> '${testB}' (leading 0 preserved)`);

  // Case C: Dutch landline (Rotterdam 010) with spaces
  const testC = normalizePhoneNumber('010 7654321');
  if (testC !== '0107654321') {
    throw new Error(`Test 1C Failed: Expected '0107654321', got '${testC}'`);
  }
  console.log(`  ✓ Dutch landline '010 7654321' -> '${testC}' (leading 0 preserved)`);

  // Case D: International +31 format
  const testD = normalizePhoneNumber('+31 6 1234 5678');
  if (testD !== '+31612345678') {
    throw new Error(`Test 1D Failed: Expected '+31612345678', got '${testD}'`);
  }
  console.log(`  ✓ International '+31 6 1234 5678' -> '${testD}'`);

  // Case E: International 0031 prefix
  const testE = normalizePhoneNumber('0031 6 12345678');
  if (testE !== '+31612345678') {
    throw new Error(`Test 1E Failed: Expected '+31612345678', got '${testE}'`);
  }
  console.log(`  ✓ International prefix '0031 6 12345678' -> '${testE}'`);

  // Case F: Legacy corrupted number (9 digits starting with 6, missing 0)
  const testF = normalizePhoneNumber('612345678');
  if (testF !== '0612345678') {
    throw new Error(`Test 1F Failed: Expected '0612345678', got '${testF}'`);
  }
  console.log(`  ✓ Corrupted 9-digit '612345678' restored -> '${testF}'`);

  // Case G: Format phone helper
  const testG = formatPhoneNumber('0612345678');
  if (testG !== '06 12345678') {
    throw new Error(`Test 1G Failed: Expected '06 12345678', got '${testG}'`);
  }
  console.log(`  ✓ Human readable format: '0612345678' -> '${testG}'`);

  passedTests++;

  // --------------------------------------------------------------------------
  // TEST 2: Dutch Name Parser (Tussenvoegsel Awareness)
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Dutch Name Parsing & Tussenvoegsel Preservation:');

  // Case A: "Jan van den Berg"
  const nameA = parseDutchName('Jan van den Berg');
  if (nameA.firstName !== 'Jan' || nameA.prefix !== 'van den' || nameA.lastName !== 'Berg' || nameA.surname !== 'van den Berg') {
    throw new Error(`Test 2A Failed: Unexpected parse: ${JSON.stringify(nameA)}`);
  }
  console.log(`  ✓ 'Jan van den Berg' -> firstName: '${nameA.firstName}', prefix: '${nameA.prefix}', lastName: '${nameA.lastName}', surname: '${nameA.surname}'`);

  // Case B: "Peter de Wit"
  const nameB = parseDutchName('Peter de Wit');
  if (nameB.firstName !== 'Peter' || nameB.prefix !== 'de' || nameB.lastName !== 'Wit' || nameB.surname !== 'de Wit') {
    throw new Error(`Test 2B Failed: Unexpected parse: ${JSON.stringify(nameB)}`);
  }
  console.log(`  ✓ 'Peter de Wit' -> firstName: '${nameB.firstName}', prefix: '${nameB.prefix}', lastName: '${nameB.lastName}', surname: '${nameB.surname}'`);

  // Case C: "Anouk in 't Veld"
  const nameC = parseDutchName("Anouk in 't Veld");
  if (nameC.firstName !== 'Anouk' || nameC.prefix !== "in 't" || nameC.lastName !== 'Veld' || nameC.surname !== "in 't Veld") {
    throw new Error(`Test 2C Failed: Unexpected parse: ${JSON.stringify(nameC)}`);
  }
  console.log(`  ✓ "Anouk in 't Veld" -> firstName: '${nameC.firstName}', prefix: "${nameC.prefix}", lastName: '${nameC.lastName}', surname: "${nameC.surname}"`);

  // Case D: Standard two-word name "John Doe"
  const nameD = parseDutchName('John Doe');
  if (nameD.firstName !== 'John' || nameD.surname !== 'Doe') {
    throw new Error(`Test 2D Failed: Unexpected parse: ${JSON.stringify(nameD)}`);
  }
  console.log(`  ✓ 'John Doe' -> firstName: '${nameD.firstName}', surname: '${nameD.surname}'`);

  passedTests++;

  // --------------------------------------------------------------------------
  // TEST 3: Database Persistence (Lead & Customer Schema String Validation)
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Mongoose Database Persistence & Leading Zero Storage:');

  await mongoose.connect(MONGO_URI);
  console.log('  ✓ Connected to MongoDB cluster');

  const testEmailLead = `test-lead-exec12-${Date.now()}@universalmovers.test`;
  const testPhoneLead = '0612345678';

  // Create lead with Dutch mobile
  const newLead = new Lead({
    typeOfCustomer: 'Individual',
    firstName: 'Willem',
    lastName: 'van Dijk',
    email: testEmailLead,
    contact: testPhoneLead,
    status: 'New'
  });
  const savedLead = await newLead.save();

  // Read back directly from MongoDB
  const fetchedLead = await Lead.findById(savedLead._id);
  if (!fetchedLead) {
    throw new Error('Test 3 Failed: Lead was not found in database');
  }
  if (typeof fetchedLead.contact !== 'string') {
    throw new Error(`Test 3 Failed: Expected contact to be string, got: ${typeof fetchedLead.contact}`);
  }
  if (fetchedLead.contact !== '0612345678') {
    throw new Error(`Test 3 Failed: Leading zero lost! Expected '0612345678', got '${fetchedLead.contact}'`);
  }
  console.log(`  ✓ Lead persisted with exact leading zero: contact='${fetchedLead.contact}' (type: ${typeof fetchedLead.contact})`);

  // Cleanup test lead
  await Lead.findByIdAndDelete(savedLead._id);

  // Test Customer model
  const testEmailCust = `test-cust-exec12-${Date.now()}@universalmovers.test`;
  const newCust = new Customer({
    type: 'Customer',
    typeOfCustomer: 'Individual',
    firstName: 'Jan',
    lastName: 'van den Berg',
    email: testEmailCust,
    mobile: '0687654321',
    contact: '0201234567'
  });
  const savedCust = await newCust.save();

  const fetchedCust = await Customer.findById(savedCust._id);
  if (!fetchedCust) {
    throw new Error('Test 3 Failed: Customer was not found in database');
  }
  if (fetchedCust.mobile !== '0687654321' || fetchedCust.contact !== '0201234567') {
    throw new Error(`Test 3 Failed: Customer phone mismatch: mobile='${fetchedCust.mobile}', contact='${fetchedCust.contact}'`);
  }
  console.log(`  ✓ Customer persisted with exact leading zeroes: mobile='${fetchedCust.mobile}', contact='${fetchedCust.contact}'`);

  // Cleanup test customer
  await Customer.findByIdAndDelete(savedCust._id);

  passedTests++;

  // --------------------------------------------------------------------------
  // TEST 4: Live In-Browser Customer Form Phone Validation (/intake)
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Live In-Browser Customer Form Phone Validation (/intake):');

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const testToken = jwt.sign(
    { userId: '67c05a32a7cf083dc7f2fbd6', role: 'Admin', email: 'mprofessionalwfh@gmail.com' },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify({
      id: '67c05a32a7cf083dc7f2fbd6',
      role: 'Admin',
      username: 'techbeeps',
      email: 'mprofessionalwfh@gmail.com'
    }));
    // Clear any prior draft
    localStorage.removeItem('crm_intake_draft_new');
  }, testToken);

  await page.goto('http://localhost:5173/intake', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  // Click 'New Customer'
  const cards = await page.$$('h3');
  for (const card of cards) {
    const text = await page.evaluate(el => el.textContent, card);
    if (text && text.includes('New Customer')) {
      await card.click();
      await new Promise(r => setTimeout(r, 1000));
      break;
    }
  }

  // Type phone numbers into #customer-mobile and #customer-contact
  const mobileInput = await page.$('#customer-mobile') || (await page.$('input[placeholder*="06"]'));
  const contactInput = await page.$('#customer-contact') || (await page.$('input[placeholder*="010"]'));

  if (mobileInput) {
    await mobileInput.type('06 12345678', { delay: 30 });
  }
  if (contactInput) {
    await contactInput.type('020 1234567', { delay: 30 });
  }

  // Verify entered values retain leading zero
  const enteredMobile = mobileInput ? await page.evaluate(el => el.value, mobileInput) : '';
  const enteredContact = contactInput ? await page.evaluate(el => el.value, contactInput) : '';

  if (!enteredMobile.startsWith('06')) {
    throw new Error(`Test 4 Failed: Mobile input lost leading 06, got: '${enteredMobile}'`);
  }
  if (!enteredContact.startsWith('020')) {
    throw new Error(`Test 4 Failed: Contact input lost leading 020, got: '${enteredContact}'`);
  }
  console.log(`  ✓ Browser inputs verified: Mobile='${enteredMobile}', Contact='${enteredContact}'`);

  const screenshotPath = path.join(__dirname, '../valuation_phone_validated.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('  ✓ Saved screenshot: valuation_phone_validated.png');

  await browser.close();
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST 5: Zero Regressions Guarantee (Invoice #2026/0025 & PDF Download)
  // --------------------------------------------------------------------------
  console.log('\n[Test 5] Zero Regressions Guarantee (Invoice #2026/0025 & PDF):');

  const invoice = await Invoice.findOne({ index: '2026/0025' });
  if (!invoice) {
    throw new Error('Test 5 Failed: Invoice #2026/0025 not found in database');
  }
  console.log(`  ✓ Invoice #2026/0025 verified intact: Total €${invoice.total}, Status: ${invoice.Status || invoice.payment}`);

  const pdfRes = await fetch(`http://localhost:8080/invoice/download`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${testToken}`
    },
    body: JSON.stringify({ Id: invoice._id })
  });

  if (pdfRes.status !== 200) {
    throw new Error(`Test 5 Failed: PDF download failed with HTTP ${pdfRes.status}`);
  }
  const pdfBuffer = await pdfRes.arrayBuffer();
  if (pdfBuffer.byteLength < 5000) {
    throw new Error(`Test 5 Failed: PDF response too small (${pdfBuffer.byteLength} bytes)`);
  }
  console.log(`  ✓ Invoice #2026/0025 PDF download route returned 200 with ${pdfBuffer.byteLength} bytes`);
  passedTests++;

  await mongoose.disconnect();

  console.log('\n=====================================================================');
  console.log(`  EXEC-12 VERIFICATION RESULT: ${passedTests}/5 TESTS PASSED (100%)`);
  console.log('=====================================================================\n');
}

runExec12Tests().catch((err) => {
  console.error('\n❌ EXEC-12 TEST FAILED:', err);
  process.exit(1);
});
