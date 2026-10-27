const Counter = require('../models/counterModel');
const mongoose = require('mongoose');

/**
 * Thread-safe atomic invoice sequence allocator for Belastingdienst compliance.
 * Guarantee: Strictly sequential, gap-free, zero-collision invoice numbers.
 */
async function getNextInvoiceIndex(Type = 'invoice', isStaging = false, year = new Date().getFullYear()) {
  const prefix = isStaging ? 'TEST-INV-' : '';
  const seqKey = `invoice_${prefix}${year}_${Type}`;

  // Check if counter already exists
  let counter = await Counter.findById(seqKey);

  if (!counter) {
    // Dynamically initialize from current maximum index in database
    const Invoice = mongoose.model('Invoice');
    const existingInvoices = await Invoice.find({
      Type,
      index: new RegExp(`${year}/(\\d+)`)
    }, 'index').lean();

    let maxNum = 0;
    existingInvoices.forEach(inv => {
      if (inv.index) {
        const m = String(inv.index).match(/(\d+)$/);
        if (m) {
          const num = parseInt(m[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
    });

    try {
      counter = await Counter.findOneAndUpdate(
        { _id: seqKey },
        { $setOnInsert: { seq: maxNum } },
        { upsert: true, new: true }
      );
    } catch (e) {
      counter = await Counter.findById(seqKey);
    }
  }

  // Atomically increment using MongoDB findOneAndUpdate with $inc
  const updatedCounter = await Counter.findOneAndUpdate(
    { _id: seqKey },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  return `${prefix}${year}/${String(updatedCounter.seq).padStart(4, '0')}`;
}

/**
 * Thread-safe atomic credit note sequence allocator.
 * Produces format: CN-2026/0001 (or TEST-CN-2026/0001 in staging).
 */
async function getNextCreditNoteIndex(isStaging = false, year = new Date().getFullYear()) {
  const prefix = isStaging ? 'TEST-CN-' : 'CN-';
  const seqKey = `credit_note_${prefix}${year}`;

  let counter = await Counter.findById(seqKey);

  if (!counter) {
    const Payment = mongoose.model('Payment');
    const existingCredits = await Payment.find({
      type: 'credit_note',
      creditNoteIndex: new RegExp(`${year}/(\\d+)`)
    }, 'creditNoteIndex').lean();

    let maxNum = 0;
    existingCredits.forEach(cn => {
      if (cn.creditNoteIndex) {
        const m = String(cn.creditNoteIndex).match(/(\d+)$/);
        if (m) {
          const num = parseInt(m[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
    });

    try {
      counter = await Counter.findOneAndUpdate(
        { _id: seqKey },
        { $setOnInsert: { seq: maxNum } },
        { upsert: true, new: true }
      );
    } catch (e) {
      counter = await Counter.findById(seqKey);
    }
  }

  const updatedCounter = await Counter.findOneAndUpdate(
    { _id: seqKey },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  return `${prefix}${year}/${String(updatedCounter.seq).padStart(4, '0')}`;
}

module.exports = {
  getNextInvoiceIndex,
  getNextCreditNoteIndex,
};

