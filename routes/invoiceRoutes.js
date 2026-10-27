const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');
const sendInvoiceController = require('../controllers/FinanceInvoice/sendInvoiceController');
const authMiddleware = require('../middlewares/authMiddlerware');
const roleMiddleware = require('../middlewares/roleMiddleware');

// Enforce Default-Deny: all invoice operations require authenticated session
router.use(authMiddleware);

router.post('/new_invoice', roleMiddleware(['Admin', 'Staff', 'Agent']), invoiceController.invoice);
router.get('/invoice/:Id', invoiceController.invoiceDetail);
router.get('/invoiceList', invoiceController.invoiceList);
router.post('/update/:id', roleMiddleware(['Admin', 'Staff', 'Agent']), invoiceController.updateInvoice);
router.post('/send', invoiceController.createInvoicePDF);
router.post('/download', invoiceController.DownloadInvoicePDF);
router.delete('/deleteInvoice/:invoiceId', roleMiddleware('Admin'), invoiceController.deleteInvoice);

router.get('/invoiceListByCustomerId', invoiceController.invoiceListByCustomerId);
router.get('/invoiceCount', invoiceController.invoiceCount);
router.get('/searchedInvoice', invoiceController.searchedInvoice);
router.post('/sendInvoice', sendInvoiceController.sendInvoice);

module.exports = router;