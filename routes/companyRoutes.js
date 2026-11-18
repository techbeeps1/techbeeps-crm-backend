const express = require('express');
const { getCompanyDetails, saveCompanyDetails, uploadLogo } = require('../controllers/companyController');
const authMiddleware = require('../middlewares/authMiddlerware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const router = express.Router();

router.get('/company-details', getCompanyDetails);
router.post('/company-details', authMiddleware, roleMiddleware('Admin'), saveCompanyDetails);
router.post('/upload-logo', authMiddleware, roleMiddleware('Admin'), uploadLogo);

module.exports = router;
