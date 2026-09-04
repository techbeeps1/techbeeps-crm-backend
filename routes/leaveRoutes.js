const express = require('express');
const router = express.Router();
const leaveController = require('../controllers/leaveController');
const authMiddleware = require('../middlewares/authMiddlerware');

// All leave routes require authentication
router.use(authMiddleware);

// Leave Requests (Support both /requests and /request)
router.post('/requests', leaveController.createLeaveRequest);
router.post('/request', leaveController.createLeaveRequest);

router.get('/requests', leaveController.getLeaveRequests);
router.get('/request', leaveController.getLeaveRequests);

router.put('/request/:id/status', leaveController.updateLeaveStatus);
router.put('/requests/:id/status', leaveController.updateLeaveStatus);
router.patch('/request/:id/status', leaveController.updateLeaveStatus);
router.patch('/requests/:id/status', leaveController.updateLeaveStatus);

router.delete('/request/:id', leaveController.deleteLeaveRequest);
router.delete('/requests/:id', leaveController.deleteLeaveRequest);

// Leave Balances & Leave Cards
router.get('/balances', leaveController.getLeaveBalances);
router.put('/balances/:employeeId', leaveController.updateLeaveBalance);

// Summary KPI Metrics
router.get('/summary', leaveController.getLeaveSummary);

module.exports = router;
