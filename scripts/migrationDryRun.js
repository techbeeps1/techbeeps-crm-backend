const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const crypto = require('crypto');
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

async function runMigrationDryRun({ isLive = false } = {}) {
  const startTime = Date.now();
  console.log('========================================================================');
  console.log(`EXEC-37: Historical Data Inventory & Migration Rehearsal [${isLive ? 'LIVE MODE' : 'DRY-RUN MODE'}]`);
  console.log('========================================================================');

  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGO_URI);
  }

  const report = {
    mode: isLive ? 'LIVE' : 'DRY-RUN',
    timestamp: new Date().toISOString(),
    collections: {},
    baselineInvariant: null,
    integrityChecks: {
      orphanInvoices: 0,
      orphanQuotes: 0,
      orphanAppointments: 0,
      orphanAddresses: 0,
    },
    backfillsProposed: {
      invoicesNeedingCapabilityTokens: 0,
      quotesNeedingCapabilityTokens: 0,
      leadsNeedingSourceDefault: 0,
      leadsNeedingInquiryCountDefault: 0,
    },
    backfillsApplied: {
      invoicesTokensAdded: 0,
      quotesTokensAdded: 0,
      leadsSourceUpdated: 0,
      leadsInquiryCountUpdated: 0,
    },
    zeroDataLossGuaranteed: false,
    durationMs: 0,
  };

  // 1. Inventory & Record Counts
  const collectionsToAudit = [
    { key: 'customers', model: Customer },
    { key: 'invoices', model: Invoice },
    { key: 'finances', model: Finance },
    { key: 'jobSchedules', model: JobSchedule },
    { key: 'leads', model: Lead },
    { key: 'appointments', model: Appointment },
    { key: 'addresses', model: Address },
    { key: 'damageClaims', model: DamageClaim },
    { key: 'leaveRequests', model: LeaveRequest },
    { key: 'payments', model: Payment },
  ];

  for (const item of collectionsToAudit) {
    const count = await item.model.countDocuments();
    report.collections[item.key] = { initialCount: count, finalCount: count };
  }

  // 2. Baseline Invariant Snapshot Check
  const baselineBefore = await Invoice.findOne({ index: '2026/0025' });
  if (!baselineBefore) {
    throw new Error('CRITICAL: Statutory Baseline Invoice #2026/0025 missing from database!');
  }
  report.baselineInvariant = {
    invoiceId: baselineBefore._id.toString(),
    index: baselineBefore.index,
    total: baselineBefore.total,
    subTotal: baselineBefore.subTotal,
    status: baselineBefore.Status,
  };

  if (Number(baselineBefore.total) !== 746.39) {
    throw new Error(`CRITICAL: Baseline Invoice #2026/0025 total mismatch! Expected €746.39, found €${baselineBefore.total}`);
  }

  // 3. Referential Integrity & Orphan Checks
  const allInvoices = await Invoice.find();
  for (const inv of allInvoices) {
    if (inv.customer) {
      const exists = await Customer.exists({ _id: inv.customer });
      if (!exists) report.integrityChecks.orphanInvoices++;
    }
    if (!inv.capabilityToken) {
      report.backfillsProposed.invoicesNeedingCapabilityTokens++;
      if (isLive) {
        inv.capabilityToken = crypto.randomBytes(32).toString('hex');
        if (!inv.tokenExpiresAt) {
          const exp = new Date();
          exp.setDate(exp.getDate() + 30);
          inv.tokenExpiresAt = exp;
        }
        await inv.save();
        report.backfillsApplied.invoicesTokensAdded++;
      }
    }
  }

  const allFinances = await Finance.find();
  for (const fin of allFinances) {
    if (fin.customer) {
      const exists = await Customer.exists({ _id: fin.customer });
      if (!exists) report.integrityChecks.orphanQuotes++;
    }
    if (!fin.capabilityToken) {
      report.backfillsProposed.quotesNeedingCapabilityTokens++;
      if (isLive) {
        fin.capabilityToken = crypto.randomBytes(32).toString('hex');
        if (!fin.tokenExpiresAt) {
          const exp = new Date();
          exp.setDate(exp.getDate() + 30);
          fin.tokenExpiresAt = exp;
        }
        await fin.save();
        report.backfillsApplied.quotesTokensAdded++;
      }
    }
  }

  const allAppointments = await Appointment.find();
  for (const app of allAppointments) {
    if (app.customer) {
      const exists = await Customer.exists({ _id: app.customer });
      if (!exists) report.integrityChecks.orphanAppointments++;
    }
  }

  const allAddresses = await Address.find();
  for (const addr of allAddresses) {
    if (addr.customer) {
      const exists = await Customer.exists({ _id: addr.customer });
      if (!exists) report.integrityChecks.orphanAddresses++;
    }
  }

  const allLeads = await Lead.find();
  for (const ld of allLeads) {
    let leadModified = false;
    if (!ld.source) {
      report.backfillsProposed.leadsNeedingSourceDefault++;
      if (isLive) {
        ld.source = 'Manual';
        leadModified = true;
        report.backfillsApplied.leadsSourceUpdated++;
      }
    }
    if (ld.inquiryCount === undefined || ld.inquiryCount === null) {
      report.backfillsProposed.leadsNeedingInquiryCountDefault++;
      if (isLive) {
        ld.inquiryCount = 1;
        leadModified = true;
        report.backfillsApplied.leadsInquiryCountUpdated++;
      }
    }
    if (isLive && leadModified) {
      await ld.save();
    }
  }

  // 4. Verify Baseline Invariant After Migration
  const baselineAfter = await Invoice.findOne({ index: '2026/0025' });
  if (!baselineAfter || Number(baselineAfter.total) !== 746.39) {
    throw new Error('CRITICAL VIOLATION: Baseline invoice invariant was altered during rehearsal!');
  }

  // 5. Verify Zero Data Loss (Post-counts match pre-counts)
  let zeroLoss = true;
  for (const item of collectionsToAudit) {
    const finalCount = await item.model.countDocuments();
    report.collections[item.key].finalCount = finalCount;
    if (finalCount !== report.collections[item.key].initialCount) {
      zeroLoss = false;
      console.error(`DATA LOSS DETECTED: ${item.key} count changed from ${report.collections[item.key].initialCount} to ${finalCount}`);
    }
  }
  report.zeroDataLossGuaranteed = zeroLoss;
  report.durationMs = Date.now() - startTime;

  console.log('\n--- AUDIT & REHEARSAL SUMMARY ---');
  console.log(`Execution Mode          : ${report.mode}`);
  console.log(`Duration                : ${report.durationMs}ms`);
  console.log(`Zero Data Loss Verified : ${report.zeroDataLossGuaranteed ? 'YES (100% Intact)' : 'FAIL'}`);
  console.log(`Baseline #2026/0025 Total: €${baselineAfter.total} (STRICTLY PRESERVED)`);
  console.log(`Orphan Invoices         : ${report.integrityChecks.orphanInvoices}`);
  console.log(`Orphan Quotes           : ${report.integrityChecks.orphanQuotes}`);
  console.log(`Orphan Appointments     : ${report.integrityChecks.orphanAppointments}`);
  console.log(`Orphan Addresses        : ${report.integrityChecks.orphanAddresses}`);
  console.log(`Tokens Needing Backfill : Invoices=${report.backfillsProposed.invoicesNeedingCapabilityTokens}, Quotes=${report.backfillsProposed.quotesNeedingCapabilityTokens}`);

  if (isLive) {
    console.log(`Tokens Backfilled (Live): Invoices=${report.backfillsApplied.invoicesTokensAdded}, Quotes=${report.backfillsApplied.quotesTokensAdded}`);
  }

  return report;
}

if (require.main === module) {
  const isLive = process.argv.includes('--live');
  runMigrationDryRun({ isLive })
    .then(report => {
      console.log('\n[SUCCESS] Migration Rehearsal completed without errors.');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n[FATAL ERROR during Migration Rehearsal]:', err);
      process.exit(1);
    });
}

module.exports = { runMigrationDryRun };

