const MaterialStock = require('../../models/Resources/materialStock');
const MovingBox = require('../../models/Resources/movingBox')

exports.addMaterialStock = async (req, res) => {
    const { supplier, material, receivedOn, quantity, orderOn, orderQuantity, type } = req.body;
    try {
        if (!supplier || !material) {
            return res.status(400).json({
                success: false,
                message: 'Supplier and material are required fields.',
            });
        }
        const movingBox = await MovingBox.findById(material);
        if (!movingBox) {
            return res.status(404).json({
                success: false,
                message: 'Material not found in MovingBox.',
            });
        }
        const stock = new MaterialStock({
            supplier,
            material,
            receivedOn,
            quantity, orderOn, orderQuantity, type
        });
        await stock.save();
        if (quantity) {
            movingBox.currentStock = (Number(movingBox.currentStock) || 0) + Number(quantity);
            if (movingBox.outstanding >= quantity) {
                movingBox.outstanding = (Number(movingBox.outstanding) || 0) - Number(quantity);
            }
        }
        if (orderQuantity) {
            movingBox.outstanding = (Number(movingBox.outstanding) || 0) + Number(orderQuantity);
        }
        await movingBox.save();
        return res.status(200).json({
            success: true,
            message: 'Material stock added and current stock updated successfully.',
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Server error. Unable to update material stock.',
            error: error.message,
        });
    }
};


// Get All Material Stock
exports.getAllMaterialStock = async (req, res) => {
    const { type, material } = req.query;
    try {
        const filters = {};
        if (type) filters.type = type;
        if (material) filters.material = material;

        const stock = await MaterialStock.find(filters)
            .populate('supplier', 'name') // Assuming supplier has a `name` field
            .populate('material', 'name'); // Assuming material has a `name` field
        return res.status(200).json(stock);
    } catch (error) {
        return res.status(500).json({
            message: 'Server error. Unable to retrieve material stock.',
            error: error.message,
        });
    }
};

// Get Material Stock by ID
exports.getMaterialStockById = async (req, res) => {
    const { id } = req.params;

    try {
        const stock = await MaterialStock.findById(id)
            .populate('supplier', 'name')
            .populate('material', 'name');

        if (!stock) {
            return res.status(404).json({
                success: false,
                message: 'Material stock not found.',
            });
        }
        return res.status(200).json({
            success: true,
            message: 'Material stock retrieved successfully.',
            stock,
        });
    } catch (error) {
        console.error('Error fetching material stock by ID:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error. Unable to retrieve material stock by ID.',
            error: error.message,
        });
    }
};

// Delete Material Stock by ID
exports.deleteMaterialStock = async (req, res) => {
    const { id } = req.params;
    try {
        const stock = await MaterialStock.findByIdAndDelete(id);

        if (!stock) {
            return res.status(404).json({
                success: false,
                message: 'Material stock not found.',
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Material stock deleted successfully.',
        });
    } catch (error) {
        console.error('Error deleting material stock:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error. Unable to delete material stock.',
            error: error.message,
        });
    }
};

exports.deleteAllMaterialStock = async (req, res) => {
    try {
        const result = await MaterialStock.deleteMany({}); // Deletes all documents in the collection
        return res.status(200).json({
            success: true,
            message: `All material stock deleted successfully. Total deleted: ${result.deletedCount}`,
        });
    } catch (error) {
        console.error('Error deleting all material stock:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error. Unable to delete all material stock.',
            error: error.message,
        });
    }
};


