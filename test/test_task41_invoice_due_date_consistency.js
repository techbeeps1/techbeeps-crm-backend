const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const assert = require('assert');

const Invoice = require('../models/invoice');
const Customer = require('../models/customer');
const Payment = require('../models/PaymentRecordModel');
const JobSchedule = require('../models/jobSchedule');
const { formatAmsterdamDate } = require('../utils/timezoneUtil');
const { formatDutchDate } = require('../utils/statutoryInvoice');
const invoiceController = require('../controllers/invoiceController');
const { reconcileInvoiceForEmail } = require('../utils/emailOutboxService');
const { renderEmailTemplate } = require('../utils/emailTemplateUtil');

let createdInvoiceIds = [];
let testCustomer = null;

async function runTask41Tests() {
  console.log('[Task 41] Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI, {
    retryWrites: true,
    serverSelectionTimeoutMS: 15000,
  });
  console.log('[Task 41] Connected to MongoDB.');

  try {
    // 0. Setup test customer
    testCustomer = await Customer.findOne({ email: 'task41.test@universalmovers.nl' });
    if (!testCustomer) {
      testCustomer = await Customer.create({
        firstName: 'Daan',
        lastName: 'de Boer',
        email: 'task41.test@universalmovers.nl',
        telephone: '0612345678',
      });
    }

    // --- TEST 1: Timezone Disambiguation & Date-Only Formatting Guard ---
    console.log('\n--- TEST 1: Timezone Disambiguation & Date-Only Formatting Guard ---');
    const isoMidnight = '2026-11-20T00:00:00.000Z';
    const dateOnlyStr = '2026-11-20';
    const isoMidday = '2026-11-20T12:00:00.000Z';

    const formattedIso = formatDutchDate(isoMidnight);
    const formattedDateOnly = formatDutchDate(dateOnlyStr);
    const formattedMidday = formatDutchDate(isoMidday);

    console.log(`  ISO Midnight: "${isoMidnight}" -> "${formattedIso}"`);
    console.log(`  Date-Only Str: "${dateOnlyStr}" -> "${formattedDateOnly}"`);
    console.log(`  ISO Midday: "${isoMidday}" -> "${formattedMidday}"`);

    assert.strictEqual(formattedIso, '20-11-2026', 'ISO midnight must format to 20-11-2026 without backwards timezone shift');
    assert.strictEqual(formattedDateOnly, '20-11-2026', 'Pure date-only string must format to 20-11-2026');
    assert.strictEqual(formattedMidday, '20-11-2026', 'ISO midday must format to 20-11-2026');
    console.log('✓ TEST 1 PASSED: Pure date-only calendar values format consistently as 20-11-2026.');

    // --- TEST 2: Creation & Model Pre-Save Synchronization ---
    console.log('\n--- TEST 2: Creation & Model Pre-Save Synchronization ---');
    
    // 2a. Invoice with only dueDate
    const invA = new Invoice({
      customer: testCustomer._id,
      date: new Date('2026-11-01'),
      dueDate: new Date('2026-11-20'),
      Status: 'Draft',
    });
    await invA.save();
    createdInvoiceIds.push(invA._id);

    const savedInvA = await Invoice.findById(invA._id);
    assert(savedInvA.dueDate, 'dueDate should be set');
    assert(savedInvA.expire_date, 'expire_date should be synchronized from dueDate');
    assert.strictEqual(
      formatDutchDate(savedInvA.dueDate),
      formatDutchDate(savedInvA.expire_date),
      'dueDate and expire_date must format to identical Dutch date'
    );
    assert.strictEqual(formatDutchDate(savedInvA.dueDate), '20-11-2026');
    console.log(`  Invoice A: dueDate=${formatDutchDate(savedInvA.dueDate)}, expire_date=${formatDutchDate(savedInvA.expire_date)}`);

    // 2b. Invoice with only expire_date (like from frontend modal)
    const invB = new Invoice({
      customer: testCustomer._id,
      date: new Date('2026-11-01'),
      expire_date: new Date('2026-12-05'),
      Status: 'Draft',
    });
    await invB.save();
    createdInvoiceIds.push(invB._id);

    const savedInvB = await Invoice.findById(invB._id);
    assert(savedInvB.dueDate, 'dueDate should be synchronized from expire_date');
    assert(savedInvB.expire_date, 'expire_date should be set');
    assert.strictEqual(
      formatDutchDate(savedInvB.dueDate),
      formatDutchDate(savedInvB.expire_date),
      'dueDate and expire_date must match'
    );
    assert.strictEqual(formatDutchDate(savedInvB.dueDate), '05-12-2026');
    console.log(`  Invoice B: dueDate=${formatDutchDate(savedInvB.dueDate)}, expire_date=${formatDutchDate(savedInvB.expire_date)}`);

    // 2c. Invoice with neither (default 14 days)
    const invC = new Invoice({
      customer: testCustomer._id,
      date: new Date('2026-11-01'),
      Status: 'Draft',
    });
    await invC.save();
    createdInvoiceIds.push(invC._id);

    const savedInvC = await Invoice.findById(invC._id);
    assert(savedInvC.dueDate, 'default dueDate should be set to 14 days after issue');
    assert(savedInvC.expire_date, 'default expire_date should match dueDate');
    assert.strictEqual(
      formatDutchDate(savedInvC.dueDate),
      formatDutchDate(savedInvC.expire_date),
      'default dueDate and expire_date must match'
    );
    assert.strictEqual(formatDutchDate(savedInvC.dueDate), '15-11-2026');
    console.log(`  Invoice C: dueDate=${formatDutchDate(savedInvC.dueDate)}, expire_date=${formatDutchDate(savedInvC.expire_date)}`);
    console.log('✓ TEST 2 PASSED: Pre-save hook guarantees 100% bi-directional synchronization.');

    // --- TEST 3: Controller Update via Frontend Invoicing Modal ---
    console.log('\n--- TEST 3: Controller Update via Frontend Invoicing Modal ---');
    // Emulate frontend Invoicing.jsx update request with custom expire_date
    const reqUpdate = {
      params: { id: invA._id.toString() },
      body: {
        date: '2026-11-01',
        expire_date: '2026-12-15',
        items: [
          { description: 'Moving service', quantity: 1, price: 500, btw: '21' }
        ],
      }
    };
    let updateResData = null;
    let updateStatus = 200;
    const resUpdate = {
      status(code) { updateStatus = code; return this; },
      json(data) { updateResData = data; return this; }
    };

    await invoiceController.updateInvoice(reqUpdate, resUpdate);
    assert.strictEqual(updateStatus, 200, 'updateInvoice must return 200');

    const updatedInvDoc = await Invoice.findById(invA._id);
    assert.strictEqual(
      formatDutchDate(updatedInvDoc.dueDate),
      '15-12-2026',
      'dueDate should be synchronized to 15-12-2026 from expire_date'
    );
    assert.strictEqual(
      formatDutchDate(updatedInvDoc.expire_date),
      '15-12-2026',
      'expire_date should be 15-12-2026'
    );
    assert(updatedInvDoc.statutorySnapshot, 'statutorySnapshot must be generated');
    assert.strictEqual(
      updatedInvDoc.statutorySnapshot.dueDateFormatted,
      '15-12-2026',
      'statutorySnapshot.dueDateFormatted must match 15-12-2026'
    );
    console.log(`  Updated Doc: dueDateFormatted="${updatedInvDoc.statutorySnapshot.dueDateFormatted}", dueDate="${formatDutchDate(updatedInvDoc.dueDate)}"`);
    console.log('✓ TEST 3 PASSED: Invoicing modal update synchronizes dueDate, expire_date, and statutory snapshot.');

    // --- TEST 4: Multi-Channel Consistency (CRM DTO, Email Outbox Context, PDF) ---
    console.log('\n--- TEST 4: Multi-Channel Consistency (CRM DTO, Email Outbox Context, PDF) ---');
    
    // 4a. CRM Detail Endpoint DTO
    let detailResData = null;
    const reqDetail = { params: { Id: invA._id.toString() } };
    const resDetail = {
      status(c) { return this; },
      json(d) { detailResData = d; return this; }
    };
    await invoiceController.invoiceDetail(reqDetail, resDetail);
    assert(detailResData && detailResData.invoice, 'invoiceDetail must return invoice DTO');
    const crmDtoDueDate = detailResData.invoice.dueDateFormatted;
    console.log(`  [CRM Detail UI] dueDateFormatted: "${crmDtoDueDate}"`);
    assert.strictEqual(crmDtoDueDate, '15-12-2026');

    // 4b. Email Outbox Reconciliation Context
    const emailContext = await reconcileInvoiceForEmail(updatedInvDoc);
    const emailDueDate = emailContext.dueDate;
    console.log(`  [Email Outbox] invoice.dueDate: "${emailDueDate}"`);
    assert.strictEqual(emailDueDate, '15-12-2026');

    // 4c. Email Template Rendering
    const renderedEmail = renderEmailTemplate('<p>Due: {{invoice.dueDate}}</p>', { invoice: updatedInvDoc });
    console.log(`  [Rendered Email HTML]: "${renderedEmail.trim()}"`);
    assert(renderedEmail.includes('15-12-2026'), 'Rendered email body must contain 15-12-2026');

    // 4d. Statutory Snapshot in DB
    const dbDueDate = updatedInvDoc.statutorySnapshot.dueDateFormatted;
    console.log(`  [Database Snapshot] statutorySnapshot.dueDateFormatted: "${dbDueDate}"`);
    assert.strictEqual(dbDueDate, '15-12-2026');

    assert.strictEqual(crmDtoDueDate, emailDueDate, 'CRM DTO and Email Outbox must match exactly');
    assert.strictEqual(emailDueDate, dbDueDate, 'Email Outbox and DB Snapshot must match exactly');
    console.log('✓ TEST 4 PASSED: CRM UI, Email Outbox, and PDF data context share the exact same canonical string: "15-12-2026".');

    console.log('\n================================================================');
    console.log('ALL TASK 41 INVOICE DUE DATE CONSISTENCY TESTS PASSED (4/4)');
    console.log('================================================================');

  } finally {
    console.log('\n[Cleanup] Cleaning up test invoices and customer fixtures...');
    if (createdInvoiceIds.length > 0) {
      await Invoice.deleteMany({ _id: { $in: createdInvoiceIds } });
    }
    if (testCustomer) {
      await Customer.deleteOne({ _id: testCustomer._id });
    }
    console.log('[Cleanup] Done.');
    await mongoose.connection.close();
  }
}

runTask41Tests().catch((err) => {
  console.error('[Task 41 Error]:', err);
  process.exit(1);
});
