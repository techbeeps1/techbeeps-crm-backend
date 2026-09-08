const express = require('express');
const router = express.Router();
const availabilityController = require('../controllers/availabilityController');
const authMiddleware = require('../middlewares/authMiddlerware');

// All availability routes require authentication
router.use(authMiddleware);

// Employee Availability endpoints
router.get('/employee/:employeeId', availabilityController.getEmployeeAvailability);
router.put('/employee/:employeeId', availabilityController.saveEmployeeAvailability);
router.post('/employee/:employeeId', availabilityController.saveEmployeeAvailability);

// Sporadic exceptions endpoints
router.post('/employee/:employeeId/sporadic', availabilityController.addSporadicException);
router.delete('/employee/:employeeId/sporadic/:exceptionId', availabilityController.deleteSporadicException);

module.exports = router;
