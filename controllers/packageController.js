const Package = require('../models/PackageModel'); // Adjust the path according to your project structure

// Create a new package
exports.createPackage = async (req, res) => {
    try {
        const newPackage = new Package(req.body);
        console.log(newPackage)
        const savedPackage = await newPackage.save();
        return res.status(201).json(savedPackage);
    } catch (error) {
        console.log(error)
        return res.status(500).json({ message: 'Error creating package', error });
    }
};

// Get all packages
exports.getAllPackages = async (req, res) => {
    const { type, priceAgree, withJob } = req.query;
    const filter = {};
    if (type) {
        if (type === 'Manual/No job') {
            filter.type_job = { $in: ['Manual/No job', '', null] };
        } else {
            filter.type_job = type;
        }
    }
    if (withJob === 'true' || withJob === true) {
        filter.type_job = { $nin: ['Manual/No job', '', null] };
    } else if (withJob === 'false' || withJob === false) {
        filter.type_job = { $in: ['Manual/No job', '', null] };
    }
    if (priceAgree) {
        const cleanAgree = String(priceAgree).toLowerCase();
        if (cleanAgree.includes('hour')) {
            filter.$or = [
                { priceAgree: { $regex: /hour/i } },
                { priceAgree: 'onhourly_basis' },
            ];
        } else if (cleanAgree.includes('fix')) {
            if (withJob === 'true' || withJob === true) {
                filter.$or = [
                    { priceAgree: { $regex: /fix/i } },
                    { priceAgree: 'fixed_price' },
                ];
            } else {
                filter.$or = [
                    { priceAgree: { $regex: /fix/i } },
                    { priceAgree: 'fixed_price' },
                    { priceAgree: { $exists: false } },
                    { priceAgree: null },
                    { priceAgree: '' },
                ];
            }
        } else {
            filter.priceAgree = priceAgree;
        }
    }
    try {
        const packages = await Package.find(filter);
        return res.status(200).json(packages);
    } catch (error) {
        return res.status(500).json({ message: 'Error fetching packages', error: error.message });
    }
};


// Get a package by ID
exports.getPackageById = async (req, res) => {
    try {
        const package = await Package.findById(req.params.id);
        if (!package) {
            return res.status(404).json({ message: 'Package not found' });
        }
        return res.status(200).json(package);
    } catch (error) {
        return res.status(500).json({ message: 'Error fetching package', error });
    }
};

// Update a package by ID
exports.updatePackage = async (req, res) => {
    try {
        const packageDoc = await Package.findById(req.params.id);
        if (!packageDoc) {
            return res.status(404).json({ message: 'Package not found' });
        }
        Object.keys(req.body).forEach((key) => {
            packageDoc[key] = req.body[key];
            packageDoc.markModified(key);
        });
        const updatedPackage = await packageDoc.save();
        return res.status(200).json(updatedPackage);
    } catch (error) {
        console.error('Error updating package:', error);
        return res.status(500).json({ message: 'Error updating package', error: error.message });
    }
};

// Delete a package by ID
exports.deletePackage = async (req, res) => {
    try {
        const deletedPackage = await Package.findByIdAndDelete(req.params.id);
        if (!deletedPackage) {
            return res.status(404).json({ message: 'Package not found' });
        }
        return res.status(200).json({ message: 'Package deleted successfully' });
    } catch (error) {
        return res.status(500).json({ message: 'Error deleting package', error });
    }
};
