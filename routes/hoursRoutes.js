const express = require('express');
const router = express.Router();
const hoursController = require('../controllers/hoursController');
const authMiddleware = require('../middlewares/authMiddlerware');

// All routes protected with auth
router.use(authMiddleware);

// Get shift hours for approval list
router.get('/shifts', hoursController.getShiftsForApproval);

// Approve shift(s) - single or bulk
router.post('/approve', hoursController.approveShifts);

// Reject shift
router.post('/reject', hoursController.rejectShift);

// Adjust shift hours (start/end times, break, overtime, notes)
router.put('/adjust', hoursController.adjustShiftHours);

// Get Hours overview & analytics
router.get('/overview', hoursController.getHoursOverview);

module.exports = router;
