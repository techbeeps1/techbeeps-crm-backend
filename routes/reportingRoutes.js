const express = require('express');
const router = express.Router();
const reportingController = require('../controllers/reportingController');

// Routes
router.post('/reporting', reportingController.createReporting);
router.get('/reporting', reportingController.getReportingList);
router.get('/reporting/:id', reportingController.getReportingById);
router.put('/reporting/:id', reportingController.updateReporting);
router.delete('/reporting/:id', reportingController.deleteReporting);
router.get('/reporting-count', reportingController.getReportingCount);

module.exports = router;
