const express = require('express');
const router = express.Router();
const vehicleController = require('../../controllers/Resources/vehicleController');

router.post('/vehicles', vehicleController.createVehicle);

router.get('/vehicles', vehicleController.getAllVehicles);

router.get('/vehicles/:id', vehicleController.getVehicleById);

router.post('/vehicles/:id', vehicleController.updateVehicleById);

router.delete('/vehicles/:id', vehicleController.deleteVehicleById);

module.exports = router;
