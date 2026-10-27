const express = require('express');
const router = express.Router();
const logCommunicationController = require('../controllers/logCommunicationController');
const authMiddleware = require('../middlewares/authMiddlerware');

router.use(authMiddleware);

router.post('/logCommunication', logCommunicationController.logCommunication);
router.get('/logCommunicationList', logCommunicationController.logCommunicationList);
router.get('/logCommunicationCount', logCommunicationController.logCommunicationCount);
module.exports = router;