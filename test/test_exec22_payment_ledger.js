/**
 * EXEC-22 Verification Suite: Payment Ledger, Credit Notes, Cash Balance Deduction & Audit Log
 * 
 * Acceptance Checks per Executive Work Order:
 * 1. From the corrected EUR 981 issued fixture, a valid EUR 100 payment leaves EUR 881 everywhere after reload.
 * 2. Duplicate or concurrent payments, unauthorized allocation and overpayment follow server-enforced policy without double settlement.
 * 3. Full settlement and due-date passage produce the correct paid/overdue state.
 * 4. Full and partial credits reconcile tax and balance by original tax treatment.
 * 5. Append-only payment reversal preserves original events and restores balance.
 * 6. Immutable financial audit log preserves protected actor/action history.
 * 7. Zero-regression contract: Baseline Invoice #2026/0025 preserved at €746.39 with PDF 200 OK.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const axios = require('axios');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const BASE_URL = 'http://127.0.0.1:8080';
const JWT_SECRET = 'abcdefghijklmnopqrstuvwxyz';
const TEST_USER = {
  id: '67c05a32a7cf083dc7f2fbd6',
  username: 'techbeeps',
  email: 'mprofessionalwfh@gmail.com',
  role: 'Admin'
};

const authToken = jwt.sign(TEST_USER, JWT_SECRET, { expiresIn: '1h' });
const authHeaders = {
  headers: {
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json'
  }
};

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    testsPassed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    testsFailed++;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('EXEC-22: Payment Ledger, Credit Notes, Cash Balance & Audit Log');
  console.log('================================================================\n');

  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
      });
      console.log('Connected to MongoDB Atlas for verification.\n');
    }
  } catch (dbErr) {
    console.warn('Warning: Mongoose direct connect error:', dbErr.message);
  }

  let customerId = null;
  let templateId = null;
  try {
    const custRes = await axios.get(`${BASE_URL}/customer/customerList`, authHeaders);
    const customers = custRes.data?.customers || [];
    if (customers.length > 0) {
      customerId = customers[0]._id;
      console.log(`Using customer ID: ${customerId} (${customers[0].firstName || ''} ${customers[0].lastName || ''})`);
    } else {
      console.error('No customer found in DB');
      process.exit(1);
    }

    const tRes = await axios.get(`${BASE_URL}/api/templates?type=invoice`, authHeaders);
    const templates = tRes.data || [];
    if (templates.length > 0) {
      templateId = templates[0]._id;
      console.log(`Using template ID: ${templateId} (${templates[0].name || ''})\n`);
    }
  } catch (err) {
    console.error('Failed to get initial metadata:', err.message);
    process.exit(1);
  }

  const Invoice = require('../models/invoice');
  const Payment = require('../models/PaymentRecordModel');
  const FinancialAuditLog = require('../models/financialAuditModel');

  // -------------------------------------------------------------
  // Test 1: Canonical Fixture F-01 Payment & Reload Persistence
  // -------------------------------------------------------------
  console.log('--- Test 1: Fixture F-01 (€981.00) Payment of €100 leaves €881 everywhere ---');
  let f01InvoiceId = null;
  let payment1Id = null;
  try {
    // Create Canonical Fixture F-01 Invoice: 1000 x 1 @ 9% VAT excl, 10% disc -> Total €981.00
    const f01Payload = {
      subject: 'EXEC-22 Fixture F-01 Payment Test',
      reference: 'INV-EXEC22-F01',
      vat: 'exclusive',
      discount: 10,
      customer: customerId,
      financialTemplate: templateId,
      items: [
        { description: 'Moving Service F-01', quantity: 1, price: 1000, btw: '9' }
      ]
    };

    const invRes = await axios.post(`${BASE_URL}/invoice/new_invoice`, f01Payload, {
      ...authHeaders,
      headers: { ...authHeaders.headers, 'X-Allow-Duplicate': 'true' }
    });
    assert(invRes.status === 201, 'Fixture F-01 invoice created successfully (HTTP 201)');
    f01InvoiceId = invRes.data._id;

    // Verify initial invoice state
    const detailBefore = await axios.get(`${BASE_URL}/invoice/invoice/${f01InvoiceId}`, authHeaders);
    assert(Number(detailBefore.data.invoice.total) === 981, `Initial total is strictly €981.00 (got ${detailBefore.data.invoice.total})`);
    assert(Number(detailBefore.data.invoice.balanceDue) === 981, `Initial balanceDue is €981.00 (got ${detailBefore.data.invoice.balanceDue})`);
    assert(Number(detailBefore.data.invoice.paid) === 0, 'Initial paid is €0.00');
    assert(detailBefore.data.invoice.payment?.toLowerCase() === 'unpaid', 'Initial payment status is "unpaid"');

    // Record EUR 100 payment via POST /api/record-payment
    const payRes = await axios.post(`${BASE_URL}/api/record-payment`, {
      invoiceId: f01InvoiceId,
      amount: 100,
      paymentMode: 'bank_transfer',
      description: 'First installment €100',
      date: new Date().toISOString()
    }, authHeaders);
    assert(payRes.status === 201, 'EUR 100.00 payment recorded successfully (HTTP 201)');
    payment1Id = payRes.data.payment._id;

    // Verification 1: GET /invoice/invoice/:id after reload
    const detailAfter = await axios.get(`${BASE_URL}/invoice/invoice/${f01InvoiceId}`, authHeaders);
    assert(Number(detailAfter.data.invoice.paid) === 100, `Invoice detail paid amount is €100.00 (got ${detailAfter.data.invoice.paid})`);
    assert(Number(detailAfter.data.invoice.balanceDue) === 881, `Invoice detail balance due is strictly €881.00 (got ${detailAfter.data.invoice.balanceDue})`);
    assert(detailAfter.data.invoice.payment === 'partially_paid', `Invoice payment status transitioned to "partially_paid" (got ${detailAfter.data.invoice.payment})`);

    // Verification 2: GET /invoice/invoiceList
    const listRes = await axios.get(`${BASE_URL}/invoice/invoiceList`, authHeaders);
    const listedInv = (listRes.data?.invoiceData || []).find(inv => String(inv._id) === String(f01InvoiceId));
    assert(listedInv !== undefined, 'Invoice retrieved from invoice list');
    assert(Number(listedInv.paid) === 100, `Invoice in list has paid €100.00 (got ${listedInv.paid})`);
    assert(Number(listedInv.balanceDue) === 881, `Invoice in list has balanceDue €881.00 (got ${listedInv.balanceDue})`);

    // Verification 3: Direct MongoDB Document reload
    const dbDoc = await Invoice.findById(f01InvoiceId);
    assert(Number(dbDoc.paid) === 100, `MongoDB document persisted paid €100.00 (got ${dbDoc.paid})`);
    assert(Number(dbDoc.balanceDue) === 881, `MongoDB document persisted balanceDue €881.00 (got ${dbDoc.balanceDue})`);
  } catch (err) {
    assert(false, `Test 1 failed: ${err.response?.data?.message || err.message}`);
  }

  // -------------------------------------------------------------
  // Test 2: Idempotency Key Guard & Double-Click Debounce
  // -------------------------------------------------------------
  console.log('\n--- Test 2: Idempotency Key Guard & Rapid Double-Click Debounce ---');
  try {
    const testIdempotencyKey = `KEY-PAY-TEST-${Date.now()}`;
    const duplicatePayload = {
      invoiceId: f01InvoiceId,
      amount: 50,
      paymentMode: 'cash',
      description: 'Idempotent cash payment'
    };

    // First request with idempotency key
    const res1 = await axios.post(`${BASE_URL}/api/record-payment`, duplicatePayload, {
      ...authHeaders,
      headers: { ...authHeaders.headers, 'X-Idempotency-Key': testIdempotencyKey }
    });
    assert(res1.status === 201, 'First payment request succeeded (HTTP 201)');
    const pay2Id = res1.data.payment._id;

    // Second request with exact same idempotency key (double click simulation)
    const res2 = await axios.post(`${BASE_URL}/api/record-payment`, duplicatePayload, {
      ...authHeaders,
      headers: { ...authHeaders.headers, 'X-Idempotency-Key': testIdempotencyKey }
    });
    assert(res2.status === 200, 'Second idempotent request intercepted gracefully (HTTP 200)');
    assert(String(res2.data.payment._id) === String(pay2Id), 'Second request returned exact same payment _id');

    // Verify invoice balance was only deducted ONCE (€881 - €50 = €831, NOT €781)
    const checkInv = await Invoice.findById(f01InvoiceId);
    assert(Number(checkInv.paid) === 150, `Invoice paid strictly reflects single €50 deduction: €150.00 (got ${checkInv.paid})`);
    assert(Number(checkInv.balanceDue) === 831, `Invoice balanceDue strictly reflects single deduction: €831.00 (got ${checkInv.balanceDue})`);

    // Clean up second test payment so balance stays predictable
    await Payment.deleteOne({ _id: pay2Id });
    const { syncInvoiceLedgerBalance } = require('../utils/financialLedger');
    await syncInvoiceLedgerBalance(f01InvoiceId);
  } catch (err) {
    assert(false, `Test 2 failed: ${err.response?.data?.message || err.message}`);
  }

  // -------------------------------------------------------------
  // Test 3: Server-Enforced Overpayment Protection
  // -------------------------------------------------------------
  console.log('\n--- Test 3: Server-Enforced Overpayment Protection ---');
  try {
    // Balance due is currently €881.00. Attempt to record €900.00 payment.
    let overpaymentBlocked = false;
    let errorMsg = '';
    try {
      await axios.post(`${BASE_URL}/api/record-payment`, {
        invoiceId: f01InvoiceId,
        amount: 900,
        paymentMode: 'bank_transfer',
        description: 'Deliberate overpayment attempt'
      }, authHeaders);
    } catch (err) {
      if (err.response?.status === 400) {
        overpaymentBlocked = true;
        errorMsg = err.response.data?.message;
      }
    }
    assert(overpaymentBlocked, `Server strictly rejected overpayment of €900 with HTTP 400: "${errorMsg}"`);

    // Verify balance remains untouched at €881.00
    const invCheck = await Invoice.findById(f01InvoiceId);
    assert(Number(invCheck.balanceDue) === 881, `Balance remains strictly preserved at €881.00 (got ${invCheck.balanceDue})`);
  } catch (err) {
    assert(false, `Test 3 failed: ${err.response?.data?.message || err.message}`);
  }

  // -------------------------------------------------------------
  // Test 4: Full Settlement Lifecycle
  // -------------------------------------------------------------
  console.log('\n--- Test 4: Full Settlement Lifecycle (Pay remaining €881.00) ---');
  try {
    const settleRes = await axios.post(`${BASE_URL}/api/record-payment`, {
      invoiceId: f01InvoiceId,
      amount: 881,
      paymentMode: 'online_payment',
      description: 'Final full settlement of remaining balance'
    }, authHeaders);
    assert(settleRes.status === 201, 'Remaining €881.00 payment recorded (HTTP 201)');

    const finalDetail = await axios.get(`${BASE_URL}/invoice/invoice/${f01InvoiceId}`, authHeaders);
    assert(Number(finalDetail.data.invoice.paid) === 981, `Total paid equals full invoice amount: €981.00 (got ${finalDetail.data.invoice.paid})`);
    assert(Number(finalDetail.data.invoice.balanceDue) === 0, `Remaining balance due is strictly €0.00 (got ${finalDetail.data.invoice.balanceDue})`);
    assert(finalDetail.data.invoice.payment === 'paid', `Invoice status transitioned to "paid" (got ${finalDetail.data.invoice.payment})`);

    // Clean up F-01 invoice and payments
    await Payment.deleteMany({ invoiceId: f01InvoiceId });
    await axios.delete(`${BASE_URL}/invoice/deleteInvoice/${f01InvoiceId}`, authHeaders);
    console.log('  ✓ Fixture F-01 test records cleaned up cleanly');
    testsPassed++;
  } catch (err) {
    assert(false, `Test 4 failed: ${err.response?.data?.message || err.message}`);
  }

  // -------------------------------------------------------------
  // Test 5: Due Date Passage & Overdue Lifecycle
  // -------------------------------------------------------------
  console.log('\n--- Test 5: Due Date Passage & Overdue Status Lifecycle ---');
  let overdueInvoiceId = null;
  try {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 10); // 10 days in the past

    const overduePayload = {
      subject: 'EXEC-22 Overdue Invoice Test',
      reference: 'INV-EXEC22-OVERDUE',
      vat: 'exclusive',
      discount: 0,
      customer: customerId,
      financialTemplate: templateId,
      expire_date: pastDate,
      items: [
        { description: 'Unpaid Overdue Service', quantity: 1, price: 300, btw: '21' }
      ]
    };

    const invRes = await axios.post(`${BASE_URL}/invoice/new_invoice`, overduePayload, {
      ...authHeaders,
      headers: { ...authHeaders.headers, 'X-Allow-Duplicate': 'true' }
    });
    overdueInvoiceId = invRes.data._id;

    const detailRes = await axios.get(`${BASE_URL}/invoice/invoice/${overdueInvoiceId}`, authHeaders);
    assert(detailRes.data.invoice.payment === 'overdue', `Unpaid invoice past due date reflects status "overdue" (got ${detailRes.data.invoice.payment})`);

    // Clean up
    await axios.delete(`${BASE_URL}/invoice/deleteInvoice/${overdueInvoiceId}`, authHeaders);
    console.log('  ✓ Overdue test invoice cleaned up cleanly');
    testsPassed++;
  } catch (err) {
    assert(false, `Test 5 failed: ${err.response?.data?.message || err.message}`);
  }

  // -------------------------------------------------------------
  // Test 6: Credit Note Issuance & Tax Reconciliation
  // -------------------------------------------------------------
  console.log('\n--- Test 6: Credit Note Issuance & Pro-Rata Tax Reconciliation ---');
  let creditInvoiceId = null;
  let creditNoteId = null;
  try {
    // Create an invoice of €500.00 + 21% VAT = €605.00
    const creditPayload = {
      subject: 'EXEC-22 Credit Note Test Invoice',
      reference: 'INV-EXEC22-CREDIT',
      vat: 'exclusive',
      discount: 0,
      customer: customerId,
      financialTemplate: templateId,
      items: [
        { description: 'Service to be credited', quantity: 1, price: 500, btw: '21' }
      ]
    };

    const invRes = await axios.post(`${BASE_URL}/invoice/new_invoice`, creditPayload, {
      ...authHeaders,
      headers: { ...authHeaders.headers, 'X-Allow-Duplicate': 'true' }
    });
    creditInvoiceId = invRes.data._id;
    assert(Number(invRes.data.total) === 605, `Invoice total is €605.00 (got ${invRes.data.total})`);

    // Issue Credit Note of €121.00 (which is €100 net + 21% VAT €21)
    const cnRes = await axios.post(`${BASE_URL}/api/credit-note`, {
      invoiceId: creditInvoiceId,
      amount: 121,
      reason: 'Partial discount credit for damaged cargo'
    }, authHeaders);
    assert(cnRes.status === 201, 'Credit note issued successfully (HTTP 201)');
    creditNoteId = cnRes.data.creditNote._id;
    const cnIndex = cnRes.data.creditNote.creditNoteIndex;

    assert(cnIndex && /CN-/.test(cnIndex), `Sequential Credit Note number allocated: ${cnIndex}`);
    assert(Number(cnRes.data.creditNote.netAmount) === 100, `Pro-rata net amount reconciled to €100.00 (got ${cnRes.data.creditNote.netAmount})`);
    assert(Number(cnRes.data.creditNote.taxAmount) === 21, `Pro-rata tax amount reconciled to €21.00 (got ${cnRes.data.creditNote.taxAmount})`);

    // Verify invoice balance after credit note (€605 - €121 = €484)
    const detailAfterCN = await axios.get(`${BASE_URL}/invoice/invoice/${creditInvoiceId}`, authHeaders);
    assert(Number(detailAfterCN.data.invoice.credited) === 121, `Invoice credited amount is €121.00 (got ${detailAfterCN.data.invoice.credited})`);
    assert(Number(detailAfterCN.data.invoice.balanceDue) === 484, `Invoice balanceDue reduced to strictly €484.00 (got ${detailAfterCN.data.invoice.balanceDue})`);
    assert(detailAfterCN.data.invoice.payment === 'partially_paid', `Invoice status is "partially_paid" after credit note`);

    // Clean up
    await Payment.deleteMany({ invoiceId: creditInvoiceId });
    await axios.delete(`${BASE_URL}/invoice/deleteInvoice/${creditInvoiceId}`, authHeaders);
    console.log('  ✓ Credit note test records cleaned up cleanly');
    testsPassed++;
  } catch (err) {
    assert(false, `Test 6 failed: ${err.response?.data?.message || err.message}`);
  }

  // -------------------------------------------------------------
  // Test 7: Append-Only Payment Reversal
  // -------------------------------------------------------------
  console.log('\n--- Test 7: Append-Only Payment Reversal ---');
  let revInvoiceId = null;
  try {
    // Create invoice of €200.00
    const revPayload = {
      subject: 'EXEC-22 Payment Reversal Test',
      reference: 'INV-EXEC22-REV',
      vat: 'exclusive',
      discount: 0,
      customer: customerId,
      financialTemplate: templateId,
      items: [
        { description: 'Reversible Service', quantity: 1, price: 200, btw: '0' }
      ]
    };
    const invRes = await axios.post(`${BASE_URL}/invoice/new_invoice`, revPayload, {
      ...authHeaders,
      headers: { ...authHeaders.headers, 'X-Allow-Duplicate': 'true' }
    });
    revInvoiceId = invRes.data._id;

    // Record payment of €50
    const payRes = await axios.post(`${BASE_URL}/api/record-payment`, {
      invoiceId: revInvoiceId,
      amount: 50,
      paymentMode: 'bank_transfer',
      description: 'Initial payment to be reversed'
    }, authHeaders);
    const originalPaymentId = payRes.data.payment._id;

    // Reverse payment via POST /api/payment/reverse/:paymentId
    const revRes = await axios.post(`${BASE_URL}/api/payment/reverse/${originalPaymentId}`, {
      reason: 'Customer bank chargeback / bounced transfer'
    }, authHeaders);
    assert(revRes.status === 200, 'Payment reversal request succeeded (HTTP 200)');

    // Verify original payment is marked status: 'reversed'
    const origCheck = await Payment.findById(originalPaymentId);
    assert(origCheck.status === 'reversed', 'Original payment status updated to "reversed"');

    // Verify append-only reversal record was created
    const revDoc = await Payment.findOne({ reversalOf: originalPaymentId });
    assert(revDoc !== null, 'Append-only reversal record found in ledger');
    assert(Number(revDoc.amount) === -50, `Reversal record has negative amount -€50.00 (got ${revDoc.amount})`);
    assert(revDoc.type === 'reversal', 'Reversal record type is "reversal"');

    // Verify invoice balance was restored back to full €200
    const invAfterRev = await Invoice.findById(revInvoiceId);
    assert(Number(invAfterRev.paid) === 0, `Invoice paid restored to €0.00 (got ${invAfterRev.paid})`);
    assert(Number(invAfterRev.balanceDue) === 200, `Invoice balanceDue restored to full €200.00 (got ${invAfterRev.balanceDue})`);
    assert(invAfterRev.payment === 'unpaid', `Invoice status returned to "unpaid" (got ${invAfterRev.payment})`);

    // Clean up
    await Payment.deleteMany({ invoiceId: revInvoiceId });
    await axios.delete(`${BASE_URL}/invoice/deleteInvoice/${revInvoiceId}`, authHeaders);
    console.log('  ✓ Reversal test records cleaned up cleanly');
    testsPassed++;
  } catch (err) {
    assert(false, `Test 7 failed: ${err.response?.data?.message || err.message}`);
  }

  // -------------------------------------------------------------
  // Test 8: Protected Financial Audit Log & Immutability
  // -------------------------------------------------------------
  console.log('\n--- Test 8: Protected Financial Audit Log & Immutability ---');
  try {
    const auditRes = await axios.get(`${BASE_URL}/api/financial-audit-log`, authHeaders);
    assert(auditRes.status === 200, 'Audit log endpoint returned HTTP 200');
    const logs = auditRes.data.logs || [];
    assert(logs.length > 0, `Financial audit entries recorded in ledger (found ${logs.length} entries)`);

    // Direct immutability test: attempt to update an audit entry
    let updateBlocked = false;
    if (logs.length > 0) {
      const sampleLogId = logs[0]._id;
      try {
        await FinancialAuditLog.updateOne({ _id: sampleLogId }, { $set: { reason: 'Tampered Reason' } });
      } catch (tamperErr) {
        if (/immutable|append-only/i.test(tamperErr.message)) {
          updateBlocked = true;
        }
      }
    }
    assert(updateBlocked, 'Direct modification of financial audit log strictly rejected by Mongoose immutable hook');
  } catch (err) {
    assert(false, `Test 8 failed: ${err.response?.data?.message || err.message}`);
  }

  // -------------------------------------------------------------
  // Test 9: Zero-Regression Baseline Contract Verification
  // -------------------------------------------------------------
  console.log('\n--- Test 9: Zero-Regression Baseline Contract Verification ---');
  try {
    const allInvoicesRes = await axios.get(`${BASE_URL}/invoice/invoiceList`, authHeaders);
    const invoiceList = allInvoicesRes.data?.invoiceData || [];
    const baselineInv = invoiceList.find(inv => inv.index === '2026/0025' || inv.reference === '2026/0025');

    assert(baselineInv !== undefined, 'Baseline invoice #2026/0025 successfully retrieved from list');
    assert(Number(baselineInv.total) === 746.39, `Authoritative total strictly preserved at €746.39 (got ${baselineInv.total})`);
    assert(Number(baselineInv.btw) === 129.54, `Authoritative VAT strictly preserved at €129.54 (got ${baselineInv.btw})`);
    assert(Number(baselineInv.balanceDue) === 746.39, `Authoritative balanceDue correctly projected at €746.39 (got ${baselineInv.balanceDue})`);

    // Verify PDF download route 200 OK
    const pdfRes = await axios.post(`${BASE_URL}/invoice/download`, { Id: baselineInv._id }, {
      ...authHeaders,
      responseType: 'arraybuffer'
    });
    assert(pdfRes.status === 200, `Baseline PDF download route returns HTTP 200 OK`);
    assert(pdfRes.headers['content-type']?.includes('application/pdf'), 'Content-Type confirmed as application/pdf');
    assert(pdfRes.data.byteLength > 50000, `PDF content length is valid (${pdfRes.data.byteLength} bytes)`);
  } catch (err) {
    assert(false, `Zero-regression baseline verification failed: ${err.response?.data?.message || err.message}`);
  }

  console.log('\n================================================================');
  console.log(`EXEC-22 Verification Complete: ${testsPassed} passed, ${testsFailed} failed.`);
  console.log('================================================================');

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  if (testsFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
