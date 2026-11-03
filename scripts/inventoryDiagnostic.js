const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Customer = require('../models/customer');
const Invoice = require('../models/invoice');
const Finance = require('../models/finance');
const JobSchedule = require('../models/jobSchedule');
const Lead = require('../models/lead');
const Appointment = require('../models/appointmentModel');
const Address = require('../models/addressModel');
const DamageClaim = require('../models/damageClaimModel');
const LeaveRequest = require('../models/LeaveRequest');
const Payment = require('../models/PaymentRecordModel');

async function runDeepDiagnostic() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB Atlas. Performing Deep Data Integrity Audit...');

  const results = {
    counts: {},
    orphans: {},
    missingFields: {},
    baseline: null,
  };

  results.counts.customers = await Customer.countDocuments();
  results.counts.invoices = await Invoice.countDocuments();
  results.counts.finances = await Finance.countDocuments();
  results.counts.jobSchedules = await JobSchedule.countDocuments();
  results.counts.leads = await Lead.countDocuments();
  results.counts.appointments = await Appointment.countDocuments();
  results.counts.addresses = await Address.countDocuments();
  results.counts.damageClaims = await DamageClaim.countDocuments();
  results.counts.leaveRequests = await LeaveRequest.countDocuments();
  results.counts.payments = await Payment.countDocuments();

  console.log('\n=== LIVE RECORD COUNTS ===');
  for (const [k, v] of Object.entries(results.counts)) {
    console.log(`${k.padEnd(16)} : ${v}`);
  }

  // Check Baseline Invoice #2026/0025
  const baseInv = await Invoice.findOne({ index: '2026/0025' });
  if (baseInv) {
    results.baseline = {
      id: baseInv._id,
      index: baseInv.index,
      total: baseInv.total,
      subTotal: baseInv.subTotal,
      paid: baseInv.paid,
      Status: baseInv.Status,
      capabilityToken: baseInv.capabilityToken ? 'PRESENT' : 'MISSING',
    };
    console.log('\n=== STATUTORY BASELINE INVOICE #2026/0025 ===');
    console.log(JSON.stringify(results.baseline, null, 2));
  } else {
    console.error('\nERROR: Baseline Invoice #2026/0025 not found!');
  }

  // Check Invoices for orphan customer IDs
  const allInvoices = await Invoice.find();
  let orphanInvoices = 0;
  let missingCapabilityTokensInvoice = 0;
  for (const inv of allInvoices) {
    if (inv.customerId) {
      const exists = await Customer.exists({ _id: inv.customerId });
      if (!exists) orphanInvoices++;
    }
    if (!inv.capabilityToken) missingCapabilityTokensInvoice++;
  }
  results.orphans.invoicesWithoutCustomer = orphanInvoices;
  results.missingFields.invoicesMissingCapabilityToken = missingCapabilityTokensInvoice;

  // Check Quotes / Finances for orphan customer IDs and missing tokens
  const allFinances = await Finance.find();
  let orphanFinances = 0;
  let missingCapabilityTokensFinance = 0;
  for (const fin of allFinances) {
    if (fin.customerId) {
      const exists = await Customer.exists({ _id: fin.customerId });
      if (!exists) orphanFinances++;
    }
    if (!fin.capabilityToken) missingCapabilityTokensFinance++;
  }
  results.orphans.quotesWithoutCustomer = orphanFinances;
  results.missingFields.quotesMissingCapabilityToken = missingCapabilityTokensFinance;

  // Check Leads for missing default source or duplicateOf fields
  const allLeads = await Lead.find();
  let leadsMissingSource = 0;
  let leadsMissingInquiryCount = 0;
  for (const l of allLeads) {
    if (!l.source) leadsMissingSource++;
    if (l.inquiryCount === undefined || l.inquiryCount === null) leadsMissingInquiryCount++;
  }
  results.missingFields.leadsMissingSource = leadsMissingSource;
  results.missingFields.leadsMissingInquiryCount = leadsMissingInquiryCount;

  console.log('\n=== INTEGRITY & BACKWARD COMPATIBILITY FINDINGS ===');
  console.log('Orphan Invoices (Customer missing) :', results.orphans.invoicesWithoutCustomer);
  console.log('Orphan Quotes (Customer missing)   :', results.orphans.quotesWithoutCustomer);
  console.log('Invoices missing Capability Token  :', results.missingFields.invoicesMissingCapabilityToken);
  console.log('Quotes missing Capability Token    :', results.missingFields.quotesMissingCapabilityToken);
  console.log('Leads missing Source default       :', results.missingFields.leadsMissingSource);
  console.log('Leads missing InquiryCount default :', results.missingFields.leadsMissingInquiryCount);

  process.exit(0);
}

runDeepDiagnostic().catch(err => {
  console.error('Diagnostic error:', err);
  process.exit(1);
});
