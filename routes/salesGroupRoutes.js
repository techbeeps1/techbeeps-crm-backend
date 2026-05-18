const express = require('express');
const router = express.Router();
const salesGroupController = require('../controllers/salesgroupController');

router.post('/', salesGroupController.addSalesGroup);

router.get('/', salesGroupController.getSalesGroups);

router.put('/:id', salesGroupController.updateSalesGroup);

router.delete('/:id', salesGroupController.deleteSalesGroup);

router.post('/many',salesGroupController.addMultipleSalesGroups);

module.exports = router;
