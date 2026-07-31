const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');

router.post('/customeradd', customerController.customer);
router.get('/customerList', customerController.customerList);

router.post('/customer/address', customerController.addAddressToCustomer);
router.post('/update_address', customerController.updateAddress);
router.post('/delete_address', customerController.deleteAddress);
router.get('/address/:Id', customerController.getHeadAddress);

router.post('/customerdetial', customerController.CustomerDetail)
router.delete('/deleteCustomer/:customerId', customerController.deleteCustomer);
router.put('/editCustomer/:customerId', customerController.editCustomer);

router.get('/searchedCustomer', customerController.searchedCustomer);
router.post('/mergeCustomer', customerController.mergeCustomer);

module.exports = router;
