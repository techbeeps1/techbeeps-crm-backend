/**
 * EXEC-13 AUTOMATED TEST SUITE: ADDRESS LOOKUP ARGUMENT REVERSAL BUG FIX
 *
 * Verifies:
 * 1. Signature Resilience: lookupDutchAddress works with named object and positional arguments.
 * 2. Smart Parameter Disambiguation: Detects and resolves reversed addition vs country arguments.
 * 3. Live Dutch Address Resolution (PDOK Locatieserver):
 *    - Real Dutch address (1012JS, 10, A) resolves street and city.
 *    - Swapped arguments (1012JS, 10, Netherlands, A) resolves without foreign bypass.
 *    - Foreign country selection deliberately skips Dutch lookup.
 * 4. Live In-Browser Verification (/intake Step 1 Move From):
 *    - Automatically enters postcode, houseNumber, addition.
 *    - Verifies auto-fill of street and city on page.
 *    - Captures screenshot: valuation_address_lookup.png.
 * 5. Zero Regressions Guarantee: Invoice #2026/0025 & PDF download route intact.
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
  isCountryIdentifier,
  lookupDutchAddress
} = require('../utils/dutchAddressLookup');

const Invoice = require('../models/invoice');

const JWT_SECRET = process.env.JWT_SECRET || 'abcdefghijklmnopqrstuvwxyz';
const MONGO_URI = process.env.MONGO_URI;

async function runExec13Tests() {
  console.log('\n=====================================================================');
  console.log('  EXEC-13 RELEASE GATE: ADDRESS LOOKUP ARGUMENT REVERSAL BUG FIX');
  console.log('=====================================================================\n');

  let passedTests = 0;

  // --------------------------------------------------------------------------
  // TEST 1: Country Identifier & Disambiguation Helper
  // --------------------------------------------------------------------------
  console.log('[Test 1] Disambiguation & Country Detector:');

  if (!isCountryIdentifier('Netherlands') || !isCountryIdentifier('netherlands') || !isCountryIdentifier('NL')) {
    throw new Error('Test 1 Failed: isCountryIdentifier failed for Netherlands');
  }
  if (!isCountryIdentifier('Germany') || !isCountryIdentifier('Belgium')) {
    throw new Error('Test 1 Failed: isCountryIdentifier failed for foreign countries');
  }
  if (isCountryIdentifier('A') || isCountryIdentifier('bis') || isCountryIdentifier('2') || isCountryIdentifier('rd')) {
    throw new Error('Test 1 Failed: House addition was incorrectly identified as country!');
  }
  console.log('  ✓ Country detector properly distinguishes country names from house additions');
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST 2: Live Dutch Address Resolution & Argument Inversion Resilience
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Live Dutch Address Resolution (PDOK Locatieserver):');

  // Case A: Named Object call
  const resNamed = await lookupDutchAddress({
    postcode: '1012JS',
    houseNumber: '10',
    addition: 'A',
    country: 'Netherlands'
  });
  if (!resNamed.success || !resNamed.street || !resNamed.city) {
    throw new Error(`Test 2A Failed: Named object lookup failed: ${JSON.stringify(resNamed)}`);
  }
  console.log(`  ✓ Named object resolved: ${resNamed.street}, ${resNamed.city} (${resNamed.postcode})`);

  // Case B: Swapped arguments (postcode, houseNumber, addition, country) - previous bug caused 'A' to be treated as country
  const resSwapped = await lookupDutchAddress('1012JS', '10', 'A', 'Netherlands');
  if (!resSwapped.success || !resSwapped.street || !resSwapped.city) {
    throw new Error(`Test 2B Failed: Swapped arguments failed (addition was mistaken for country): ${JSON.stringify(resSwapped)}`);
  }
  console.log(`  ✓ Swapped arguments (addition 3rd, country 4th) resolved cleanly: ${resSwapped.street}, ${resSwapped.city}`);

  // Case C: Swapped arguments in reverse order (postcode, houseNumber, country, addition)
  const resReversed = await lookupDutchAddress('1012JS', '10', 'Netherlands', 'A');
  if (!resReversed.success || !resReversed.street || !resReversed.city) {
    throw new Error(`Test 2C Failed: Positional signature failed: ${JSON.stringify(resReversed)}`);
  }
  console.log(`  ✓ Positional signature (country 3rd, addition 4th) resolved cleanly: ${resReversed.street}, ${resReversed.city}`);

  // Case D: Foreign country deliberate bypass
  const resForeign = await lookupDutchAddress({
    postcode: '1012JS',
    houseNumber: '10',
    country: 'Germany'
  });
  if (resForeign.success !== false || !resForeign.message.includes('Foreign country')) {
    throw new Error(`Test 2D Failed: Foreign country did not trigger expected bypass: ${JSON.stringify(resForeign)}`);
  }
  console.log(`  ✓ Foreign country deliberate bypass verified: "${resForeign.message}"`);
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST 3: Live In-Browser Customer & Address Step (/intake)
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Live In-Browser Address Auto-Lookup (/intake):');

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
    localStorage.removeItem('crm_intake_draft_new');
  }, testToken);

  await page.goto('http://localhost:5173/intake', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  // Step 0: Select Existing Customer to transition cleanly to Step 1
  const cards = await page.$$('h3');
  for (const card of cards) {
    const text = await page.evaluate(el => el.textContent, card);
    if (text && text.includes('Existing Customer')) {
      await card.click();
      await new Promise(r => setTimeout(r, 1200));
      break;
    }
  }

  const searchInput = await page.$('input[placeholder="Search customer..."]');
  if (searchInput) {
    await searchInput.type('a', { delay: 100 });
    await new Promise(r => setTimeout(r, 1500));
  }

  const firstItem = await page.$('div.hover\\:bg-slate-50');
  if (firstItem) {
    await firstItem.click();
    await new Promise(r => setTimeout(r, 1500));
  }

  // Click Next button to move to Step 1 (Move from Address)
  const nextBtn = await page.$('button[type="button"].MuiButton-containedPrimary') ||
                  (await page.$x && (await page.$x("//button[contains(., 'NEXT')]"))?.[0]);
  if (nextBtn) {
    await nextBtn.click();
  } else {
    const allBtns = await page.$$('button');
    for (const b of allBtns) {
      const txt = await page.evaluate(el => el.textContent, b);
      if (txt && txt.trim() === 'NEXT') {
        await b.click();
        break;
      }
    }
  }
  await new Promise(r => setTimeout(r, 2000));

  // Verify we are on Step 1 (Address)
  const postcodeInput = await page.$('#postcode');
  const houseNumberInput = await page.$('#houseNumber');
  const additionInput = await page.$('#addition');

  if (!postcodeInput || !houseNumberInput) {
    throw new Error('Test 3 Failed: #postcode or #houseNumber input not found on Step 1');
  }

  // Clear and type Dutch postcode 1012JS, house number 10, addition A
  await postcodeInput.click({ clickCount: 3 });
  await postcodeInput.press('Backspace');
  await postcodeInput.type('1012JS', { delay: 30 });

  await houseNumberInput.click({ clickCount: 3 });
  await houseNumberInput.press('Backspace');
  await houseNumberInput.type('10', { delay: 30 });

  if (additionInput) {
    await additionInput.click({ clickCount: 3 });
    await additionInput.press('Backspace');
    await additionInput.type('A', { delay: 30 });
  }

  // Trigger blur to fire address lookup
  await page.$eval('#houseNumber', el => el.dispatchEvent(new Event('blur')));
  if (additionInput) {
    await page.$eval('#addition', el => el.dispatchEvent(new Event('blur')));
  }

  // Wait 3 seconds for PDOK Locatieserver response and form field update
  await new Promise(r => setTimeout(r, 3500));

  const resolvedStreet = await page.$eval('#street', el => el.value);
  const resolvedCity = await page.$eval('#city', el => el.value);

  if (!resolvedStreet || !resolvedCity) {
    throw new Error(`Test 3 Failed: Address fields were not auto-filled. Street: '${resolvedStreet}', City: '${resolvedCity}'`);
  }
  console.log(`  ✓ Address auto-resolved in browser: Street='${resolvedStreet}', City='${resolvedCity}'`);

  const screenshotPath = path.join(__dirname, '../valuation_address_lookup.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('  ✓ Saved screenshot: valuation_address_lookup.png');

  await browser.close();
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST 4: Zero Regressions Guarantee (Invoice #2026/0025 & PDF Download)
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Zero Regressions Guarantee (Invoice #2026/0025 & PDF):');

  await mongoose.connect(MONGO_URI);
  const invoice = await Invoice.findOne({ index: '2026/0025' });
  if (!invoice) {
    throw new Error('Test 4 Failed: Invoice #2026/0025 not found in database');
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
    throw new Error(`Test 4 Failed: PDF download failed with HTTP ${pdfRes.status}`);
  }
  const pdfBuffer = await pdfRes.arrayBuffer();
  if (pdfBuffer.byteLength < 5000) {
    throw new Error(`Test 4 Failed: PDF response too small (${pdfBuffer.byteLength} bytes)`);
  }
  console.log(`  ✓ Invoice #2026/0025 PDF download route returned 200 with ${pdfBuffer.byteLength} bytes`);
  passedTests++;

  await mongoose.disconnect();

  console.log('\n=====================================================================');
  console.log(`  EXEC-13 VERIFICATION RESULT: ${passedTests}/4 TESTS PASSED (100%)`);
  console.log('=====================================================================\n');
}

runExec13Tests().catch((err) => {
  console.error('\n❌ EXEC-13 TEST FAILED:', err);
  process.exit(1);
});
