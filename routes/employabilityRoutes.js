const express = require('express');
const router = express.Router();
const employabilityController = require('../controllers/employabilityController'); // Adjust path as needed


router.get('/:id', employabilityController.getEmployabilityById);



module.exports = router;
