const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Invoice = require('../models/invoice');
const Payment = require('../models/PaymentRecordModel');
const User = require('../models/user');

const DB_URI = process.env.MONGO_URI;

function makeRequest(method, pathUrl, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = data ? JSON.stringify(data) : null;
    const options = {
      hostname: '127.0.0.1',
      port: 8080,
      path: pathUrl,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: body ? JSON.parse(body) : null });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTask35Verification() {
  console.log('[Setup] Connecting to MongoDB...');
  await mongoose.connect(DB_URI);
  console.log('[Setup] Connected to DB.');

  const createdInvoiceIds = [];
  const createdPaymentIds = [];

  try {
    const adminUser = await User.findOne({ role: 'Admin' });
    if (!adminUser) {
      throw new Error('No Admin user found for tests');
    }
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { id: adminUser._id, email: adminUser.email, role: adminUser.role },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '1h' }
    );
    const authHeaders = { Authorization: `Bearer ${token}` };

    console.log('\n--- TEST SUITE: Task 35 - Credit Notes, Payments & Reversals with Atomic Transactions ---');

    // 1. Create a clean test invoice
    const testInvoice = new Invoice({
      invoiceNumber: `INV-TEST-T35-${Date.now()}`,
      index: `TEST-T35-${Date.now()}`,
      total: 1000,
      subtotal: 826.45,
      tax: 173.55,
      taxPercent: 21,
      paidAmount: 0,
      creditedAmount: 0,
      balanceDue: 1000,
      status: 'Sent',
      issueDate: new Date(),
      items: [
        {
          name: 'Test Service Task 35',
          description: 'Verification Item',
          price: 826.45,
          quantity: 1,
          total: 826.45,
          vatPercentage: 21,
          vatAmount: 173.55,
        },
      ],
    });
    await testInvoice.save();
    createdInvoiceIds.push(testInvoice._id);
    console.log(`[Setup] Created Test Invoice ${testInvoice._id} with total: €1000`);

    // 2. Test Record Payment of €400 (Atomic transaction check)
    console.log('\n[Test 1] Recording Payment of €400...');
    const payRes = await makeRequest(
      'POST',
      '/api/record-payment',
      {
        invoiceId: testInvoice._id.toString(),
        amount: 400,
        paymentMode: 'bank_transfer',
        date: new Date().toISOString(),
        description: 'Partial payment Task 35 test',
      },
      authHeaders
    );

    console.log(`Response Status: ${payRes.status}`);
    if (payRes.status !== 200 && payRes.status !== 201) {
      throw new Error(`Failed to record payment: ${JSON.stringify(payRes.body)}`);
    }

    const paymentRecord = await Payment.findOne({ invoiceId: testInvoice._id, amount: 400 });
    if (!paymentRecord) {
      throw new Error('Payment record not found in DB!');
    }
    createdPaymentIds.push(paymentRecord._id);
    console.log(`[Passed] Payment record created with ID: ${paymentRecord._id}`);

    // Verify invoice ledger balance after payment
    const invAfterPay = await Invoice.findById(testInvoice._id);
    console.log(`Invoice after payment -> Paid: €${invAfterPay.paid}, Credited: €${invAfterPay.credited}, BalanceDue: €${invAfterPay.balanceDue}, PaymentStatus: ${invAfterPay.payment}`);
    if (invAfterPay.paid !== 400 || invAfterPay.balanceDue !== 600 || invAfterPay.payment !== 'partially_paid') {
      throw new Error(`Invoice balance mismatch! Expected paid=400, balanceDue=600, payment=partially_paid. Got paid=${invAfterPay.paid}, balanceDue=${invAfterPay.balanceDue}, payment=${invAfterPay.payment}`);
    }
    console.log('[Passed] Invoice ledger synchronized correctly after payment.');

    // 3. Test Issue Credit Note of €200 (Atomic transaction & CN numbering check)
    console.log('\n[Test 2] Issuing Credit Note of €200...');
    const cnRes = await makeRequest(
      'POST',
      '/api/issue-credit-note',
      {
        invoiceId: testInvoice._id.toString(),
        amount: 200,
        reason: 'Service quality discount Task 35',
        date: new Date().toISOString(),
      },
      authHeaders
    );

    console.log(`Response Status: ${cnRes.status}`);
    if (cnRes.status !== 200 && cnRes.status !== 201) {
      throw new Error(`Failed to issue credit note: ${JSON.stringify(cnRes.body)}`);
    }

    const cnRecord = await Payment.findOne({ invoiceId: testInvoice._id, type: 'credit_note' });
    if (!cnRecord) {
      throw new Error('Credit Note payment record not found in DB!');
    }
    createdPaymentIds.push(cnRecord._id);
    const cnIdentifier = cnRecord.creditNoteIndex || cnRecord.creditNoteNumber;
    console.log(`[Passed] Credit note record created with number: ${cnIdentifier}, Amount: €${cnRecord.amount}`);
    if (!cnIdentifier || (!cnIdentifier.startsWith('CN-') && !cnIdentifier.startsWith('TEST-CN-'))) {
      throw new Error(`Invalid credit note number format: ${cnIdentifier}`);
    }

    // Verify invoice ledger balance after credit note
    const invAfterCn = await Invoice.findById(testInvoice._id);
    console.log(`Invoice after Credit Note -> Paid: €${invAfterCn.paid}, Credited: €${invAfterCn.credited}, BalanceDue: €${invAfterCn.balanceDue}, PaymentStatus: ${invAfterCn.payment}`);
    if (invAfterCn.credited !== 200 || invAfterCn.balanceDue !== 400) {
      throw new Error(`Invoice balance mismatch after CN! Expected credited=200, balanceDue=400`);
    }
    console.log('[Passed] Invoice ledger synchronized correctly after Credit Note.');

    // 4. Test Reverse Payment of €400 (Atomic reversal & ledger balance restoration check)
    console.log('\n[Test 3] Reversing Payment of €400...');
    const revRes = await makeRequest(
      'POST',
      `/api/payment/reverse/${paymentRecord._id.toString()}`,
      {
        reason: 'Client requested wire reversal Task 35',
      },
      authHeaders
    );

    console.log(`Response Status: ${revRes.status}`);
    if (revRes.status !== 200 && revRes.status !== 201) {
      throw new Error(`Failed to reverse payment: ${JSON.stringify(revRes.body)}`);
    }

    // Verify original payment is marked 'reversed'
    const updatedPayment = await Payment.findById(paymentRecord._id);
    if (updatedPayment.status !== 'reversed') {
      throw new Error(`Expected payment status to be 'reversed', got: ${updatedPayment.status}`);
    }

    // Verify reversal entry created
    const reversalRecord = await Payment.findOne({
      invoiceId: testInvoice._id,
      type: 'reversal',
      reversalOf: paymentRecord._id,
    });
    if (!reversalRecord) {
      throw new Error('Reversal transaction entry was not recorded in DB!');
    }
    createdPaymentIds.push(reversalRecord._id);
    console.log(`[Passed] Reversal record verified: Amount = €${reversalRecord.amount}`);

    // Verify invoice ledger balance after reversal
    const invAfterRev = await Invoice.findById(testInvoice._id);
    console.log(`Invoice after Reversal -> Paid: €${invAfterRev.paid}, Credited: €${invAfterRev.credited}, BalanceDue: €${invAfterRev.balanceDue}, PaymentStatus: ${invAfterRev.payment}`);
    if (invAfterRev.paid !== 0 || invAfterRev.credited !== 200 || invAfterRev.balanceDue !== 800) {
      throw new Error(`Invoice balance mismatch after reversal! Expected paid=0, credited=200, balanceDue=800. Got: paid=${invAfterRev.paid}, balanceDue=${invAfterRev.balanceDue}`);
    }
    console.log('[Passed] Invoice balance restored correctly upon payment reversal.');

    console.log('\n=== ALL 3/3 TASK 35 TESTS PASSED SUCCESSFULLY! ===\n');
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exit(1);
  } finally {
    // Cleanup test data
    console.log('[Cleanup] Cleaning up created test entities...');
    if (createdPaymentIds.length > 0) {
      await Payment.deleteMany({ _id: { $in: createdPaymentIds } });
    }
    if (createdInvoiceIds.length > 0) {
      await Invoice.deleteMany({ _id: { $in: createdInvoiceIds } });
    }
    await mongoose.disconnect();
    console.log('[Cleanup] Done.');
  }
}

runTask35Verification();
