const Package = require('../models/PackageModel');
const JobSchedule = require('../models/jobSchedule');

// Create a new package
exports.createPackage = async (req, res) => {
    try {
        const newPackage = new Package(req.body);
        const savedPackage = await newPackage.save();
        return res.status(201).json(savedPackage);
    } catch (error) {
        console.error('Error creating package:', error);
        return res.status(500).json({ message: 'Error creating package', error: error.message });
    }
};

// Get all packages (excluding job-specific custom packages by default)
exports.getAllPackages = async (req, res) => {
    const { type, priceAgree, withJob, includeJobSpecific } = req.query;
    const filter = {};

    // Do not leak job-specific clones into master package catalog unless explicitly requested
    if (includeJobSpecific !== 'true' && includeJobSpecific !== true) {
        filter.isJobSpecific = { $ne: true };
    }

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
        const packageDoc = await Package.findById(req.params.id);
        if (!packageDoc) {
            return res.status(404).json({ message: 'Package not found' });
        }
        return res.status(200).json(packageDoc);
    } catch (error) {
        return res.status(500).json({ message: 'Error fetching package', error: error.message });
    }
};

// Update a package by ID (Guards against master package overwrite when modifying from a Job)
exports.updatePackage = async (req, res) => {
    try {
        const packageDoc = await Package.findById(req.params.id);
        if (!packageDoc) {
            return res.status(404).json({ message: 'Package not found' });
        }

        const jobId = req.body.jobId || req.query.jobId;

        // If editing finance rules in the context of a Job:
        if (jobId) {
            const job = await JobSchedule.findById(jobId);
            if (job) {
                // If package is a shared master package, fork it to avoid mutating master template
                if (!packageDoc.isJobSpecific) {
                    const clonedData = packageDoc.toObject();
                    delete clonedData._id;
                    delete clonedData.createdAt;
                    delete clonedData.updatedAt;

                    clonedData.name = `${packageDoc.name} (Job #${job.index || job._id})`;
                    clonedData.isJobSpecific = true;
                    clonedData.jobId = job._id;

                    // Apply updates to the newly cloned document
                    Object.keys(req.body).forEach((key) => {
                        if (key !== 'jobId') {
                            clonedData[key] = req.body[key];
                        }
                    });

                    const newJobPackage = new Package(clonedData);
                    const savedJobPackage = await newJobPackage.save();

                    // Re-link the job to its isolated job-specific package
                    job.package = savedJobPackage._id;
                    await job.save();

                    return res.status(200).json({
                        message: 'Created isolated job-specific package without overwriting master template',
                        cloned: true,
                        package: savedJobPackage,
                        ...savedJobPackage.toObject(),
                    });
                } else {
                    // Already an isolated job-specific package; safe to update in-place
                    Object.keys(req.body).forEach((key) => {
                        if (key !== 'jobId') {
                            packageDoc[key] = req.body[key];
                            packageDoc.markModified(key);
                        }
                    });
                    const updatedPackage = await packageDoc.save();
                    return res.status(200).json({
                        message: 'Updated job-specific package',
                        cloned: false,
                        package: updatedPackage,
                        ...updatedPackage.toObject(),
                    });
                }
            }
        }

        // Standard master package update (Admin editing in Methods -> Packages)
        Object.keys(req.body).forEach((key) => {
            if (key !== 'jobId') {
                packageDoc[key] = req.body[key];
                packageDoc.markModified(key);
            }
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
