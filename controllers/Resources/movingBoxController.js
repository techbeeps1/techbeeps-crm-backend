const MovingBox = require('../../models/Resources/movingBox');
const Supplier = require("../../models/Resources/materialSupplier");

// Create a new MovingBox
exports.createMovingBox = async (req, res) => {
    try {
        const movingBox = new MovingBox(req.body);
        const savedBox = await movingBox.save();
        res.status(201).json(savedBox);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Get all MovingBoxes
exports.getAllMovingBoxes = async (req, res) => {
    try {
        const { type } = req.query; // Extract the inventoryType from the query
        const filter = type ? { inventoryType: type } : {}; // Apply the filter only if inventoryType is provided
        const boxes = await MovingBox.find(filter).populate({
            path: 'inventorySuppliers.supplier'
          });
        res.status(200).json(boxes);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


// Get a single MovingBox by ID
exports.getMovingBoxById = async (req, res) => {
    try {
        const box = await MovingBox.findById(req.params.id);
        if (!box) return res.status(404).json({ message: "Box not found" });
        res.status(200).json(box);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.updateMovingBox = async (req, res) => {
    try {
        const { supplier, purchasePrice, ...updateData } = req.body;

        const movingBox = await MovingBox.findById(req.params.id);
        if (!movingBox) {
            return res.status(404).json({ message: "Box not found" });
        }

        if (supplier) {
            const foundSupplier = await Supplier.findById(supplier);
            if (!foundSupplier) {
                return res.status(400).json({ message: "Supplier not found." });
            }

            movingBox.inventorySuppliers = movingBox.inventorySuppliers || [];
            const supplierIndex = movingBox.inventorySuppliers.findIndex(
                (invSupplier) => String(invSupplier.supplier) === String(foundSupplier._id)
            );

            if (supplierIndex !== -1) {
                movingBox.inventorySuppliers[supplierIndex].purchasePrice = purchasePrice;
            } else {
                movingBox.inventorySuppliers.push({
                    supplier: foundSupplier._id,
                    purchasePrice,
                });
            }
        }
        delete updateData.inventorySuppliers;
        Object.assign(movingBox, updateData);
        try {
            const updatedBox = await movingBox.save();
            res.status(200).json(updatedBox);
        } catch (saveError) {
            res.status(500).json({ message: 'Failed to save moving box.', error: saveError.message });
        }
    } catch (error) {
        console.error('Error Updating Box:', error);
        res.status(400).json({ error: error.message });
    }
};

  

// Delete a MovingBox
exports.deleteMovingBox = async (req, res) => {
    try {
        const deletedBox = await MovingBox.findByIdAndDelete(req.params.id);
        if (!deletedBox) return res.status(404).json({ message: "Box not found" });
        res.status(200).json({ message: "Box deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
