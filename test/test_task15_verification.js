const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const crypto = require('crypto');

const Finance = require('../models/finance');
const Customer = require('../models/customer');
const Payment = require('../models/PaymentRecordModel');
const { executeAcceptance } = require('../utils/quoteAcceptanceEngine');
const { dispatchOutboxEmail, EMAIL_EVENTS, getStagingMailSink, clearStagingMailSink } = require('../utils/emailOutboxService');

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, detail = '') {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] ${testName} - ${detail}`);
    failedTests++;
  }
}

async function runVerification() {
  console.log('\n======================================================');
  console.log('TASK 15 [UM3-025] AUTOMATED VERIFICATION: QUOTE ACCEPTANCE EMAIL SECURITY');
  console.log('======================================================\n');

  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGO_URI, {
      retryWrites: true,
      serverSelectionTimeoutMS: 15000,
    });
  }
  console.log('[Setup] Connected to MongoDB Atlas\n');

  const createdCustomerIds = [];
  const createdQuoteIds = [];

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Direct defense-in-depth test in dispatchOutboxEmail
    // -------------------------------------------------------------------------
    console.log('--- Section 1: Outbox Defense-in-Depth Recipient Override ---');
    clearStagingMailSink();

    const dispatchResult = await dispatchOutboxEmail({
      eventType: EMAIL_EVENTS.QUOTE_ACCEPTED,
      recipient: 'attacker@hacker-domain.com',
      context: {
        customer: { email: 'verified-customer@universal-movers.nl', name: 'Verified Customer' },
        invoice: { _id: new mongoose.Types.ObjectId(), index: 'TEST-QUO-2026/9991' },
      },
      forceSink: true,
      idempotencyKey: `IDEMP-TEST15-DIRECT-${Date.now()}`,
    });

    const sink = getStagingMailSink();
    const lastMsg = sink[sink.length - 1];
    const actualRecipient = lastMsg ? (lastMsg.recipient || lastMsg.to) : dispatchResult.recipient;

    assert(dispatchResult.success === true, 'Test 1.1: Outbox dispatch succeeds in staging sink');
    assert(
      actualRecipient && actualRecipient.toLowerCase() === 'verified-customer@universal-movers.nl',
      'Test 1.2: Defense-in-depth rewrote attacker recipient to verified customer email',
      `Actual recipient: ${actualRecipient}`
    );

    // -------------------------------------------------------------------------
    // TEST 2: Attacker payload redirection attempt in executeAcceptance
    // -------------------------------------------------------------------------
    console.log('\n--- Section 2: Attacker Redirection Interception in executeAcceptance ---');

    // Create a verified customer
    const verifiedEmail = `test.victim.${Date.now()}@universal-movers.nl`;
    const customer = await Customer.create({
      firstName: 'Jan',
      lastName: 'de Vries',
      email: verifiedEmail,
      contact: '020 1234567',
      customerIndex: Math.floor(Math.random() * 90000) + 10000,
    });
    createdCustomerIds.push(customer._id);

    // Create an eligible quotation
    const quote = await Finance.create({
      Type: 'offer',
      index: `TEST-QUO-2026/${Math.floor(Math.random() * 9000) + 1000}`,
      customer: customer._id,
      Status: 'Sent',
      total: 750,
      subTotal: 619.83,
      btw: '21',
      items: [
        { description: 'Moving package', price: 619.83, quantity: 1, btw: '21' },
      ],
      capabilityToken: crypto.randomBytes(32).toString('hex'),
      tokenExpiresAt: new Date(Date.now() + 86400000 * 14),
    });
    createdQuoteIds.push(quote._id);

    clearStagingMailSink();

    // Attacker accepts quote using public token, but passes their own email in payload
    const attackerEmail = 'attacker-exfiltrator@evil.com';
    const acceptanceResult = await executeAcceptance({
      quoteIdOrToken: quote.capabilityToken,
      acceptancePayload: {
        name: 'Attacker Impersonator',
        email: attackerEmail,
        signature: 'ATTACKER_SIGNATURE_PROOF',
        comments: 'Attempting to redirect contract to evil domain',
      },
      clientIp: '198.51.100.24',
      userAgent: 'Mozilla/5.0 (Malicious Script/1.0)',
      idempotencyKey: `IDEMP-ATTACK-TEST-${Date.now()}`,
    });

    assert(acceptanceResult.success === true, 'Test 2.1: Quote acceptance processed successfully');

    // Fetch updated quote from DB
    const updatedQuote = await Finance.findById(quote._id);

    assert(
      updatedQuote.Status === 'Accepted',
      'Test 2.2: Quote status transitioned to Accepted'
    );
    assert(
      updatedQuote.acceptance.customerIdentity.email === verifiedEmail,
      'Test 2.3: Primary acceptance email remains strictly the verified customer email',
      `Actual email: ${updatedQuote.acceptance.customerIdentity.email}`
    );
    assert(
      updatedQuote.acceptance.customerIdentity.signerProvidedEmail === attackerEmail,
      'Test 2.4: Signer-provided untrusted email captured for forensics/audit only'
    );
    assert(
      updatedQuote.acceptance.customerIdentity.emailRedirectAttemptBlocked === true,
      'Test 2.5: emailRedirectAttemptBlocked flag set to true'
    );

    // Verify sink email delivery was sent to verified customer, NOT attacker
    const quoteSink = getStagingMailSink();
    const deliveredEmail = quoteSink.find(m => m.eventType === EMAIL_EVENTS.QUOTE_ACCEPTED);

    assert(
      deliveredEmail && (deliveredEmail.recipient || deliveredEmail.to) === verifiedEmail,
      'Test 2.6: Confirmation contract was delivered to verified customer, NOT attacker',
      `Delivered to: ${deliveredEmail ? (deliveredEmail.recipient || deliveredEmail.to) : 'undefined'}`
    );

    // -------------------------------------------------------------------------
    // TEST 3: Legitimate Customer Acceptance
    // -------------------------------------------------------------------------
    console.log('\n--- Section 3: Legitimate Acceptance Flow ---');

    const customer2 = await Customer.create({
      firstName: 'Sophie',
      lastName: 'Bakker',
      email: `sophie.${Date.now()}@universal-movers.nl`,
      contact: '020 9876543',
      customerIndex: Math.floor(Math.random() * 90000) + 10000,
    });
    createdCustomerIds.push(customer2._id);

    const quote2 = await Finance.create({
      Type: 'offer',
      index: `TEST-QUO-2026/${Math.floor(Math.random() * 9000) + 1000}`,
      customer: customer2._id,
      Status: 'Sent',
      total: 500,
      subTotal: 413.22,
      btw: '21',
      items: [
        { description: 'Transport service', price: 413.22, quantity: 1, btw: '21' },
      ],
      capabilityToken: crypto.randomBytes(32).toString('hex'),
      tokenExpiresAt: new Date(Date.now() + 86400000 * 14),
    });
    createdQuoteIds.push(quote2._id);

    clearStagingMailSink();

    const legitAcceptance = await executeAcceptance({
      quoteIdOrToken: quote2.capabilityToken,
      acceptancePayload: {
        name: 'Sophie Bakker',
        email: customer2.email,
        signature: 'SOPHIE_LEGAL_SIGNATURE',
        comments: 'Ready for the move!',
      },
      clientIp: '82.161.45.10',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      idempotencyKey: `IDEMP-LEGIT-TEST-${Date.now()}`,
    });

    assert(legitAcceptance.success === true, 'Test 3.1: Legitimate acceptance succeeds');

    const updatedQuote2 = await Finance.findById(quote2._id);
    assert(
      updatedQuote2.acceptance.customerIdentity.email === customer2.email,
      'Test 3.2: Customer email matches verified customer'
    );
    assert(
      updatedQuote2.acceptance.customerIdentity.emailRedirectAttemptBlocked === false,
      'Test 3.3: emailRedirectAttemptBlocked is false for legitimate customer'
    );

    const legitSink = getStagingMailSink();
    const legitDelivered = legitSink.find(m => m.eventType === EMAIL_EVENTS.QUOTE_ACCEPTED);
    assert(
      legitDelivered && (legitDelivered.recipient || legitDelivered.to) === customer2.email,
      'Test 3.4: Confirmation email delivered to legitimate customer email',
      `Delivered to: ${legitDelivered ? (legitDelivered.recipient || legitDelivered.to) : 'undefined'}`
    );

  } catch (err) {
    console.error('Error during test execution:', err);
    failedTests++;
  } finally {
    // Cleanup created test records
    console.log('\n--- Cleanup ---');
    if (createdQuoteIds.length > 0) {
      await Finance.deleteMany({ _id: { $in: createdQuoteIds } });
      console.log(`Cleaned up ${createdQuoteIds.length} test quotations.`);
    }
    if (createdCustomerIds.length > 0) {
      await Customer.deleteMany({ _id: { $in: createdCustomerIds } });
      console.log(`Cleaned up ${createdCustomerIds.length} test customers.`);
    }
    await mongoose.disconnect();
    console.log('MongoDB disconnected.\n');
  }

  console.log('======================================================');
  console.log(`TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('======================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runVerification();
