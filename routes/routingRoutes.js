const express = require('express');
const router = express.Router();
const routingController = require('../controllers/routingController');
const { routingLimiter } = require('../middlewares/rateLimiter');

// All routing proxy endpoints (rate-limited for public intake & CRM users)
router.use(routingLimiter);
router.post('/directions', routingController.calculateDirections);
router.post('/geocode', routingController.geocodeSearch);
router.get('/geocode', routingController.geocodeSearch);

module.exports = router;
