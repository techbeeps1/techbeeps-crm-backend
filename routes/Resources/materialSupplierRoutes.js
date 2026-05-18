const express = require("express");
const router = express.Router();
const {
  createSupplier,
  getAllSuppliers,
  getSupplierById,
  updateSupplier,
  deleteSupplier,
} = require("../../controllers/Resources/materialSupplier");

router.post("/supplier", createSupplier);

router.get("/supplier", getAllSuppliers);

router.get("/supplier/:id", getSupplierById);

router.post("/supplier/:id", updateSupplier);

router.delete("/supplier/:id", deleteSupplier);

module.exports = router;
