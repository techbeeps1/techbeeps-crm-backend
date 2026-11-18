const express = require('express');
const { sendOtp, verifyOtp, sendEmail } = require('../controllers/emailController');
const authMiddleware = require('../middlewares/authMiddlerware');

const router = express.Router();

router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/send_email', authMiddleware, sendEmail);
// Add more email-related routes as needed
module.exports = router;
