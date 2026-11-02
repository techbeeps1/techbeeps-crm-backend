const Warehouse = require("../../models/Resources/wareHouse");
const Storage = require("../../models/Resources/storageModel");
const { calculateWarehouseAllocation } = require("../../utils/storageCapacityEngine");

// Create a new warehouse
exports.createWarehouse = async (req, res) => {
  try {
    if (req.body.totalCapacityM3 !== undefined && req.body.totalCapacityM3 !== null) {
      const cap = Number(req.body.totalCapacityM3);
      if (isNaN(cap) || cap < 0) {
        return res.status(400).json({
          success: false,
          code: "INVALID_CAPACITY",
          message: "Total capacity must be a non-negative number."
        });
      }
      req.body.totalCapacityM3 = cap;
    }

    const warehouse = new Warehouse(req.body);
    await warehouse.save();
    res.status(201).json({ message: "Warehouse created successfully", warehouse });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Get all warehouses (enriched with live volume allocations)
exports.getAllWarehouses = async (req, res) => {
  try {
    const warehouses = await Warehouse.find().lean();

    const enriched = await Promise.all(
      warehouses.map(async (wh) => {
        const rated = Number(wh.totalCapacityM3) || 0;
        const alloc = await calculateWarehouseAllocation(wh._id);
        const maxAllowed = rated > 0 ? Math.round(rated * 1.20 * 100) / 100 : 0;
        const utilization = rated > 0 ? Math.round((alloc.allocatedM3 / rated) * 1000) / 10 : 0;
        const remaining = rated > 0 ? Math.max(0, Math.round((maxAllowed - alloc.allocatedM3) * 100) / 100) : null;
        const isOverCapacity = rated > 0 && alloc.allocatedM3 > maxAllowed;

        return {
          ...wh,
          totalCapacityM3: rated,
          allocatedM3: alloc.allocatedM3,
          occupiedM3: alloc.occupiedM3,
          storageCount: alloc.storageCount,
          occupiedCount: alloc.occupiedCount,
          maxAllowedM3: maxAllowed,
          utilizationPercentage: utilization,
          remainingM3: remaining,
          isOverCapacity
        };
      })
    );

    res.status(200).json(enriched);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get a warehouse by ID
exports.getWarehouseById = async (req, res) => {
  try {
    const warehouse = await Warehouse.findById(req.params.id).lean();
    if (!warehouse) {
      return res.status(404).json({ message: "Warehouse not found" });
    }

    const rated = Number(warehouse.totalCapacityM3) || 0;
    const alloc = await calculateWarehouseAllocation(warehouse._id);
    const maxAllowed = rated > 0 ? Math.round(rated * 1.20 * 100) / 100 : 0;
    const utilization = rated > 0 ? Math.round((alloc.allocatedM3 / rated) * 1000) / 10 : 0;
    const remaining = rated > 0 ? Math.max(0, Math.round((maxAllowed - alloc.allocatedM3) * 100) / 100) : null;
    const isOverCapacity = rated > 0 && alloc.allocatedM3 > maxAllowed;

    res.status(200).json({
      ...warehouse,
      totalCapacityM3: rated,
      allocatedM3: alloc.allocatedM3,
      occupiedM3: alloc.occupiedM3,
      storageCount: alloc.storageCount,
      occupiedCount: alloc.occupiedCount,
      maxAllowedM3: maxAllowed,
      utilizationPercentage: utilization,
      remainingM3: remaining,
      isOverCapacity
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get full capacity breakdown & storage unit roster for a warehouse
exports.getWarehouseCapacityStatus = async (req, res) => {
  try {
    const warehouse = await Warehouse.findById(req.params.id).lean();
    if (!warehouse) {
      return res.status(404).json({ message: "Warehouse not found" });
    }

    const rated = Number(warehouse.totalCapacityM3) || 0;
    const alloc = await calculateWarehouseAllocation(warehouse._id);
    const storages = await Storage.find({
      warehouse: warehouse._id,
      deleted: { $ne: true },
      storageStatus: { $ne: 'deleted' }
    })
      .populate('customer', 'firstName lastName name email contactNumber')
      .populate('storageLocation', 'name')
      .lean();

    const maxAllowed = rated > 0 ? Math.round(rated * 1.20 * 100) / 100 : 0;
    const utilization = rated > 0 ? Math.round((alloc.allocatedM3 / rated) * 1000) / 10 : 0;
    const remaining = rated > 0 ? Math.max(0, Math.round((maxAllowed - alloc.allocatedM3) * 100) / 100) : null;

    res.status(200).json({
      warehouseId: warehouse._id,
      warehouseName: warehouse.name,
      totalCapacityM3: rated,
      maxAllowedM3: maxAllowed,
      allocatedM3: alloc.allocatedM3,
      occupiedM3: alloc.occupiedM3,
      storageCount: alloc.storageCount,
      occupiedCount: alloc.occupiedCount,
      utilizationPercentage: utilization,
      remainingM3: remaining,
      isOverCapacity: rated > 0 && alloc.allocatedM3 > maxAllowed,
      storages
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update a warehouse
exports.updateWarehouse = async (req, res) => {
  try {
    if (req.body.totalCapacityM3 !== undefined && req.body.totalCapacityM3 !== null) {
      const cap = Number(req.body.totalCapacityM3);
      if (isNaN(cap) || cap < 0) {
        return res.status(400).json({
          success: false,
          code: "INVALID_CAPACITY",
          message: "Total capacity must be a non-negative number."
        });
      }
      req.body.totalCapacityM3 = cap;
    }

    const warehouse = await Warehouse.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
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
