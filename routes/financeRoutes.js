const express = require('express');
const router = express.Router();
const financeController = require('../controllers/financeController');

router.post('/add', financeController.finance);
router.get('/financeList', financeController.financeList);
router.get('/finance/:Id', financeController.financeDetail);
router.post('/update/:id',financeController.updateInvoice)
router.post('/send',financeController.createInvoicePDF)
router.post('/download',financeController.DownloadInvoicePDF)

router.get('/financeCount', financeController.financeCount);
router.get('/searchedFinance', financeController.searchedFinance);
router.delete('/deleteFinance/:financeId', financeController.deleteFinance);
router.get('/financeListByCustomerId', financeController.financeListByCustomerId);

module.exports = router;