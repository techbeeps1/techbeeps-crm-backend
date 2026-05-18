const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');

router.post('/leads', leadController.createLead);
router.get('/leadList', leadController.leadList);
router.get('/leadCount', leadController.leadCount);
router.get('/searchedLead', leadController.searchedLead);

module.exports = router;