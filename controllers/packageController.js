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
    const { type ,priceAgree} = req.query;
    const filter = {};
    if (type) {
        filter.type_job = type;
    }
    if (priceAgree) {
        filter.priceAgree = priceAgree;
    }
    try {
        const packages = await Package.find(filter);
        return res.status(200).json(packages);
    } catch (error) {
        return res.status(500).json({ message: 'Error fetching packages', error });
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
        const updatedPackage = await Package.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedPackage) {
            return res.status(404).json({ message: 'Package not found' });
        }
        return res.status(200).json(updatedPackage);
    } catch (error) {
        return res.status(500).json({ message: 'Error updating package', error });
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
