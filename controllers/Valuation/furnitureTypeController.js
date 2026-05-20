const FurnitureType = require("../../models/Valuation/furnitureTypeModel");

// Get all furniture types
exports.getAllFurnitureTypes = async (req, res) => {
    try {
        const furnitureTypes = await FurnitureType.find();
        res.status(200).json(furnitureTypes);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Get a single furniture type by ID
exports.getFurnitureTypeById = async (req, res) => {
    const { id } = req.params;
    try {
        const furnitureType = await FurnitureType.findById(id);
        if (!furnitureType) return res.status(404).json({ error: "Furniture type not found" });
        res.status(200).json(furnitureType);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Create a new furniture type
exports.createFurnitureType = async (req, res) => {
    const { furnitureTypeName, cubicMeter, icon,isDisassambled,iconFileName, servicesPossible, weight ,price } = req.body;
    try {
        const newFurnitureType = new FurnitureType({
            furnitureTypeName,
            cubicMeter,
            icon,
            isDisassambled:  isDisassambled ? isDisassambled : false,
            iconFileName: iconFileName? iconFileName :'',
            servicesPossible,
            weight,
            price,
        });
        await newFurnitureType.save();
        res.status(201).json(newFurnitureType);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Update an existing furniture type
exports.updateFurnitureType = async (req, res) => {
    const { id } = req.params;
    try {
        const updateData = {
            ...req.body.formData,
            iconFileName: req.body.iconFileName
        };
        const updatedFurnitureType =
            await FurnitureType.findByIdAndUpdate(
                id,
                updateData,
                {
                    new: true,
                    runValidators: true
                }
            );

        if (!updatedFurnitureType) {
            return res.status(404).json({
                error: "Furniture type not found"
            });
        }

        res.status(200).json({ message: "Furniture type updated successfully" });

    } catch (error) {
        res.status(400).json({
            error: error.message
        });
    }
};

// Delete a furniture type
exports.deleteFurnitureType = async (req, res) => {
    const { id } = req.params;
    try {
        const deletedFurnitureType = await FurnitureType.findByIdAndDelete(id);
        if (!deletedFurnitureType) return res.status(404).json({ error: "Furniture type not found" });
        res.status(200).json({ message: "Furniture type deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
