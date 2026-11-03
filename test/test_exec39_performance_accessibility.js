const assert = require('assert');
const fs = require('fs');
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
      name: 'Executive Admin',
      access: ['Dashboard', 'Leads', 'Customer', 'Finance', 'HRM'],
      username: 'Mizbahuddin Qasim',
    },
  },
  JWT_SECRET
);

const adminHeaders = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${ADMIN_TOKEN}`,
};

async function runTests() {
  console.log('========================================================================');
  console.log('EXEC-39: Performance, Bundle Code-Splitting & Mobile Accessibility Tests');
  console.log('========================================================================');

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

  // 1. Vite Code-Splitting Configuration Verification
  {
    const viteConfigPath = path.join(__dirname, '../../techbeeps-crm-frontend/vite.config.js');
    record('Vite config file exists', fs.existsSync(viteConfigPath));
    const viteConfig = fs.readFileSync(viteConfigPath, 'utf8');

    record('Vite config specifies manualChunks', viteConfig.includes('manualChunks'));
    record('Vite config defines vendor-mui chunk', viteConfig.includes('vendor-mui'));
    record('Vite config defines vendor-calendar chunk', viteConfig.includes('vendor-calendar'));
    record('Vite config defines vendor-icons chunk', viteConfig.includes('vendor-icons'));
    record('Vite config defines vendor-utils chunk', viteConfig.includes('vendor-utils'));
    record('Vite config defines vendor-react-core chunk', viteConfig.includes('vendor-react-core'));
  }

  // 2. Dist Chunks Output Verification
  {
    const distAssetsDir = path.join(__dirname, '../../techbeeps-crm-frontend/dist/assets');
    record('Dist assets directory exists', fs.existsSync(distAssetsDir));
    const assetFiles = fs.readdirSync(distAssetsDir);

    const hasMuiChunk = assetFiles.some(f => f.startsWith('vendor-mui') && f.endsWith('.js'));
    const hasCalendarChunk = assetFiles.some(f => f.startsWith('vendor-calendar') && f.endsWith('.js'));
    const hasIconsChunk = assetFiles.some(f => f.startsWith('vendor-icons') && f.endsWith('.js'));
    const hasReactCoreChunk = assetFiles.some(f => f.startsWith('vendor-react-core') && f.endsWith('.js'));

    record('Production build generated vendor-mui chunk', hasMuiChunk);
    record('Production build generated vendor-calendar chunk', hasCalendarChunk);
    record('Production build generated vendor-icons chunk', hasIconsChunk);
    record('Production build generated vendor-react-core chunk', hasReactCoreChunk);
  }

  // 3. Mobile Narrow-Screen (375px/390px) Line Items Layout & A11y Verification
  {
    // A. Editinvoice.jsx
    const editInvPath = path.join(__dirname, '../../techbeeps-crm-frontend/src/pages/InvoicePage/Editinvoice.jsx');
    record('Editinvoice.jsx exists', fs.existsSync(editInvPath));
    const editInvContent = fs.readFileSync(editInvPath, 'utf8');

    record('Editinvoice has desktop table wrapper (hidden md:block)', editInvContent.includes('hidden md:block'));
    record('Editinvoice has mobile card wrapper (block md:hidden)', editInvContent.includes('block md:hidden'));
    record('Editinvoice mobile view computes and renders lineSubtotal', editInvContent.includes('formatCurrency(lineSubtotal)'));
    record('Editinvoice includes aria-label for Sales Group accessibility', editInvContent.includes('aria-label={`Item ${index + 1} Sales Group`}') || editInvContent.includes('aria-label={`Row ${index + 1} Sales Group`}'));
    record('Editinvoice includes aria-label for Quantity accessibility', editInvContent.includes('aria-label={`Item ${index + 1} Quantity`}') || editInvContent.includes('aria-label={`Row ${index + 1} Quantity`}'));
    record('Editinvoice includes aria-label for Price accessibility', editInvContent.includes('aria-label={`Item ${index + 1} Unit Price`}') || editInvContent.includes('aria-label={`Row ${index + 1} Unit Price`}'));
    record('Editinvoice includes accessible delete action', editInvContent.includes('Remove Line') && editInvContent.includes('aria-label'));

    // B. NewInvoice.jsx
    const newInvPath = path.join(__dirname, '../../techbeeps-crm-frontend/src/pages/InvoicePage/NewInvoice.jsx');
    record('NewInvoice.jsx exists', fs.existsSync(newInvPath));
    const newInvContent = fs.readFileSync(newInvPath, 'utf8');

    record('NewInvoice has desktop table wrapper (hidden md:block)', newInvContent.includes('hidden md:block'));
    record('NewInvoice has mobile card wrapper (block md:hidden)', newInvContent.includes('block md:hidden'));
    record('NewInvoice mobile view computes and renders lineSubtotal', newInvContent.includes('formatCurrency(lineSubtotal)'));
    record('NewInvoice includes aria-label for Sales Group accessibility', newInvContent.includes('aria-label={`Item ${index + 1} Sales Group`}'));
    record('NewInvoice includes aria-label for Quantity accessibility', newInvContent.includes('aria-label={`Item ${index + 1} Quantity`}'));
    record('NewInvoice includes aria-label for Price accessibility', newInvContent.includes('aria-label={`Item ${index + 1} Unit Price`}'));

    // C. Editoffer.jsx (Quotes)
    const editOfferPath = path.join(__dirname, '../../techbeeps-crm-frontend/src/pages/Quotes/Editoffer.jsx');
    record('Editoffer.jsx exists', fs.existsSync(editOfferPath));
    const editOfferContent = fs.readFileSync(editOfferPath, 'utf8');

    record('Editoffer has line items container with role="region"', editOfferContent.includes('role="region"'));
    record('Editoffer has mobile-only subtotal badge (flex md:hidden)', editOfferContent.includes('flex md:hidden'));
    record('Editoffer displays live rowSubtotal badge', editOfferContent.includes('rowSubtotal.toFixed(2)'));
    record('Editoffer includes aria-label on Quantity input', editOfferContent.includes('aria-label={`Item ${index + 1} Quantity`}'));
    record('Editoffer includes aria-label on Price input', editOfferContent.includes('aria-label={`Item ${index + 1} Unit Price`}'));
  }

  // 4. Modal Dialog Accessibility (A11y) & Keyboard Traversal
  {
    const convertCustPath = path.join(__dirname, '../../techbeeps-crm-frontend/src/pages/UserLeads/ConvertAsCustomer.jsx');
    record('ConvertAsCustomer.jsx exists', fs.existsSync(convertCustPath));
    const convertCustContent = fs.readFileSync(convertCustPath, 'utf8');

    record('ConvertAsCustomer supports Escape key listener for keyboard dismissal', convertCustContent.includes('Escape'));
  }

  // 5. Backend Health & Statutory Baseline Invariant Check
  {
    const healthRes = await fetch(`${BASE_URL}/health`);
    record('Backend server is healthy (HTTP 200)', healthRes.status === 200);

    const kpiRes = await fetch(`${BASE_URL}/api/dashboard/kpis`, { headers: adminHeaders });
    record('Management dashboard KPIs endpoint returns HTTP 200', kpiRes.status === 200);

    // Verify baseline invoice #2026/0025
    const invRes = await fetch(`${BASE_URL}/invoice/invoiceList`, { headers: adminHeaders });
    record('Invoice list endpoint returns HTTP 200', invRes.status === 200);
    const invBody = await invRes.json();
    const invoices = invBody.invoiceData || invBody.data || [];
    const baseline = invoices.find(i => String(i.index || i.invoice_number) === '2026/0025' || String(i.total) === '746.39');

    record('Baseline invoice #2026/0025 exists', Boolean(baseline));
    if (baseline) {
      record('Baseline invoice total is strictly preserved at €746.39', Math.abs(baseline.total - 746.39) < 0.01);
      record('Baseline invoice subtotal is strictly preserved at €829.32', Math.abs(baseline.subTotal - 829.32) < 0.01);

      const pdfRes = await fetch(`${BASE_URL}/invoice/download`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ Id: baseline._id, invoiceId: baseline._id }),
      });
      record('Statutory PDF download returns HTTP 200 OK', pdfRes.status === 200);
      const pdfBuffer = await pdfRes.arrayBuffer();
      record('PDF stream has valid binary size (> 50,000 bytes)', pdfBuffer.byteLength > 50000);
    }
  }

  console.log('========================================================================');
  console.log(`TEST SUMMARY: ${passed} / ${total} tests passed (${Math.round((passed / total) * 100)}%)`);
  console.log('========================================================================');

  if (passed === total) {
    console.log('ALL PHASE 39 PERFORMANCE & MOBILE ACCESSIBILITY CHECKS PASSED PERFECTLY!');
    process.exit(0);
  } else {
    console.error('Some tests failed.');
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});

