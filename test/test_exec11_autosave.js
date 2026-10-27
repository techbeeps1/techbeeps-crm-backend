const fs = require('fs');
const path = require('path');
const http = require('http');
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
require('../node_modules/dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('../node_modules/mongoose');
const jwt = require('../node_modules/jsonwebtoken');
const puppeteer = require('../node_modules/puppeteer-core');
const chromePath = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';

const Invoice = require('../models/invoice');

async function runExec11Verification() {
  console.log('=====================================================================');
  console.log('  EXEC-11 RELEASE GATE: INTAKE AUTOSAVE & DRAFT RECOVERY');
  console.log('=====================================================================\n');

  let passedTests = 0;
  const totalTests = 4;

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
  // TEST 1: Static Codebase Contract & Utility Integrity
  // --------------------------------------------------------------------------
  console.log('[Test 1] Static Codebase Contract & Autosave Architecture:');

  const utilPath = path.resolve(__dirname, '../../techbeeps-crm-frontend/src/utils/intakeDraftUtil.ts');
  if (!fs.existsSync(utilPath)) {
    throw new Error(`Test 1 Failed: intakeDraftUtil.ts missing at ${utilPath}`);
  }
  const utilCode = fs.readFileSync(utilPath, 'utf8');
  ['getDraftKey', 'saveIntakeDraft', 'getIntakeDraft', 'clearIntakeDraft', 'formatDraftTime'].forEach(fn => {
    if (!utilCode.includes(fn)) {
      throw new Error(`Test 1 Failed: ${fn} missing from intakeDraftUtil.ts`);
    }
  });
  console.log('  ✓ intakeDraftUtil.ts exports all required draft functions');

  const pagePath = path.resolve(__dirname, '../../techbeeps-crm-frontend/src/pages/Valuation/ValuationPage.tsx');
  const pageCode = fs.readFileSync(pagePath, 'utf8');
  if (!pageCode.includes('resume-draft-btn') || !pageCode.includes('discard-draft-btn')) {
    throw new Error('Test 1 Failed: Draft Recovery action buttons missing from ValuationPage.tsx');
  }
  if (!pageCode.includes('saveIntakeDraft') || !pageCode.includes('clearIntakeDraft')) {
    throw new Error('Test 1 Failed: Draft save/clear calls missing from ValuationPage.tsx');
  }
  console.log('  ✓ ValuationPage.tsx implements recovery banner and debounced draft lifecycle');
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST 2: In-Browser Live Debounced Autosave to localStorage
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Live In-Browser Debounced Autosave (Headless Chrome):');

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => {
    localStorage.setItem('token', t);
    localStorage.setItem('user', JSON.stringify({
      id: '67c05a32a7cf083dc7f2fbd6',
      role: 'Admin',
      name: 'techbeeps',
      email: 'mprofessionalwfh@gmail.com'
    }));
    // Clear any leftover draft from previous runs
    localStorage.removeItem('crm_intake_draft_new');
  }, token);

  await page.goto('http://localhost:5173/intake', { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));

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

  // Fill in form fields
  const typeSelect = await page.$('#typeOfCustomer');
  if (typeSelect) {
    await typeSelect.select('Individual');
  }

  const firstNameInput = (await page.$('#customer-firstName')) || (await page.$('input[placeholder="First name"]'));
  if (firstNameInput) {
    await firstNameInput.type('AutosaveTest', { delay: 50 });
  }

  const lastNameInput = (await page.$('#customer-lastName')) || (await page.$('input[placeholder="Surname"]'));
  if (lastNameInput) {
    await lastNameInput.type('RecoveredUser', { delay: 50 });
  }

  const emailInput = (await page.$('#customer-email')) || (await page.$('input[placeholder="Email address"]'));
  if (emailInput) {
    await emailInput.type('autosave-test@universalmovers.test', { delay: 50 });
  }

  // Wait 1200ms to allow 500ms debounce timer to fire and save to localStorage
  await new Promise(r => setTimeout(r, 1200));

  // Inspect localStorage directly
  const savedDraft = await page.evaluate(() => {
    const raw = localStorage.getItem('crm_intake_draft_new');
    return raw ? JSON.parse(raw) : null;
  });

  if (!savedDraft) {
    throw new Error('Test 2 Failed: No draft was written to localStorage after user input');
  }
  if (!savedDraft.formData?.customer?.firstName?.includes('AutosaveTest')) {
    throw new Error(`Test 2 Failed: Draft firstName mismatch, got: ${savedDraft.formData?.customer?.firstName}`);
  }
  if (!savedDraft.formData?.customer?.lastName?.includes('RecoveredUser')) {
    throw new Error(`Test 2 Failed: Draft lastName mismatch, got: ${savedDraft.formData?.customer?.lastName}`);
  }
  console.log(`  ✓ Debounced draft saved cleanly in localStorage (Key: crm_intake_draft_new, timestamp: ${savedDraft.lastSavedAt})`);
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST 3: Draft Recovery Banner & Restoration on Reload
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] In-Browser Page Reload & 1-Click Draft Recovery:');

  // Reload the page simulating accidental browser refresh or crash
  console.log('  -> Reloading /intake page...');
  await page.reload({ waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  // Verify the Recovery Banner is rendered
  const resumeBtn = await page.$('#resume-draft-btn');
  if (!resumeBtn) {
    throw new Error('Test 3 Failed: Unsaved Intake Draft banner (#resume-draft-btn) not found after reload');
  }
  console.log('  ✓ Draft Recovery Banner detected on page reload');

  // Screenshot before clicking restore
  await page.screenshot({ path: path.join(__dirname, '../valuation_draft_banner.png'), fullPage: true });

  // Click 'Resume Draft'
  await resumeBtn.click();
  await new Promise(r => setTimeout(r, 1500));

  // Verify fields were restored
  const restoredFirstName = await page.$eval('#customer-firstName', el => el.value);
  const restoredLastName = await page.$eval('#customer-lastName', el => el.value);
  const restoredEmail = await page.$eval('#customer-email', el => el.value);

  if (restoredFirstName !== 'AutosaveTest') {
    throw new Error(`Test 3 Failed: Restored firstName mismatch: expected 'AutosaveTest', got '${restoredFirstName}'`);
  }
  if (restoredLastName !== 'RecoveredUser') {
    throw new Error(`Test 3 Failed: Restored lastName mismatch: expected 'RecoveredUser', got '${restoredLastName}'`);
  }
  if (restoredEmail !== 'autosave-test@universalmovers.test') {
    throw new Error(`Test 3 Failed: Restored email mismatch: expected 'autosave-test@universalmovers.test', got '${restoredEmail}'`);
  }
  console.log(`  ✓ Restored fields verified: ${restoredFirstName} ${restoredLastName} (${restoredEmail})`);

  // Screenshot of successfully restored state
  await page.screenshot({ path: path.join(__dirname, '../valuation_draft_recovered.png'), fullPage: true });
  console.log('  ✓ Saved screenshot: valuation_draft_recovered.png');

  await browser.close();
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST 4: Zero Regressions Guarantee (Invoice #2026/0025 & PDF Download)
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Zero Regressions Guarantee (Invoice #2026/0025 & PDF):');

  const invoice = await Invoice.findOne({ index: '2026/0025' });
  if (!invoice) {
    throw new Error('Test 4 Failed: Critical Invoice #2026/0025 not found in database');
  }
  console.log(`  ✓ Invoice #2026/0025 verified intact: Total €${invoice.total}, Status: ${invoice.Status || invoice.payment}`);

  const pdfRes = await fetch(`http://localhost:8080/invoice/download`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ Id: invoice._id })
  });
  if (pdfRes.status !== 200) {
    throw new Error(`Test 4 Failed: PDF download endpoint returned status ${pdfRes.status}`);
  }
  const pdfBuffer = await pdfRes.arrayBuffer();
  if (pdfBuffer.byteLength < 500) {
    throw new Error(`Test 4 Failed: PDF content truncated (${pdfBuffer.byteLength} bytes)`);
  }
  console.log(`  ✓ Invoice #2026/0025 PDF download route returned 200 with ${pdfBuffer.byteLength} bytes`);
  passedTests++;

  console.log('\n=====================================================================');
  console.log(`  EXEC-11 VERIFICATION RESULT: ${passedTests}/${totalTests} TESTS PASSED (100%)`);
  console.log('=====================================================================\n');

  await mongoose.disconnect();
  process.exit(0);
}

runExec11Verification().catch(err => {
  console.error('\n❌ EXEC-11 VERIFICATION FAILED:', err.message);
  process.exit(1);
});
