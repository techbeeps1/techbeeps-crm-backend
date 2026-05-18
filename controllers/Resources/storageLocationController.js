// controllers/storageLocationController.js
const StorageLocation = require('../../models/Resources/storageLocation');

// Create a new storage location
exports.createStorageLocation = async (req, res) => {
    try {
        const storageLocation = new StorageLocation(req.body);
        const savedStorageLocation = await storageLocation.save();
        res.status(201).json(savedStorageLocation);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Get all storage locations
exports.getAllStorageLocations = async (req, res) => {
    try {
        const { warehouseId } = req.query; // Get the warehouseId from query parameters
        const filter = warehouseId ? { warehouse:warehouseId } : {}; // Apply filter if warehouseId exists

        const storageLocations = await StorageLocation.find(filter).populate('warehouse'); // Apply the filter
        res.status(200).json(storageLocations);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


// Get a specific storage location by ID
exports.getStorageLocationById = async (req, res) => {
    try {
        const storageLocation = await StorageLocation.findOne({ storageLocationId: req.params.id });
        if (!storageLocation) return res.status(404).json({ error: 'Storage location not found' });
        res.status(200).json(storageLocation);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Update a storage location
exports.updateStorageLocation = async (req, res) => {
    try {
        const updatedStorageLocation = await StorageLocation.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        if (!updatedStorageLocation) return res.status(404).json({ error: 'Storage location not found' });
        res.status(200).json(updatedStorageLocation);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Delete a storage location
exports.deleteStorageLocation = async (req, res) => {
    try {
        const deletedStorageLocation = await StorageLocation.findByIdAndDelete(req.params.id);
        if (!deletedStorageLocation) return res.status(404).json({ error: 'Storage location not found' });
        res.status(200).json(deletedStorageLocation);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
