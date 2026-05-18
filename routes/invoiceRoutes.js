const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');
const sendInvoiceController  = require('../controllers/FinanceInvoice/sendInvoiceController');

router.post('/new_invoice', invoiceController.invoice);
router.get('/invoice/:Id',invoiceController.invoiceDetail)
router.get('/invoiceList', invoiceController.invoiceList);
router.post('/update/:id',invoiceController.updateInvoice)
router.post('/send',invoiceController.createInvoicePDF)
router.post('/download',invoiceController.DownloadInvoicePDF)
router.delete('/deleteInvoice/:invoiceId', invoiceController.deleteInvoice);

router.get('/invoiceListByCustomerId', invoiceController.invoiceListByCustomerId);

router.get('/invoiceCount', invoiceController.invoiceCount);
router.get('/searchedInvoice', invoiceController.searchedInvoice);
router.post('/sendInvoice', sendInvoiceController.sendInvoice);

module.exports = router;