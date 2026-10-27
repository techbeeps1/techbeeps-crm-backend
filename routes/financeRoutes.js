const express = require('express');
const router = express.Router();
const financeController = require('../controllers/financeController');
const authMiddleware = require('../middlewares/authMiddlerware');
const roleMiddleware = require('../middlewares/roleMiddleware');

router.post('/add', authMiddleware, roleMiddleware(['Admin', 'Staff', 'Agent']), financeController.finance);
router.get('/financeList', authMiddleware, financeController.financeList);
router.get('/finance/:Id', financeController.financeDetail);
router.post('/update/:id', financeController.updateInvoice);
router.post('/accept/:id', financeController.acceptQuote);
router.post('/on-site-accept/:id', authMiddleware, roleMiddleware(['Admin', 'Staff', 'Agent']), financeController.onSiteAcceptQuote);
router.post('/send', authMiddleware, financeController.createInvoicePDF);
router.post('/download', financeController.DownloadInvoicePDF);

router.get('/financeCount', authMiddleware, financeController.financeCount);
router.get('/searchedFinance', authMiddleware, financeController.searchedFinance);
router.delete('/deleteFinance/:financeId', authMiddleware, roleMiddleware('Admin'), financeController.deleteFinance);
router.get('/financeListByCustomerId', authMiddleware, financeController.financeListByCustomerId);

module.exports = router;