const express = require('express');
const router = express.Router();
const routingController = require('../controllers/routingController');

// All routing proxy endpoints
router.post('/directions', routingController.calculateDirections);
router.post('/geocode', routingController.geocodeSearch);
router.get('/geocode', routingController.geocodeSearch);

module.exports = router;
