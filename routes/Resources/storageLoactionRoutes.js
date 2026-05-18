// routes/storageLocationRoutes.js
const express = require('express');
const router = express.Router();
const storageLocationController = require('../../controllers/Resources/storageLocationController');

// Define routes
router.post('/storage_loaction', storageLocationController.createStorageLocation);
router.get('/storage_loaction', storageLocationController.getAllStorageLocations);
router.get('/storage_loaction/:id', storageLocationController.getStorageLocationById);
router.post('/storage_loaction/:id', storageLocationController.updateStorageLocation);
router.delete('/storage_loaction/:id', storageLocationController.deleteStorageLocation);

module.exports = router;
