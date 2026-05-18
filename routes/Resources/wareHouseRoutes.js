const express = require("express");
const router = express.Router();
const warehouseController = require("../../controllers/Resources/wareHouseController");

// Routes for Warehouse
router.post("/warehouses", warehouseController.createWarehouse); // Create
router.get("/warehouses", warehouseController.getAllWarehouses); // Read all
router.get("/warehouses/:id", warehouseController.getWarehouseById); // Read one
router.post("/warehouses/:id", warehouseController.updateWarehouse); // Update
router.delete("/warehouses/:id", warehouseController.deleteWarehouse); // Delete

module.exports = router;
