const mongoose = require('mongoose');

function roundToCents(val) {
  const num = Number(val);
  if (isNaN(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Pure calculation function: determines paid, credited, balanceDue and paymentStatus
 * from invoice total and ledger payment entries.
 */
async function calculateInvoiceBalance(invoice, paymentsList = null) {
  if (!invoice) return { totalPaid: 0, totalCredited: 0, balanceDue: 0, paymentStatus: 'unpaid' };

  let payments = paymentsList;
  if (!payments && invoice._id) {
    const Payment = mongoose.model('Payment');
    payments = await Payment.find({ invoiceId: invoice._id }).lean();
  }
  payments = payments || [];

  const completedPayments = payments.filter(p => (p.type === 'payment' || !p.type) && p.status !== 'reversed');
  const completedCredits = payments.filter(p => p.type === 'credit_note' && p.status !== 'reversed');

  const totalPaid = roundToCents(completedPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0));
  const totalCredited = roundToCents(completedCredits.reduce((sum, c) => sum + (Number(c.amount) || 0), 0));

  const invoiceTotal = roundToCents(Number(invoice.total) || 0);
  const balanceDue = Math.max(0, roundToCents(invoiceTotal - totalPaid - totalCredited));

  let paymentStatus = 'unpaid';
  if (balanceDue <= 0.005) {
    if (totalCredited >= invoiceTotal && totalPaid === 0) {
      paymentStatus = 'credited';
    } else {
      paymentStatus = 'paid';
    }
  } else if (totalPaid > 0 || totalCredited > 0) {
    paymentStatus = 'partially_paid';
  } else {
    const due = invoice.dueDate || invoice.expire_date;
    if (due && new Date(due) < new Date()) {
      paymentStatus = 'overdue';
    } else {
      paymentStatus = 'unpaid';
    }
  }

  return {
    totalPaid,
    totalCredited,
    balanceDue,
    paymentStatus,
  };
}

/**
 * Synchronizes the invoice document in MongoDB with the authoritative ledger state.
 */
async function syncInvoiceLedgerBalance(invoiceId) {
  const Invoice = mongoose.model('Invoice');
  const Payment = mongoose.model('Payment');

  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found`);
  }

  const payments = await Payment.find({ invoiceId }).lean();
  const balanceInfo = await calculateInvoiceBalance(invoice, payments);

  invoice.paid = balanceInfo.totalPaid;
  invoice.credited = balanceInfo.totalCredited;
  invoice.balanceDue = balanceInfo.balanceDue;
  invoice.payment = balanceInfo.paymentStatus;

  await invoice.save();
  return { invoice, balanceInfo };
}

module.exports = {
  roundToCents,
  calculateInvoiceBalance,
  syncInvoiceLedgerBalance,
};
