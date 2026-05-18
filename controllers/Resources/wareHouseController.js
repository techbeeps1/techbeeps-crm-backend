const Warehouse = require("../../models/Resources/wareHouse");

// Create a new warehouse
exports.createWarehouse = async (req, res) => {
  try {
    const warehouse = new Warehouse(req.body);
    await warehouse.save();
    res.status(201).json({ message: "Warehouse created successfully", warehouse });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Get all warehouses
exports.getAllWarehouses = async (req, res) => {
  try {
    const warehouses = await Warehouse.find();
    res.status(200).json(warehouses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get a warehouse by ID
exports.getWarehouseById = async (req, res) => {
  try {
    const warehouse = await Warehouse.findById(req.params.id);
    if (!warehouse) {
      return res.status(404).json({ message: "Warehouse not found" });
    }
    res.status(200).json(warehouse);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update a warehouse
exports.updateWarehouse = async (req, res) => {
  try {
    const warehouse = await Warehouse.findByIdAndUpdate(req.params.id, req.body, {
      new: true, // Return the updated document
      runValidators: true, // Ensure schema validation
    });
    if (!warehouse) {
      return res.status(404).json({ message: "Warehouse not found" });
    }
    res.status(200).json({ message: "Warehouse updated successfully", warehouse });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Delete a warehouse
exports.deleteWarehouse = async (req, res) => {
  try {
    const warehouse = await Warehouse.findByIdAndDelete(req.params.id);
    if (!warehouse) {
      return res.status(404).json({ message: "Warehouse not found" });
    }
    res.status(200).json({ message: "Warehouse deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
