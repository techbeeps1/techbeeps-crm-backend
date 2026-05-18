// routes/chatRoutes.js
const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

// POST a new message
router.post('/send', chatController.chat);

module.exports = router;
