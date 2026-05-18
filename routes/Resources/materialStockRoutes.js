const express = require('express');
const router = express.Router();
const materialStockController = require('../../controllers/Resources/materialStock');

router.post('/material-stock', materialStockController.addMaterialStock);

router.get('/material-stock', materialStockController.getAllMaterialStock);

router.get('/material-stock/:id', materialStockController.getMaterialStockById);

router.delete('/material-stock/:id', materialStockController.deleteMaterialStock);

router.delete('/material', materialStockController.deleteAllMaterialStock);


module.exports = router;
