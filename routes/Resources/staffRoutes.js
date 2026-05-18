const express = require('express');
const router = express.Router();
const staffController = require('../../controllers/Resources/staffController');

router.post('/Resources/createStaff', staffController.createStaff);
router.get('/Resources/staffList', staffController.staffList);
router.get('/searchedStaff', staffController.searchedStaff); 

module.exports = router;