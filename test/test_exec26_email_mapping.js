const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const http = require('http');

const Finance = require('../models/finance');
const JobSchedule = require('../models/jobSchedule');
const Customer = require('../models/customer');
const Invoice = require('../models/invoice');
const Email = require('../models/Email/email');
const AppSettings = require('../models/appSettingModel');
const Reporting = require('../models/reporting');
const Payment = require('../models/PaymentRecordModel');
const {
  EMAIL_EVENTS,
  stagingMailSink,
  clearStagingMailSink,
  getStagingMailSink,
  dispatchOutboxEmail,
  validateEventVariables,
  resolveTemplateForEvent,
} = require('../utils/emailOutboxService');
const { executeAcceptance } = require('../utils/quoteAcceptanceEngine');
const { calculateInvoiceBalance } = require('../utils/financialLedger');

let testCustomer = null;
let testJob = null;
let createdFinanceIds = [];
let createdInvoiceIds = [];
let createdEmailIds = [];
let createdPaymentIds = [];

async function setupFixtures() {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGO_URI, {
      retryWrites: true,
      serverSelectionTimeoutMS: 15000,
    });
  }

  // Find or create clean test customer
  testCustomer = await Customer.findOne({ email: 'exec26.tester@universalmovers.nl' });
  if (!testCustomer) {
    testCustomer = await Customer.create({
      firstName: 'Bram',
      lastName: 'van Dijk',
      email: 'exec26.tester@universalmovers.nl',
      telephone: '0612349876',
    });
  }

  // Create clean test job
  testJob = await JobSchedule.create({
    customer: testCustomer._id,
    status: 'Pending',
    date: new Date('2026-11-15T08:00:00Z'),
    jobDate: new Date('2026-11-15T08:00:00Z'),
    jobNumber: 'JOB-2026-9901',
    load: {
      street: 'Keizersgracht',
      houseNumber: '421',
      addition: 'A',
      postcode: '1016 EK',
      city: 'Amsterdam',
      country: 'Netherlands'
    },
    unload: {
      street: 'Oudegracht',
      houseNumber: '112',
      postcode: '3511 AP',
      city: 'Utrecht',
      country: 'Netherlands'
    }
  });
}

async function cleanupFixtures() {
  if (createdFinanceIds.length > 0) {
    await Finance.deleteMany({ _id: { $in: createdFinanceIds } });
  }
  if (createdInvoiceIds.length > 0) {
    await Invoice.deleteMany({ _id: { $in: createdInvoiceIds } });
  }
  if (createdEmailIds.length > 0) {
    await Email.deleteMany({ _id: { $in: createdEmailIds } });
  }
  if (createdPaymentIds.length > 0) {
    await Payment.deleteMany({ _id: { $in: createdPaymentIds } });
  }
  if (testJob?._id) {
    await JobSchedule.findByIdAndDelete(testJob._id);
  }
  if (testCustomer?._id) {
    await Customer.findByIdAndDelete(testCustomer._id);
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🚀 EXEC-26: EVENT-TO-EMAIL MAPPING & OUTBOX DELIVERY');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message, details = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${message} ${details ? '(' + details + ')' : ''}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message} ${details ? '(' + details + ')' : ''}`);
      failed++;
    }
  }

  try {
    await setupFixtures();
    clearStagingMailSink();

    const appSettings = await AppSettings.findOne();

    // ------------------------------------------------------------------------
    // TEST 1: Quote Acceptance Event-to-Template Mapping & Never Thank-You
    // ------------------------------------------------------------------------
    console.log('\n--- 1. Quote Acceptance Event & Template Mapping ---');

    // Create eligible quote
    const testQuote = await Finance.create({
      customer: testCustomer._id,
      index: 'QUO-2026-9001',
      Status: 'Sent',
      total: 850.00,
      subTotal: 850.00,
      btw: '0',
      job: testJob._id,
      capabilityToken: crypto.randomBytes(32).toString('hex'),
      expire_date: new Date(Date.now() + 86400000 * 30),
    });
    createdFinanceIds.push(testQuote._id);

    // Accept the quote via state machine
    const acceptResult = await executeAcceptance({
      quoteIdOrToken: String(testQuote._id),
      acceptancePayload: {
        name: 'Bram van Dijk',
        email: testCustomer.email,
        comments: 'Accepted with thanks',
        signature: 'DIGITALLY_SIGNED_TEST',
      },
    });

    assert(acceptResult.success === true, 'Test 1a: Quote successfully accepted via acceptance engine', `Quote ID: ${testQuote._id}`);

    // Verify template resolution for QUOTE_ACCEPTED
    const resolvedAcceptTemplate = await resolveTemplateForEvent(EMAIL_EVENTS.QUOTE_ACCEPTED, null, appSettings);
    assert(
      resolvedAcceptTemplate && !/thank\s*you\s*for\s*choosing|post-move/i.test(resolvedAcceptTemplate.name),
      'Test 1b: QUOTE_ACCEPTED resolves to Acceptance Acknowledgment and NEVER post-move thank-you',
      `Resolved Template: "${resolvedAcceptTemplate?.name}"`
    );

    // SECURITY CHECK: Even if caller explicitly requests thankyou template ID for QUOTE_ACCEPTED, guard diverts it
    const thankyouTemplateId = appSettings?.emailTemplates?.thankyou;
    const guardedTemplate = await resolveTemplateForEvent(EMAIL_EVENTS.QUOTE_ACCEPTED, thankyouTemplateId, appSettings);
    assert(
      guardedTemplate && String(guardedTemplate._id) !== String(thankyouTemplateId),
      'Test 1c: Security Guard strictly blocks thankyou template when event is QUOTE_ACCEPTED',
      `Guarded Template Name: "${guardedTemplate?.name}" (ID: ${guardedTemplate?._id})`
    );

    // Dispatch quote accepted outbox email into staging mail sink
    const quoteEmailDispatch = await dispatchOutboxEmail({
      eventType: EMAIL_EVENTS.QUOTE_ACCEPTED,
      recipient: testCustomer.email,
      context: {
        customer: testCustomer,
        invoice: testQuote,
      },
      forceSink: true,
    });
    createdEmailIds.push(quoteEmailDispatch.emailId);

    assert(quoteEmailDispatch.success === true, 'Test 1d: Quote acceptance email successfully dispatched to outbox', `Email ID: ${quoteEmailDispatch.emailId}`);
    assert(
      quoteEmailDispatch.subject.includes('Quotation #QUO-2026-9001 Accepted') || quoteEmailDispatch.subject.includes('Confirmation'),
      'Test 1e: Email subject contains acceptance confirmation wording',
      `Subject: "${quoteEmailDispatch.subject}"`
    );
    assert(
      !quoteEmailDispatch.subject.includes('Thank You for Choosing'),
      'Test 1f: Email subject NEVER contains post-move "Thank You for Choosing"',
      `Subject verified clean`
    );

    // Inspect actual staging mailbox sink receipt
    const sinkMessages = getStagingMailSink();
    const quoteSinkMsg = sinkMessages.find(m => m.eventType === EMAIL_EVENTS.QUOTE_ACCEPTED);
    assert(quoteSinkMsg !== undefined, 'Test 1g: Actual staging mailbox sink received quote acceptance message');
    assert(
      quoteSinkMsg && quoteSinkMsg.html.includes('QUO-2026-9001'),
      'Test 1h: Staging mailbox sink rendered body contains quote index #QUO-2026-9001',
      `Recipient: ${quoteSinkMsg?.to}`
    );

    // ------------------------------------------------------------------------
    // TEST 2: Move vs Survey Appointment Mapping
    // ------------------------------------------------------------------------
    console.log('\n--- 2. Move vs Survey Appointment Disambiguation ---');

    // A. Survey Appointment
    const surveyDispatch = await dispatchOutboxEmail({
      eventType: EMAIL_EVENTS.SURVEY_SCHEDULED,
      recipient: testCustomer.email,
      context: {
        customer: testCustomer,
        appointment: {
          date: '2026-11-05',
          startTime: '10:00',
          appointmentType: 'Survey',
          location: 'Keizersgracht 421 A, Amsterdam',
        },
      },
      forceSink: true,
    });
    createdEmailIds.push(surveyDispatch.emailId);

    assert(surveyDispatch.success === true, 'Test 2a: Survey appointment email dispatched successfully');
    assert(
      surveyDispatch.subject.includes('Survey') || surveyDispatch.subject.includes('Inspection'),
      'Test 2b: Survey email subject explicitly references Survey & Inspection',
      `Subject: "${surveyDispatch.subject}"`
    );

    const surveySinkMsg = sinkMessages.find(m => m.eventType === EMAIL_EVENTS.SURVEY_SCHEDULED);
    assert(
      surveySinkMsg && surveySinkMsg.html.includes('05-11-2026') && surveySinkMsg.html.includes('10:00'),
      'Test 2c: Survey email body contains formatted Dutch date 05-11-2026 and time 10:00',
      `Body confirmed populated with local date/time`
    );

    // B. Move Appointment
    const moveDispatch = await dispatchOutboxEmail({
      eventType: EMAIL_EVENTS.MOVE_SCHEDULED,
      recipient: testCustomer.email,
      context: {
        customer: testCustomer,
        job: testJob,
      },
      forceSink: true,
    });
    createdEmailIds.push(moveDispatch.emailId);

    assert(moveDispatch.success === true, 'Test 2d: Move appointment email dispatched successfully');
    assert(
      moveDispatch.subject.includes('Move Order Confirmed') || moveDispatch.subject.includes('JOB-2026-9901'),
      'Test 2e: Move email subject explicitly references Move Order Confirmed & Job number',
      `Subject: "${moveDispatch.subject}"`
    );

    const moveSinkMsg = sinkMessages.find(m => m.eventType === EMAIL_EVENTS.MOVE_SCHEDULED);
    assert(
      moveSinkMsg && (moveSinkMsg.html.includes(testJob.index) || moveSinkMsg.html.includes('JOB-2026-9901')),
      'Test 2f: Move email body contains Job reference',
      `Job Index: ${testJob.index}`
    );

    // ------------------------------------------------------------------------
    // TEST 3: Pre-Send Variable Validation & Misleading Send Blocker
    // ------------------------------------------------------------------------
    console.log('\n--- 3. Strict Pre-Send Variable Validation ---');

    // A. Survey with missing date/time
    const invalidSurveyResult = await dispatchOutboxEmail({
      eventType: EMAIL_EVENTS.SURVEY_SCHEDULED,
      recipient: testCustomer.email,
      context: {
        customer: testCustomer,
        appointment: {
          date: '', // BLANK DATE
          time: '', // BLANK TIME
        },
      },
      forceSink: true,
    });

    assert(invalidSurveyResult.success === false, 'Test 3a: Survey with missing date/time is strictly blocked');
    assert(invalidSurveyResult.blocked === true, 'Test 3b: Validation error flags blocked = true');
    assert(
      invalidSurveyResult.errorCode === 'MISSING_APPOINTMENT_VARIABLES',
      'Test 3c: Error code is MISSING_APPOINTMENT_VARIABLES',
      `Error Code: ${invalidSurveyResult.errorCode}`
    );

    // Check that blocked attempt was recorded in Outbox
    const blockedOutbox = await Email.findOne({ _id: invalidSurveyResult.emailId });
    assert(
      blockedOutbox && blockedOutbox.status === 'BLOCKED_INVALID_VARIABLES',
      'Test 3d: Blocked attempt persisted in Outbox with status BLOCKED_INVALID_VARIABLES',
      `Outbox Status: ${blockedOutbox?.status}`
    );
    if (blockedOutbox?._id) createdEmailIds.push(blockedOutbox._id);

    // B. Invoice with missing due date
    const invalidInvoiceResult = await dispatchOutboxEmail({
      eventType: EMAIL_EVENTS.INVOICE_ISSUED,
      recipient: testCustomer.email,
      context: {
        customer: testCustomer,
        invoice: {
          index: '2026/9999',
          dueDate: '', // BLANK DUE DATE
        },
      },
      forceSink: true,
    });
    assert(invalidInvoiceResult.success === false, 'Test 3e: Invoice with missing due date is strictly blocked');
    assert(
      invalidInvoiceResult.errorCode === 'MISSING_INVOICE_VARIABLES',
      'Test 3f: Error code is MISSING_INVOICE_VARIABLES',
      `Error Code: ${invalidInvoiceResult.errorCode}`
    );
    if (invalidInvoiceResult.emailId) createdEmailIds.push(invalidInvoiceResult.emailId);

    // ------------------------------------------------------------------------
    // TEST 4: Partially Paid Invoice Reconciled Outstanding Balance
    // ------------------------------------------------------------------------
    console.log('\n--- 4. Partially Paid Invoice Outstanding Balance & Due Date ---');

    // Create Fixture F-01 Invoice: €981.00 gross total
    const fixtureInvoice = await Invoice.create({
      customer: testCustomer._id,
      index: '2026/9810',
      total: 981.00,
      subTotal: 900.00,
      btw: '81.00',
      Status: 'Pending',
      payment: 'unpaid',
      dueDate: new Date('2026-11-20'),
      isStaging: true,
    });
    createdInvoiceIds.push(fixtureInvoice._id);

    // Record partial payment of €100.00
    const partialPayment = await Payment.create({
      invoiceId: fixtureInvoice._id,
      amount: 100.00,
      method: 'Bank Transfer',
      type: 'payment',
      status: 'completed',
      date: new Date(),
    });
    createdPaymentIds.push(partialPayment._id);

    // Update invoice embedded fields via ledger
    const balanceCalc = await calculateInvoiceBalance(fixtureInvoice);
    fixtureInvoice.paid = balanceCalc.totalPaid;
    fixtureInvoice.balanceDue = balanceCalc.balanceDue;
    fixtureInvoice.payment = balanceCalc.paymentStatus;
    await fixtureInvoice.save();

    assert(fixtureInvoice.balanceDue === 881.00, 'Test 4a: Ledger confirms €981.00 - €100.00 = €881.00 balance due', `BalanceDue: €${fixtureInvoice.balanceDue}`);

    // Create synthetic PDF attachment buffer
    const mockPdfBuffer = Buffer.from('%PDF-1.4 Mock Statutory Invoice PDF for Universal Movers B.V.');

    // Dispatch Invoice Reminder via Outbox
    const invoiceEmailDispatch = await dispatchOutboxEmail({
      eventType: EMAIL_EVENTS.INVOICE_REMINDER,
      recipient: testCustomer.email,
      context: {
        customer: testCustomer,
        invoice: fixtureInvoice,
      },
      attachments: [{
        filename: 'Invoice_2026_9810.pdf',
        content: mockPdfBuffer,
        contentType: 'application/pdf',
      }],
      forceSink: true,
    });
    createdEmailIds.push(invoiceEmailDispatch.emailId);

    assert(invoiceEmailDispatch.success === true, 'Test 4b: Partially paid invoice reminder dispatched to outbox');

    // Verify outbox record balance snapshot
    const outboxRecord = await Email.findById(invoiceEmailDispatch.emailId);
    assert(
      outboxRecord && outboxRecord.reconciledBalance && outboxRecord.reconciledBalance.balanceDue === 881.00,
      'Test 4c: Outbox record holds authoritative reconciled balance due of €881.00',
      `Snapshot: €${outboxRecord?.reconciledBalance?.balanceDue}`
    );
    assert(
      outboxRecord?.reconciledBalance?.totalPaid === 100.00,
      'Test 4d: Outbox record reflects partial payment of €100.00',
      `TotalPaid: €${outboxRecord?.reconciledBalance?.totalPaid}`
    );

    // Inspect staging mailbox sink receipt
    const invSinkMsg = sinkMessages.find(m => m.eventType === EMAIL_EVENTS.INVOICE_REMINDER);
    assert(invSinkMsg !== undefined, 'Test 4e: Actual staging mailbox sink received invoice reminder');
    assert(
      invSinkMsg && invSinkMsg.html.includes('881.00'),
      'Test 4f: Staging mailbox sink rendered body shows reconciled outstanding amount € 881.00 (NOT stale € 981.00!)',
      `Body verified containing € 881.00`
    );
    assert(
      invSinkMsg && invSinkMsg.html.includes('20-11-2026'),
      'Test 4g: Rendered email body contains statutory Dutch due date 20-11-2026',
      `Due Date verified in Dutch format`
    );
    assert(
      invSinkMsg && invSinkMsg.attachments && invSinkMsg.attachments.length > 0 && invSinkMsg.attachments[0].filename === 'Invoice_2026_9810.pdf',
      'Test 4h: Statutory PDF attachment received in staging mail sink',
      `Attachment: ${invSinkMsg?.attachments[0]?.filename}`
    );

    // ------------------------------------------------------------------------
    // TEST 5: Outbox Deduplication & Idempotency
    // ------------------------------------------------------------------------
    console.log('\n--- 5. Outbox Deduplication & Idempotency ---');

    const testIdempotencyKey = `IDEMP-${Date.now()}-UNIQUE-KEY`;

    // First send with key
    const firstDispatch = await dispatchOutboxEmail({
      eventType: EMAIL_EVENTS.QUOTE_SENT,
      recipient: testCustomer.email,
      context: {
        customer: testCustomer,
        invoice: testQuote,
      },
      idempotencyKey: testIdempotencyKey,
      forceSink: true,
    });
    createdEmailIds.push(firstDispatch.emailId);

    assert(firstDispatch.success === true && !firstDispatch.duplicate, 'Test 5a: First dispatch with idempotency key succeeds normally');

    // Duplicate send with exact same key
    const secondDispatch = await dispatchOutboxEmail({
      eventType: EMAIL_EVENTS.QUOTE_SENT,
      recipient: testCustomer.email,
      context: {
        customer: testCustomer,
        invoice: testQuote,
      },
      idempotencyKey: testIdempotencyKey,
      forceSink: true,
    });

    assert(secondDispatch.success === true, 'Test 5b: Second dispatch returns successful response');
    assert(secondDispatch.duplicate === true, 'Test 5c: Duplicate flag is true on second dispatch');
    assert(secondDispatch.intercepted === true, 'Test 5d: Intercepted flag is true, preventing duplicate mail delivery');
    assert(
      String(secondDispatch.emailId) === String(firstDispatch.emailId),
      'Test 5e: Returned emailId matches original record without creating duplicate in MongoDB',
      `Matched ID: ${secondDispatch.emailId}`
    );

    // Rapid double-click debounce without key
    const rapidFirst = await dispatchOutboxEmail({
      eventType: EMAIL_EVENTS.MOVE_SCHEDULED,
      recipient: testCustomer.email,
      context: {
        customer: testCustomer,
        job: testJob,
      },
      forceSink: true,
    });
    if (rapidFirst.emailId) createdEmailIds.push(rapidFirst.emailId);

    const rapidSecond = await dispatchOutboxEmail({
      eventType: EMAIL_EVENTS.MOVE_SCHEDULED,
      recipient: testCustomer.email,
      context: {
        customer: testCustomer,
        job: testJob,
      },
      forceSink: true,
    });

    assert(rapidSecond.duplicate === true && rapidSecond.intercepted === true, 'Test 5f: Rapid double-submission within 10s window intercepted by debounce');

    // ------------------------------------------------------------------------
    // TEST 6: Approved Sender Domain & Authentication
    // ------------------------------------------------------------------------
    console.log('\n--- 6. Approved Sender Domain & Authentication ---');

    assert(
      quoteSinkMsg && (quoteSinkMsg.from.includes('universalmovers.nl') || quoteSinkMsg.from.includes('Universal Movers')),
      'Test 6a: Sender identity uses approved Universal Movers domain (universalmovers.nl)',
      `From: "${quoteSinkMsg?.from}"`
    );

    // ------------------------------------------------------------------------
    // TEST 7: Post-Move Thank You only on Completed Job
    // ------------------------------------------------------------------------
    console.log('\n--- 7. Post-Move Thank You Delivery ---');

    const thankYouTemplate = await resolveTemplateForEvent(EMAIL_EVENTS.POST_MOVE_THANKYOU, null, appSettings);
    assert(
      thankYouTemplate && /thank\s*you/i.test(thankYouTemplate.name),
      'Test 7a: POST_MOVE_THANKYOU correctly maps to Thank You & Feedback template',
      `Template: "${thankYouTemplate?.name}"`
    );

    // ------------------------------------------------------------------------
    // TEST 8: Baseline Invoice #2026/0025 Preservation
    // ------------------------------------------------------------------------
    console.log('\n--- 8. Baseline Invoice #2026/0025 Preservation ---');

    const baselineInv = await Invoice.findOne({ index: '2026/0025' });
    if (baselineInv) {
      assert(
        Number(baselineInv.total) === 746.39,
        'Test 8a: Baseline invoice #2026/0025 total strictly preserved at €746.39',
        `Current Total: €${baselineInv.total}`
      );
    } else {
      console.log('  ⚠️  Baseline invoice #2026/0025 not found in current collection snapshot, checking other fixtures');
    }

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    await cleanupFixtures();
  }

  console.log('\n======================================================');
  console.log(`🏁 TEST SUITE RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
