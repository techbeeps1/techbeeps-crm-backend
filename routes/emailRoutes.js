const express = require('express');
const { sendOtp, verifyOtp,sendEmail } = require('../controllers/emailController');

const router = express.Router();

router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/send_email', sendEmail);

module.exports = router;
