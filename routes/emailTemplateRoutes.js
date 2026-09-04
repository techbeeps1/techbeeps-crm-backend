const express = require('express');
const { sendEmail, getEmailById, updateEmail, deleteEmail } = require('../controllers/emailTemplateController');

const router = express.Router();

router.post('/emails', sendEmail);

router.get('/emails/:id', getEmailById);

router.put('/emails/:id', updateEmail);

router.delete('/emails/:id', deleteEmail);


module.exports = router;
