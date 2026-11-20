const express = require('express');
const { sendOtp, verifyOtp, sendEmail, getEmailLogs } = require('../controllers/emailController');
const authMiddleware = require('../middlewares/authMiddlerware');
const { otpLimiter } = require('../middlewares/rateLimiter');

const router = express.Router();

router.post('/send-otp', otpLimiter, sendOtp);
router.post('/verify-otp', otpLimiter, verifyOtp);
router.post('/send_email', authMiddleware, sendEmail);
router.get('/logs', authMiddleware, getEmailLogs);
// Add more email-related routes as needed
module.exports = router;
