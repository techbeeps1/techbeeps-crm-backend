const fs = require('fs');
const path = require('path');
const http = require('http');
const jwt = require('../node_modules/jsonwebtoken');
require('../node_modules/dotenv').config({ path: path.join(__dirname, '../.env') });
const puppeteer = require('../node_modules/puppeteer-core');
const chromePath = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';

const { validateDiscount, validateFloor } = require('../utils/validationUtil');

async function runExec09Verification() {
  console.log('===============================================================');
  console.log('  EXEC-09 RELEASE & VERIFICATION GATE: UNIFIED VALIDATION & 404');
  console.log('===============================================================\n');

  let passedTests = 0;
  const totalTests = 4;

  const token = jwt.sign(
    { id: '67c05a32a7cf083dc7f2fbd6', role: 'Admin', username: 'techbeeps' },
    process.env.JWT_SECRET || 'abcdefghijklmnopqrstuvwxyz'
  );

  // --------------------------------------------------------------------------
  // TEST 1: Validation Rules (Discount bounds 0-100% & Dutch Basement Floors)
  // --------------------------------------------------------------------------
  console.log('[Test 1] Domain Validation Rules (Discount & Floor Semantics):');

  // A. Discount bounds
  const validDiscounts = [0, 10, 50, 100, '25', '0', '100'];
  for (const d of validDiscounts) {
    const res = validateDiscount(d);
    if (!res.isValid) {
      throw new Error(`Test 1 Failed: Valid discount ${d} was rejected: ${res.error}`);
    }
  }

  const invalidDiscounts = [-1, -20, 101, 150, 'abc', NaN];
  for (const d of invalidDiscounts) {
    const res = validateDiscount(d);
    if (res.isValid) {
      throw new Error(`Test 1 Failed: Invalid discount ${d} was erroneously accepted`);
    }
  }

  // B. Floor Semantics (Basements are negative, ground is 0, upper are positive)
  const validFloors = [0, 1, 4, -1, -2, '-1', '0', '3']; // -1 is a legitimate basement floor!
  for (const f of validFloors) {
    const res = validateFloor(f);
    if (!res.isValid) {
      throw new Error(`Test 1 Failed: Valid floor ${f} (including basement) was rejected: ${res.error}`);
    }
  }

  const invalidFloors = ['ground', 'xyz', 1.5, -0.5];
  for (const f of invalidFloors) {
    const res = validateFloor(f);
    if (res.isValid) {
      throw new Error(`Test 1 Failed: Invalid floor ${f} was erroneously accepted`);
    }
  }

  console.log('  -> PASSED: Discounts strictly bounded (0-100%); Dutch negative basement floors (-1, -2) correctly validated.');
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST 2: Backend API 404 & Error Shielding
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Backend API 404 & Error Containment:');

  // Authenticated unknown route -> 404 JSON with Correlation ID
  const res404 = await fetch('http://127.0.0.1:8080/api/non-existent-test-route-404', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data404 = await res404.json();

  if (res404.status !== 404) {
    throw new Error(`Test 2 Failed: Expected HTTP 404 on unknown route, got ${res404.status}`);
  }
  if (data404.error !== 'NOT_FOUND' || !data404.correlationId) {
    throw new Error(`Test 2 Failed: 404 response missing structured error or correlationId: ${JSON.stringify(data404)}`);
  }

  // Anonymous request to protected unknown route -> 401 Unauthorized
  const resAnon = await fetch('http://127.0.0.1:8080/api/non-existent-test-route-404');
  if (resAnon.status !== 401) {
    throw new Error(`Test 2 Failed: Anonymous request expected HTTP 401, got ${resAnon.status}`);
  }

  console.log('  -> PASSED: Unknown API routes yield structured HTTP 404 with correlation ID; Anonymous requests blocked with HTTP 401.');
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST 3: In-Browser 404 Not Found Page (No silent redirect)
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Frontend In-Browser 404 Not Found Page (Headless Chrome):');
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  // Prime local storage
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => {
    localStorage.setItem('token', t);
    localStorage.setItem('user', JSON.stringify({ role: 'Admin', name: 'Admin' }));
  }, token);

  // Navigate to an unknown URL
  const unknownPath = '/random-unknown-page-test-404';
  await page.goto(`http://localhost:5173${unknownPath}`, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 4000));

  const currentUrl = page.url();
  const pageEvaluation = await page.evaluate(() => {
    const text = document.body.innerText;
    const has404 = text.includes('404') || text.includes('Page Not Found');
    const hasDashboardBtn = Array.from(document.querySelectorAll('button')).some(
      (b) => b.innerText.includes('Back to Dashboard')
    );
    const hasGoBackBtn = Array.from(document.querySelectorAll('button')).some(
      (b) => b.innerText.includes('Go Back')
    );
    return { has404, hasDashboardBtn, hasGoBackBtn, textSnippet: text.substring(0, 300) };
  });

  // Verify that URL DID NOT silently redirect to '/'
  if (currentUrl.endsWith(':5173/') || currentUrl.endsWith(':5173')) {
    throw new Error('Test 3 Failed: Wildcard route silently redirected to Dashboard instead of rendering 404 page!');
  }

  if (!pageEvaluation.has404 || !pageEvaluation.hasDashboardBtn) {
    throw new Error(`Test 3 Failed: 404 page elements not found: ${JSON.stringify(pageEvaluation)}`);
  }

  // Save visual verification screenshot
  const screenshotPath = path.resolve(__dirname, '../../not_found_verification.png');
  await page.screenshot({ path: screenshotPath });
  console.log(`  -> Screenshot saved to ${screenshotPath}`);

  await browser.close();
  console.log('  -> PASSED: Unknown route cleanly renders 404 Not Found page with action buttons; silent dashboard redirect eliminated.');
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST 4: Zero-Regression Gate (Invoice & PDF Download)
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Zero-Regression Gate (Invoice #2026/0025 & PDF Download):');
  const resInvoice = await fetch('http://127.0.0.1:8080/invoice/invoice/6ad202dcb67074d4c4540f79', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const invData = await resInvoice.json();
  const test4aPass = resInvoice.status === 200 && invData.invoice && invData.invoice.index === '2026/0025';

  const resPdf = await fetch('http://127.0.0.1:8080/invoice/download', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ Id: '6ad202dcb67074d4c4540f79' }),
  });
  const pdfBuffer = await resPdf.arrayBuffer();
  const test4bPass = resPdf.status === 200 && pdfBuffer.byteLength > 1000;

  if (!test4aPass || !test4bPass) {
    throw new Error(`Test 4 Failed: Invoice (${resInvoice.status}) or PDF (${resPdf.status}, ${pdfBuffer.byteLength} bytes) failed`);
  }

  console.log(`  -> PASSED: Invoice HTTP 200 OK (#2026/0025), PDF generated successfully (${pdfBuffer.byteLength} bytes).`);
  passedTests++;

  // --------------------------------------------------------------------------
  // FINAL SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n===============================================================');
  console.log(`  EXEC-09 VERIFICATION COMPLETE: ${passedTests}/${totalTests} TESTS PASSED!`);
  console.log('  Status: 🟢 VERIFIED & READY FOR CLIENT SIGN-OFF');
  console.log('===============================================================');
  process.exit(0);
}

runExec09Verification().catch((err) => {
  console.error('\nEXEC-09 VERIFICATION FAILED:', err.message);
  process.exit(1);
});
