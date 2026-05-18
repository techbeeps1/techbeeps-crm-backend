const express = require('express');
const router = express.Router();
const packageController = require('../controllers/packageController'); // Adjust the path according to your project structure

router.post('/', packageController.createPackage);

router.get('/', packageController.getAllPackages);

router.get('/:id', packageController.getPackageById);

router.post('/:id', packageController.updatePackage);

router.delete('/:id', packageController.deletePackage);

module.exports = router;
