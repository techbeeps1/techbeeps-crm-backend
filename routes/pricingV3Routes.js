const express = require('express');
const router = express.Router();
const pricingV3Controller = require('../controllers/pricingV3Controller');
const authMiddleware = require('../middlewares/authMiddlerware');

// All pricing calculations require authenticated session (Default-Deny)
router.use(authMiddleware);

router.post('/calculate', pricingV3Controller.calculatePrice);
router.post('/advise', pricingV3Controller.getAdvice);
router.get('/settings', pricingV3Controller.getDefaultSettings);

module.exports = router;
