const express = require('express');
const { sendEmail, getEmailById, getEmails, updateEmail, deleteEmail } = require('../controllers/emailTemplateController');

const router = express.Router();

router.get('/emails', getEmails);
router.post('/emails', sendEmail);

router.get('/emails/:id', getEmailById);

router.put('/emails/:id', updateEmail);

router.delete('/emails/:id', deleteEmail);


module.exports = router;
