const Payment = require('../models/PaymentRecordModel');
const Invoice = require('../models/invoice');
const FinancialAuditLog = require('../models/financialAuditModel');
const { calculateInvoiceBalance, syncInvoiceLedgerBalance, roundToCents } = require('../utils/financialLedger');
const { getNextCreditNoteIndex } = require('../utils/sequenceGenerator');
const { logFinancialEvent } = require('../utils/auditLogger');

/**
 * Record a payment against an invoice.
 * Guaranteed idempotency, double-billing debounce, server overpayment guard, and ledger audit logging.
 */
const recordPayment = async (req, res) => {
  const { invoiceId, date, amount, paymentMode, description, reference } = req.body;
  try {
    const rawAmt = Number(amount);
    if (!rawAmt || isNaN(rawAmt) || rawAmt <= 0) {
      return res.status(400).json({ message: 'Payment amount must be a positive number greater than 0.' });
    }
    const cleanAmount = roundToCents(rawAmt);

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // 1. Idempotency Key Guard
    const idempotencyKey = req.headers['x-idempotency-key'] || req.body.idempotencyKey;
    if (idempotencyKey) {
      const existingByKey = await Payment.findOne({ idempotencyKey });
      if (existingByKey) {
        console.log(`[Idempotency] Returning existing payment ${existingByKey._id} for key ${idempotencyKey}`);
        const currentBalance = await calculateInvoiceBalance(invoice);
        return res.status(200).json({
          message: 'Payment already recorded (idempotent replay)',
          payment: existingByKey,
          balanceInfo: currentBalance,
        });
      }
    }

    // 2. Server Double-Click Window Debounce (3-second window)
    if (!req.headers['x-allow-duplicate']) {
      const threeSecAgo = new Date(Date.now() - 3000);
      const duplicateRecent = await Payment.findOne({
        invoiceId,
        amount: cleanAmount,
        paymentMode: paymentMode || 'bank_transfer',
        createdAt: { $gte: threeSecAgo }
      });
      if (duplicateRecent) {
        console.log(`[PaymentDebounce] Rapid duplicate click intercepted. Returning existing payment ${duplicateRecent._id}`);
        const currentBalance = await calculateInvoiceBalance(invoice);
        return res.status(200).json({
          message: 'Payment already recorded (debounced)',
          payment: duplicateRecent,
          balanceInfo: currentBalance,
        });
      }
    }

    // 3. Server Overpayment Guard
    const balanceInfoBefore = await calculateInvoiceBalance(invoice);
    if (cleanAmount > balanceInfoBefore.balanceDue + 0.005) {
      return res.status(400).json({
        message: `Payment of €${cleanAmount.toFixed(2)} exceeds the remaining balance due of €${balanceInfoBefore.balanceDue.toFixed(2)}.`,
        remainingBalance: balanceInfoBefore.balanceDue,
      });
    }

    // 4. Create and Save Payment Event
    const actorId = req.user?._id || req.user?.id;
    const actorName = req.user?.username || req.user?.email || 'System';

    const payment = new Payment({
      invoiceId,
      amount: cleanAmount,
      date: date ? new Date(date) : new Date(),
      paymentMode: paymentMode || 'bank_transfer',
      type: 'payment',
      status: 'completed',
      currency: 'EUR',
      recordedBy: actorId,
      authorName: actorName,
      reference: reference || '',
      description: description || '',
      idempotencyKey: idempotencyKey || undefined,
    });
    await payment.save();

    // 5. Synchronize Invoice Document with Authoritative Ledger
    const { invoice: updatedInvoice, balanceInfo } = await syncInvoiceLedgerBalance(invoiceId);

    // 6. Append Immutable Financial Audit Log
    await logFinancialEvent({
      entityType: 'PAYMENT',
      entityId: String(payment._id),
      action: 'PAYMENT_RECORDED',
      amount: cleanAmount,
      currency: 'EUR',
      req,
      reason: description || 'Payment recorded',
      before: { balanceDue: balanceInfoBefore.balanceDue, paid: balanceInfoBefore.totalPaid },
      after: { balanceDue: balanceInfo.balanceDue, paid: balanceInfo.totalPaid },
      metadata: { invoiceId, invoiceIndex: invoice.index, paymentMode },
    });

    return res.status(201).json({
      message: 'Payment recorded successfully',
      payment,
      balanceInfo,
      invoice: updatedInvoice,
    });
  } catch (error) {
    console.error('recordPayment error:', error);
    return res.status(500).json({ message: 'Error recording payment', error: error.message });
  }
};

/**
 * Reverse a previously recorded payment.
 * Creates an append-only reversal event, marks the original payment as reversed,
 * and restores the invoice balance.
 */
const reversePayment = async (req, res) => {
  const { paymentId } = req.params;
  const { reason } = req.body;

  try {
    const originalPayment = await Payment.findById(paymentId);
    if (!originalPayment) {
      return res.status(404).json({ message: 'Payment record not found' });
    }

    if (originalPayment.status === 'reversed') {
      return res.status(400).json({ message: 'This payment has already been reversed.' });
    }

    if (originalPayment.type !== 'payment') {
      return res.status(400).json({ message: `Cannot reverse a record of type ${originalPayment.type}.` });
    }

    const actorId = req.user?._id || req.user?.id;
    const actorName = req.user?.username || req.user?.email || 'System';

    // 1. Mark original payment as reversed
    originalPayment.status = 'reversed';
    originalPayment.reversalReason = reason || 'Reversal requested by authorized user';
    await originalPayment.save();

    // 2. Create append-only reversal record in the ledger
    const reversalRecord = new Payment({
      invoiceId: originalPayment.invoiceId,
      amount: -originalPayment.amount,
      date: new Date(),
      paymentMode: originalPayment.paymentMode,
      type: 'reversal',
      status: 'completed',
      currency: originalPayment.currency || 'EUR',
      recordedBy: actorId,
      authorName: actorName,
      reversalOf: originalPayment._id,
      reversalReason: reason || 'Reversal of payment #' + originalPayment._id,
      description: `Reversal of payment dated ${originalPayment.date?.toISOString()?.split('T')[0]}: ${reason || 'Authorized reversal'}`,
    });
    await reversalRecord.save();

    // 3. Synchronize Invoice Document with Authoritative Ledger
    const { invoice: updatedInvoice, balanceInfo } = await syncInvoiceLedgerBalance(originalPayment.invoiceId);

    // 4. Log Audit Event
    await logFinancialEvent({
      entityType: 'PAYMENT',
      entityId: String(originalPayment._id),
      action: 'PAYMENT_REVERSED',
      amount: originalPayment.amount,
      currency: 'EUR',
      req,
      reason: reason || 'Payment reversal',
      metadata: { originalPaymentId: originalPayment._id, reversalRecordId: reversalRecord._id },
    });

    return res.status(200).json({
      message: 'Payment reversed successfully',
      reversalRecord,
      balanceInfo,
      invoice: updatedInvoice,
    });
  } catch (error) {
    console.error('reversePayment error:', error);
    return res.status(500).json({ message: 'Error reversing payment', error: error.message });
  }
};

/**
 * Issue a Credit Note against an invoice.
 * Generates an atomic sequential CN number, reconciles pro-rata VAT,
 * and deducts the balance due.
 */
const issueCreditNote = async (req, res) => {
  const { invoiceId, amount, reason, date } = req.body;
  try {
    const rawAmt = Number(amount);
    if (!rawAmt || isNaN(rawAmt) || rawAmt <= 0) {
      return res.status(400).json({ message: 'Credit note amount must be a positive number greater than 0.' });
    }
    const cleanAmount = roundToCents(rawAmt);

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const balanceInfoBefore = await calculateInvoiceBalance(invoice);
    if (cleanAmount > balanceInfoBefore.balanceDue + 0.005) {
      return res.status(400).json({
        message: `Credit note amount (€${cleanAmount.toFixed(2)}) cannot exceed the remaining balance due of €${balanceInfoBefore.balanceDue.toFixed(2)}.`,
      });
    }

    // Determine tax rate from invoice for pro-rata credit reconciliation
    let taxRate = 21;
    if (invoice.items && invoice.items.length > 0) {
      const itemTax = String(invoice.items[0].btw || '');
      if (itemTax.includes('9')) taxRate = 9;
      else if (itemTax.includes('0') || itemTax.includes('RC') || itemTax.includes('EX')) taxRate = 0;
    }
    const netAmount = roundToCents(cleanAmount / (1 + taxRate / 100));
    const taxAmount = roundToCents(cleanAmount - netAmount);

    // Allocate atomic sequence index: CN-YYYY/XXXX
    const isStaging = invoice.isStaging || process.env.NODE_ENV !== 'production' || process.env.IS_STAGING === 'true';
    const currentYear = new Date().getFullYear();
    const creditNoteIndex = await getNextCreditNoteIndex(isStaging, currentYear);

    const actorId = req.user?._id || req.user?.id;
    const actorName = req.user?.username || req.user?.email || 'System';

    const creditNote = new Payment({
      invoiceId,
      amount: cleanAmount,
      date: date ? new Date(date) : new Date(),
      paymentMode: 'credit_deduction',
      type: 'credit_note',
      status: 'completed',
      currency: 'EUR',
      recordedBy: actorId,
      authorName: actorName,
      creditNoteIndex,
      taxRate,
      taxAmount,
      netAmount,
      description: reason || `Credit Note ${creditNoteIndex} issued`,
    });
    await creditNote.save();

    // Synchronize Invoice Document with Authoritative Ledger
    const { invoice: updatedInvoice, balanceInfo } = await syncInvoiceLedgerBalance(invoiceId);

    // Audit Event
    await logFinancialEvent({
      entityType: 'CREDIT_NOTE',
      entityId: String(creditNote._id),
      action: 'CREDIT_NOTE_ISSUED',
      amount: cleanAmount,
      currency: 'EUR',
      req,
      reason: reason || 'Credit Note Issued',
      metadata: { creditNoteIndex, invoiceId, invoiceIndex: invoice.index, taxRate, taxAmount, netAmount },
    });

    return res.status(201).json({
      message: 'Credit note issued successfully',
      creditNote,
      balanceInfo,
      invoice: updatedInvoice,
    });
  } catch (error) {
    console.error('issueCreditNote error:', error);
    return res.status(500).json({ message: 'Error issuing credit note', error: error.message });
  }
};

const getPaymentsByInvoiceId = async (req, res) => {
  const { invoiceId } = req.params;
  try {
    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const payments = await Payment.find({ invoiceId }).sort({ createdAt: -1 });
    const balanceInfo = await calculateInvoiceBalance(invoice, payments);

    return res.status(200).json({
      message: 'Payments retrieved successfully',
      payments,
      balanceInfo,
    });
  } catch (error) {
    console.error('getPaymentsByInvoiceId error:', error);
    return res.status(500).json({ message: 'Error retrieving payments', error: error.message });
  }
};

const getCreditNotesByInvoiceId = async (req, res) => {
  const { invoiceId } = req.params;
  try {
    const creditNotes = await Payment.find({ invoiceId, type: 'credit_note' }).sort({ createdAt: -1 });
    return res.status(200).json({
      message: 'Credit notes retrieved successfully',
      creditNotes,
    });
  } catch (error) {
    console.error('getCreditNotesByInvoiceId error:', error);
    return res.status(500).json({ message: 'Error retrieving credit notes', error: error.message });
  }
};

const getAllPayments = async (req, res) => {
  try {
    const payments = await Payment.find().populate('invoiceId', 'index total paid payment').sort({ createdAt: -1 });
    return res.status(200).json({ message: 'All payments retrieved successfully', payments });
  } catch (error) {
    console.error('getAllPayments error:', error);
    return res.status(500).json({ message: 'Error retrieving all payments', error: error.message });
  }
};

const getFinancialAuditLogs = async (req, res) => {
  try {
    const { entityType, entityId, limit = 50 } = req.query;
    const filter = {};
    if (entityType) filter.entityType = entityType;
    if (entityId) filter.entityId = entityId;

    const logs = await FinancialAuditLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    return res.status(200).json({ message: 'Financial audit logs retrieved', logs });
  } catch (error) {
    console.error('getFinancialAuditLogs error:', error);
    return res.status(500).json({ message: 'Error retrieving audit logs', error: error.message });
  }
};

module.exports = {
  recordPayment,
  reversePayment,
  issueCreditNote,
  getPaymentsByInvoiceId,
  getCreditNotesByInvoiceId,
  getAllPayments,
  getFinancialAuditLogs,
};
