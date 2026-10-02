const SalesGroup = require('../models/salesgroupModel');
const AppSettings = require('../models/appSettingModel');

exports.addSalesGroup = async (req, res) => {
    try {
        const { name, type, code, surcharge } = req.body;
        if (type !== 'tax') {
            const existingGroup = await SalesGroup.findOne({ name, type });
            if (existingGroup) {
                return res.status(400).json({ message: 'item with this name and type already exists' });
            }
        }
        const surchargeVal = surcharge !== undefined && surcharge !== '' ? Number(surcharge) || 0 : 0;
        const salesGroup = new SalesGroup({ name, type, code, surcharge: surchargeVal });
        await salesGroup.save();

        if (type === 'property') {
            const appSettings = await AppSettings.findOne();
            if (appSettings) {
                if (!appSettings.standardPrice) appSettings.standardPrice = {};
                if (!appSettings.standardPrice.propertySurcharges) appSettings.standardPrice.propertySurcharges = {};
                appSettings.standardPrice.propertySurcharges[name] = surchargeVal;
                appSettings.markModified('standardPrice');
                await appSettings.save();
            }
        }

        res.status(201).json({ message: 'Sales group added successfully', data: salesGroup });
    } catch (error) {
        res.status(500).json({ message: 'Error adding sales group', error });
    }
};

exports.getSalesGroups = async (req, res) => {
    try {
        const { type } = req.query; // Extract 'type' from query parameters
        const filter = type ? { type } : {};
        const salesGroups = await SalesGroup.find(filter).sort({name: 1}); // Sort by name in ascending order

        if (type === 'property') {
            const appSettings = await AppSettings.findOne();
            const surcharges = appSettings?.standardPrice?.propertySurcharges || {};
            const enriched = salesGroups.map(sg => {
                const doc = sg.toObject();
                if (doc.surcharge === undefined || doc.surcharge === 0) {
                    doc.surcharge = surcharges[doc.name] ?? 0;
                }
                return doc;
            });
            return res.status(200).json(enriched);
        }

        res.status(200).json(salesGroups);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching sales groups', error });
    }
};


exports.updateSalesGroup = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, code, surcharge } = req.body;
        const updateData = { name, code };
        if (surcharge !== undefined && surcharge !== '') {
            updateData.surcharge = Number(surcharge) || 0;
        }
        const salesGroup = await SalesGroup.findByIdAndUpdate(id, updateData, { new: true });
        if (!salesGroup) {
            return res.status(404).json({ message: 'Sales group not found' });
        }

        if (salesGroup.type === 'property') {
            const appSettings = await AppSettings.findOne();
            if (appSettings) {
                if (!appSettings.standardPrice) appSettings.standardPrice = {};
                if (!appSettings.standardPrice.propertySurcharges) appSettings.standardPrice.propertySurcharges = {};
                appSettings.standardPrice.propertySurcharges[salesGroup.name] = Number(salesGroup.surcharge) || 0;
                appSettings.markModified('standardPrice');
                await appSettings.save();
            }
        }

        res.status(200).json({ message: 'Sales group updated successfully', data: salesGroup });
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

        if (salesGroup.type === 'property') {
            const appSettings = await AppSettings.findOne();
            if (appSettings && appSettings.standardPrice && appSettings.standardPrice.propertySurcharges) {
                delete appSettings.standardPrice.propertySurcharges[salesGroup.name];
                appSettings.markModified('standardPrice');
                await appSettings.save();
            }
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

