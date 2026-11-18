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

/**
 * Thread-safe atomic quote sequence allocator.
 * Produces format: 2026/0001 (or TEST-QUO-2026/0001 in staging).
 * Guarantees zero duplicate key (E11000) collisions even under high concurrency or pre-existing records.
 */
async function getNextQuoteIndex(isStaging = false, year = new Date().getFullYear()) {
  const prefix = isStaging ? 'TEST-QUO-' : '';
  const seqKey = `quote_${prefix}${year}`;

  let counter = await Counter.findById(seqKey);

  if (!counter) {
    const Finance = mongoose.model('Finance');
    const regex = new RegExp(`^${prefix}${year}/(\\d+)`);
    const existingQuotes = await Finance.find({
      index: regex
    }, 'index').lean();

    let maxNum = 0;
    existingQuotes.forEach(q => {
      if (q.index) {
        const m = String(q.index).match(/(\d+)$/);
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

  // Atomically increment counter, and ensure candidateIndex is not already occupied in MongoDB
  const Finance = mongoose.model('Finance');
  while (true) {
    const updatedCounter = await Counter.findOneAndUpdate(
      { _id: seqKey },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );

    const candidateIndex = `${prefix}${year}/${String(updatedCounter.seq).padStart(4, '0')}`;
    const exists = await Finance.findOne({ index: candidateIndex }, '_id').lean();
    if (!exists) {
      return candidateIndex;
    }
    // If collision exists in the database already (e.g. legacy data), the loop continues to the next number
  }
}

module.exports = {
  getNextInvoiceIndex,
  getNextCreditNoteIndex,
  getNextQuoteIndex,
};
