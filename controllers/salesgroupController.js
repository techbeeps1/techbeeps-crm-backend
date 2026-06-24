const SalesGroup = require('../models/salesgroupModel');

exports.addSalesGroup = async (req, res) => {
    try {
        const { name, type, code } = req.body;
        if (type !== 'tax') {
            const existingGroup = await SalesGroup.findOne({ name, type });
            if (existingGroup) {
                return res.status(400).json({ message: 'item with this name and type already exists' });
            }
        }
        const salesGroup = new SalesGroup({ name, type, code });
        await salesGroup.save();
        res.status(201).json({ message: 'Sales group added successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error adding sales group', error });
    }
};

exports.getSalesGroups = async (req, res) => {
    try {
        const { type } = req.query; // Extract 'type' from query parameters
        const filter = type ? { type } : {};
        const salesGroups = await SalesGroup.find(filter).sort({name: 1}); // Sort by name in ascending order
        res.status(200).json(salesGroups);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching sales groups', error });
    }
};


exports.updateSalesGroup = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, code } = req.body;
        const salesGroup = await SalesGroup.findByIdAndUpdate(id, { name, code }, { new: true });
        if (!salesGroup) {
            return res.status(404).json({ message: 'Sales group not found' });
        }
        res.status(200).json({ message: 'Sales group updated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating sales group', error });
    }
};

exports.deleteSalesGroup = async (req, res) => {
    try {
        const { id } = req.params;
        const salesGroup = await SalesGroup.findByIdAndDelete(id);
        if (!salesGroup) {
            return res.status(404).json({ message: 'Sales group not found' });
        }
        res.status(200).json({ message: 'Sales group deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting sales group', error });
    }
};

exports.addMultipleSalesGroups = async (req, res) => {
    try {
        const salesGroupsArray = req.body;
        if (!salesGroupsArray.length) {
            return res.status(400).json({ message: 'Input should be a non-empty array of sales groups' });
        }
        const salesGroupsWithCountry = salesGroupsArray.map(group => ({
            ...group,
            type: 'country'
        }));
        const duplicateCheckPromises = salesGroupsWithCountry.map(group =>
            SalesGroup.findOne({ name: group.name, type: group.type })
        );
        const existingGroups = await Promise.all(duplicateCheckPromises);
        const newGroups = salesGroupsWithCountry.filter((group, index) => !existingGroups[index]);
        const insertedGroups = await SalesGroup.insertMany(newGroups);
        res.status(201).json({
            message: 'Sales groups added successfully',
            insertedGroups,
        });
    } catch (error) {
        res.status(500).json({ message: 'Error adding sales groups', error });
    }
};

