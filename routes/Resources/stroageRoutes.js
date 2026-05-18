const express = require('express');
const router = express.Router();
const storageController = require('../../controllers/Resources/storageController');

router.post('/storages', storageController.createStorage);
router.get('/storages', storageController.getAllStorages);
router.get('/storages/:id', storageController.getStorageById);
router.post('/storages/:id', storageController.updateStorage);
router.put('/storages/:id', storageController.loadingUnloading);
router.post('/storages-download', storageController.DownloadInvoicePDF);
router.post('/storages-send', storageController.sendInvoicePDF);
router.delete('/storages/:id', storageController.deleteStorage);

router.put('/empty-storage/:storageId', storageController.emptyStorage);


module.exports = router;
