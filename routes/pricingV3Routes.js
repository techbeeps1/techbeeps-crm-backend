const express = require('express');
const router = express.Router();
const pricingV3Controller = require('../controllers/pricingV3Controller');
const authMiddleware = require('../middlewares/authMiddlerware');
const roleMiddleware = require('../middlewares/roleMiddleware');

// All pricing calculations & settings require authenticated session
router.use(authMiddleware);

// Calculation & Advice endpoints
router.post('/calculate', pricingV3Controller.calculatePrice);
router.post('/advise', pricingV3Controller.getAdvice);

// Versioned Settings CRUD endpoints
router.get('/settings', pricingV3Controller.getDefaultSettings);
router.get('/settings/versions', pricingV3Controller.listVersions);
router.get('/settings/version/:version', pricingV3Controller.getVersion);

// Admin-only mutation endpoints
router.post('/settings', roleMiddleware('Admin'), pricingV3Controller.createVersion);
router.put('/settings/version/:version', roleMiddleware('Admin'), pricingV3Controller.updateVersion);
router.post('/settings/version/:version/activate', roleMiddleware('Admin'), pricingV3Controller.activateVersion);

module.exports = router;
