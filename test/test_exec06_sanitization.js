const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
require('dotenv').config();

async function runSanitizationTests() {
  console.log('--- EXEC-06 RAW HTML SANITIZATION & CSP VERIFICATION ---');

  let allPassed = true;

  // Resolve Chrome Path
  const candidateChromePaths = [
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  let chromePath = null;
  for (const cPath of candidateChromePaths) {
    if (fs.existsSync(cPath)) {
      chromePath = cPath;
      break;
    }
  }

  // Test 1: Real In-Browser DOMPurify XSS Neutralization
  try {
    const browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    const dompurifyPath = path.join(__dirname, '..', '..', 'techbeeps-crm-frontend', 'node_modules', 'dompurify', 'dist', 'purify.min.js');
    const dompurifyCode = fs.readFileSync(dompurifyPath, 'utf8');
    await page.evaluate(dompurifyCode);

    const test1Results = await page.evaluate(() => {
      // Test 1a: Script tag stripping
      const scriptAttack = '<p>Normal message</p><script>alert("XSS Attack")</script>';
      const cleanedScript = DOMPurify.sanitize(scriptAttack, {
        USE_PROFILES: { html: true, svg: true },
        FORBID_TAGS: ['script', 'iframe', 'object', 'embed'],
        FORBID_ATTR: ['onerror', 'onload', 'onclick']
      });
      const pass1a = !cleanedScript.includes('<script>') && !cleanedScript.includes('alert') && cleanedScript.includes('<p>Normal message</p>');

      // Test 1b: Image onerror event handler stripping
      const eventAttack = '<img src="invalid_img.png" onerror="alert(document.domain)" alt="Banner" />';
      const cleanedEvent = DOMPurify.sanitize(eventAttack, {
        USE_PROFILES: { html: true, svg: true },
        FORBID_TAGS: ['script'],
        FORBID_ATTR: ['onerror', 'onload', 'onclick']
      });
      const pass1b = !cleanedEvent.includes('onerror') && !cleanedEvent.includes('alert') && cleanedEvent.includes('<img');

      // Test 1c: Javascript pseudo-protocol link stripping
      const jsLinkAttack = '<a href="javascript:alert(1)">Click for Promo</a>';
      const cleanedJsLink = DOMPurify.sanitize(jsLinkAttack, {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ['script']
      });
      const pass1c = !cleanedJsLink.includes('javascript:');

      // Test 1d: Inline SVG onload handler stripping while preserving SVG icon paths
      const svgAttack = '<svg viewBox="0 0 100 100" onload="alert(\'svg-xss\')"><path d="M10 10 H 90 V 90 H 10 L 10 10" fill="blue"/></svg>';
      const cleanedSvg = DOMPurify.sanitize(svgAttack, {
        USE_PROFILES: { svg: true, svgFilters: true },
        FORBID_TAGS: ['script'],
        FORBID_ATTR: ['onerror', 'onload', 'onclick']
      });
      const pass1d = !cleanedSvg.includes('onload') && !cleanedSvg.includes('alert') && cleanedSvg.includes('<svg') && cleanedSvg.includes('<path');

      return { pass1a, pass1b, pass1c, pass1d };
    });

    await browser.close();

    const test1Pass = test1Results.pass1a && test1Results.pass1b && test1Results.pass1c && test1Results.pass1d;
    console.log(`[Test 1] Real In-Browser DOMPurify XSS Neutralization: ${test1Pass ? 'PASSED (Scripts, OnError, JS Protocol & SVG OnLoad stripped; Markup preserved)' : 'FAILED'}`);
    if (!test1Pass) {
      console.error('Test 1 failure breakdown:', test1Results);
      allPassed = false;
    }
  } catch (err) {
    console.error('Test 1 execution error:', err);
    allPassed = false;
  }

  // Test 2: Audit All 20 dangerouslySetInnerHTML Occurrences in Frontend Codebase
  try {
    const frontendSrc = path.join(__dirname, '..', '..', 'techbeeps-crm-frontend', 'src');

    function scanDir(dir, results = []) {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const full = path.join(dir, entry);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          scanDir(full, results);
        } else if (/\.(tsx|jsx)$/.test(entry) && !entry.includes('.test.')) {
          const content = fs.readFileSync(full, 'utf8');
          const regex = /dangerouslySetInnerHTML\s*=\s*\{\{\s*__html\s*:\s*([^}]+)\}\}/gs;
          let match;
          while ((match = regex.exec(content)) !== null) {
            const rawExpr = match[1].trim();
            const isSanitized = rawExpr.includes('sanitizeHtml') || rawExpr.includes('sanitizeSvg');
            results.push({
              file: path.relative(frontendSrc, full),
              expression: rawExpr,
              isSanitized
            });
          }
        }
      }
      return results;
    }

    const occurrences = scanDir(frontendSrc);
    const unsanitized = occurrences.filter(occ => !occ.isSanitized);

    const test2Pass = occurrences.length === 20 && unsanitized.length === 0;
    console.log(`[Test 2] Codebase Static Audit: ${test2Pass ? `PASSED (All 20/20 dangerouslySetInnerHTML instances sanitized; 0 raw leaks)` : `FAILED (${unsanitized.length} unsanitized out of ${occurrences.length})`}`);
    if (!test2Pass) {
      console.log('Unsanitized items:', unsanitized);
      allPassed = false;
    }
  } catch (err) {
    console.error('Test 2 error:', err);
    allPassed = false;
  }

  // Test 3: Content Security Policy (CSP Meta Tag in index.html)
  try {
    const indexPath = path.join(__dirname, '..', '..', 'techbeeps-crm-frontend', 'index.html');
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    const test3Pass = indexContent.includes('http-equiv="Content-Security-Policy"');
    console.log(`[Test 3] Content Security Policy (CSP Meta Tag in index.html): ${test3Pass ? 'PASSED (Active CSP directive configured)' : 'FAILED'}`);
    if (!test3Pass) allPassed = false;
  } catch (err) {
    console.error('Test 3 error:', err);
    allPassed = false;
  }

  // Test 4: Zero-Regression Gate (Live Invoice View & PDF Generation)
  try {
    const jwt = require('jsonwebtoken');
    const validToken = jwt.sign(
      { id: '60d0fe4f5311236168a109ca', role: 'Admin', username: 'TestAdmin' },
      process.env.JWT_SECRET || 'abcdefghijklmnopqrstuvwxyz'
    );

    const resInvoice = await fetch('http://127.0.0.1:8080/invoice/invoice/6ad202dcb67074d4c4540f79', {
      headers: { Authorization: `Bearer ${validToken}` }
    });
    const invData = await resInvoice.json();
    const test4aPass = resInvoice.status === 200 && invData.invoice && invData.invoice.index === '2026/0025';

    const resPdf = await fetch('http://127.0.0.1:8080/invoice/download', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validToken}`
      },
      body: JSON.stringify({ Id: '6ad202dcb67074d4c4540f79' })
    });
    const pdfBuffer = await resPdf.arrayBuffer();
    const test4bPass = resPdf.status === 200 && pdfBuffer.byteLength > 1000;

    const test4Pass = test4aPass && test4bPass;
    console.log(`[Test 4] Zero-Regression Gate (Invoice #2026/0025 & PDF Download): ${test4Pass ? `PASSED (Invoice 200 OK, PDF ${pdfBuffer.byteLength} bytes)` : 'FAILED'}`);
    if (!test4Pass) allPassed = false;
  } catch (err) {
    console.error('Test 4 error:', err);
    allPassed = false;
  }

  console.log(`\nOVERALL EXEC-06 VERIFICATION: ${allPassed ? 'ALL TESTS PASSED!' : 'SOME TESTS FAILED'}`);
  process.exit(allPassed ? 0 : 1);
}

runSanitizationTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
