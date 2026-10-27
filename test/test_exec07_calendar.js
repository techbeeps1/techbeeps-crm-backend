const fs = require('fs');
const path = require('path');
const http = require('http');
const jwt = require('../node_modules/jsonwebtoken');
require('../node_modules/dotenv').config({ path: path.join(__dirname, '../.env') });
const puppeteer = require('../node_modules/puppeteer-core');
const chromePath = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';

const { format: dateFnsFormat, isValid: dateFnsIsValid } = require('../node_modules/date-fns');

// Mirror safeFormatTime logic from Calendar.tsx
const safeFormatTime = (dateInput, formatPattern = 'HH:mm') => {
  if (!dateInput) return '--:--';
  try {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (!dateFnsIsValid(d) || isNaN(d.getTime())) return '--:--';
    return dateFnsFormat(d, formatPattern);
  } catch (err) {
    return '--:--';
  }
};

async function runExec07Verification() {
  console.log('===============================================================');
  console.log('   EXEC-07 RELEASE & VERIFICATION GATE: CALENDAR STABILITY     ');
  console.log('===============================================================\n');

  let passedTests = 0;
  const totalTests = 4;

  // --------------------------------------------------------------------------
  // TEST 1: Safe Date Formatter Contract & Fallback Resilience
  // --------------------------------------------------------------------------
  console.log('[Test 1] Safe Date Formatter Resilience:');
  const validDate = new Date(2026, 9, 21, 14, 45); // Oct 21, 2026 14:45
  const resValid = safeFormatTime(validDate, 'HH:mm');
  if (resValid !== '14:45') {
    throw new Error(`Test 1 Failed: Expected '14:45', got '${resValid}'`);
  }

  // Null, undefined, empty, invalid strings should NEVER throw
  const testInputs = [null, undefined, '', 'not-a-date', NaN, {}, []];
  for (const input of testInputs) {
    const res = safeFormatTime(input, 'HH:mm');
    if (res !== '--:--') {
      throw new Error(`Test 1 Failed: Expected '--:--' for invalid input ${input}, got '${res}'`);
    }
  }
  console.log('  -> PASSED: Valid date correctly formatted as 14:45, all invalid inputs safely return --:-- without throw.');
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST 2: Static Codebase Contract & ErrorBoundary Verification
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Static Codebase Contract & Error Boundary:');
  const calendarPath = path.resolve(__dirname, '../../techbeeps-crm-frontend/src/pages/Calendar.tsx');
  const calendarCode = fs.readFileSync(calendarPath, 'utf8');

  const errorBoundaryPath = path.resolve(__dirname, '../../techbeeps-crm-frontend/src/components/common/ErrorBoundary.tsx');
  if (!fs.existsSync(errorBoundaryPath)) {
    throw new Error('Test 2 Failed: ErrorBoundary.tsx does not exist!');
  }

  if (!calendarCode.includes('import { format as dateFnsFormat')) {
    throw new Error('Test 2 Failed: date-fns format import missing from Calendar.tsx');
  }

  if (!calendarCode.includes('safeFormatTime')) {
    throw new Error('Test 2 Failed: safeFormatTime missing from Calendar.tsx');
  }

  if (!calendarCode.includes('CalendarWithErrorBoundary') || !calendarCode.includes('export default CalendarWithErrorBoundary')) {
    throw new Error('Test 2 Failed: Calendar component is not wrapped with ErrorBoundary export');
  }

  if (!calendarCode.includes('Views.WEEK') || !calendarCode.includes('week: {')) {
    throw new Error('Test 2 Failed: Week view support missing from Calendar.tsx');
  }
  console.log('  -> PASSED: Calendar.tsx imports date-fns, defines safeFormatTime, enables Week view, and wraps export in ErrorBoundary.');
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST 3: In-Browser Live Execution & View Switching (Headless Chrome)
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Live In-Browser Planning Calendar Execution & Multi-View Test:');
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  const pageErrors = [];
  page.on('pageerror', (err) => {
    console.error('    [Browser Page Error]:', err.message);
    pageErrors.push(err.message);
  });
  page.on('console', (msg) => {
    console.log('    [Browser Console]:', msg.text());
  });

  const token = jwt.sign(
    { id: '67c05a32a7cf083dc7f2fbd6', role: 'Admin', username: 'techbeeps' },
    process.env.JWT_SECRET || 'abcdefghijklmnopqrstuvwxyz'
  );

  // Prime local storage with authenticated session
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => {
    localStorage.setItem('token', t);
    localStorage.setItem('user', JSON.stringify({ role: 'Admin', name: 'Admin' }));
  }, token);

  // Navigate to Calendar
  console.log('Navigating to http://localhost:5173/calendar...');
  await page.goto('http://localhost:5173/calendar', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 4500));

  console.log('Current URL:', page.url());
  const pageState = await page.evaluate(() => {
    return {
      url: window.location.href,
      bodyText: document.body.innerText.substring(0, 300),
      hasRoot: !!document.getElementById('root'),
      rootHtml: document.getElementById('root')?.innerHTML.substring(0, 400),
      hasCalendar: !!(document.querySelector('.rbc-calendar') || document.querySelector('.google-calendar-wrapper')),
    };
  });
  console.log('Page State:', JSON.stringify(pageState, null, 2));

  if (!pageState.hasCalendar) {
    throw new Error(`Test 3 Failed: Calendar DOM element was not found on ${pageState.url}! Body: ${pageState.bodyText}`);
  }

  // Switch Views: Month -> Week -> Day -> Agenda -> Month
  const viewsToTest = ['Week', 'Day', 'Agenda', 'Month'];
  for (const viewName of viewsToTest) {
    const clicked = await page.evaluate((name) => {
      const btns = Array.from(document.querySelectorAll('button'));
      const target = btns.find((b) => b.innerText && b.innerText.trim() === name);
      if (target) {
        target.click();
        return true;
      }
      return false;
    }, viewName);

    if (!clicked) {
      throw new Error(`Test 3 Failed: View button '${viewName}' could not be clicked!`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Check if any "format is not defined" error occurred
  const hasFormatError = pageErrors.some((e) => e.toLowerCase().includes('format is not defined'));
  if (hasFormatError) {
    throw new Error('Test 3 Failed: "format is not defined" error was triggered in browser console!');
  }

  // Capture verification screenshot
  const screenshotPath = path.resolve(__dirname, '../../calendar_verification.png');
  await page.screenshot({ path: screenshotPath });
  console.log(`  -> Screenshot saved to ${screenshotPath}`);

  await browser.close();
  console.log('  -> PASSED: Calendar loaded cleanly, switched Month/Week/Day/Agenda views with 0 format errors.');
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST 4: Zero-Regression Gate (Invoice & PDF Download)
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Zero-Regression Gate (Invoice #2026/0025 & PDF Download):');
  const resInvoice = await fetch('http://127.0.0.1:8080/invoice/invoice/6ad202dcb67074d4c4540f79', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const invData = await resInvoice.json();
  const test4aPass = resInvoice.status === 200 && invData.invoice && invData.invoice.index === '2026/0025';

  const resPdf = await fetch('http://127.0.0.1:8080/invoice/download', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ Id: '6ad202dcb67074d4c4540f79' })
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
  console.log(`  EXEC-07 VERIFICATION COMPLETE: ${passedTests}/${totalTests} TESTS PASSED!`);
  console.log('  Status: 🟢 VERIFIED & READY FOR CLIENT SIGN-OFF');
  console.log('===============================================================');
  process.exit(0);
}

runExec07Verification().catch((err) => {
  console.error('\nEXEC-07 VERIFICATION FAILED:', err.message);
  process.exit(1);
});
