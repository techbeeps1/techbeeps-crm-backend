const express = require('express');
const router = express.Router();
const { recordPayment,getAllPayments,getPaymentsByInvoiceId } = require('../controllers/paymentController');

router.post('/record-payment', recordPayment);

router.get('/payments/:invoiceId', getPaymentsByInvoiceId);

router.get('/payments', getAllPayments);

module.exports = router;
