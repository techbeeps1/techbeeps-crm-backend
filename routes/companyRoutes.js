const express = require('express');
const { getCompanyDetails, saveCompanyDetails ,uploadLogo} = require('../controllers/companyController');
const router = express.Router();

router.post('/upload-logo', uploadLogo);
router.get('/company-details', getCompanyDetails);
router.post('/company-details', saveCompanyDetails);


module.exports = router;
