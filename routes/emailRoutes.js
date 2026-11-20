const express = require('express');
const { sendOtp, verifyOtp, sendEmail } = require('../controllers/emailController');
const authMiddleware = require('../middlewares/authMiddlerware');
const { otpLimiter } = require('../middlewares/rateLimiter');

const router = express.Router();

router.post('/send-otp', otpLimiter, sendOtp);
router.post('/verify-otp', otpLimiter, verifyOtp);
router.post('/send_email', authMiddleware, sendEmail);
// Add more email-related routes as needed
module.exports = router;
