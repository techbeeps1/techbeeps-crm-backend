const ServiceType = require('../../models/Valuation/serviceTypeModel');

// Get all service types
exports.getAllServiceTypes = async (req, res) => {
    try {
        const serviceTypes = await ServiceType.find().sort({ serviceTypeName: 1 }); // Sort by serviceTypeName
        res.status(200).json(serviceTypes);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Create a new service type
exports.createServiceType = async (req, res) => {
    const {serviceName, serviceTypeName ,icon ,price ,weight } = req.body;
    try {
        const newServiceType = new ServiceType({serviceName, serviceTypeName, icon,price,weight });
        await newServiceType.save();
        res.status(201).json(newServiceType);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Update a service type
exports.updateServiceType = async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    try {
        const updatedServiceType = await ServiceType.findByIdAndUpdate(id, updates, { new: true });
        if (!updatedServiceType) {
            return res.status(404).json({ error: 'Service type not found' });
        }
        res.status(200).json(updatedServiceType);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Delete a service type
exports.deleteServiceType = async (req, res) => {
    const { id } = req.params;
    try {
        const deletedServiceType = await ServiceType.findByIdAndDelete(id);
        if (!deletedServiceType) {
            return res.status(404).json({ error: 'Service type not found' });
        }
        res.status(200).json({ message: 'Service type deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
