const express = require('express');
const router = express.Router();
const {
  recordPayment,
  reversePayment,
  issueCreditNote,
  getPaymentsByInvoiceId,
  getCreditNotesByInvoiceId,
  getAllPayments,
  getFinancialAuditLogs,
} = require('../controllers/paymentController');
const authMiddleware = require('../middlewares/authMiddlerware');

router.use(authMiddleware);

router.post('/record-payment', recordPayment);
router.post('/payment/reverse/:paymentId', reversePayment);
router.post('/credit-note', issueCreditNote);
router.get('/credit-notes/:invoiceId', getCreditNotesByInvoiceId);
router.get('/payments/:invoiceId', getPaymentsByInvoiceId);
router.get('/payments', getAllPayments);
router.get('/financial-audit-log', getFinancialAuditLogs);

module.exports = router;
