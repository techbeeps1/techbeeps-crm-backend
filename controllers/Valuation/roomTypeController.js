const RoomType = require('../../models/Valuation/roomTypeModel');
const mongoose = require('mongoose');

// Get all room types
exports.getAllRoomTypes = async (req, res) => {
    try {
        const roomTypes = await RoomType.find() .populate('furnitureType') // Populate furnitureType
        res.status(200).json(roomTypes);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Get a room type by ID
exports.getRoomTypeById = async (req, res) => {
    try {
        const roomType = await RoomType.findById(req.params.roomTypeId).populate('furnitureType')
        if (!roomType) return res.status(404).json({ error: 'RoomType not found' });
        res.status(200).json(roomType);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Create a new room type
exports.createRoomType = async (req, res) => {
    const { roomTypeId, roomTypeName, icon, weight, furnitureType } = req.body;
    try {
        const newRoomType = new RoomType({
            roomTypeName,
            icon,
            weight,
            furnitureType,
        });
        await newRoomType.save();
        res.status(201).json(newRoomType);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Update a room type
exports.updateRoomType = async (req, res) => {
    const { roomTypeId } = req.params;
    try {
        const updatedRoomType = await RoomType.findByIdAndUpdate(roomTypeId, req.body,
            { new: true }
        );
        if (!updatedRoomType) return res.status(404).json({ error: 'RoomType not found' });
        res.status(200).json(updatedRoomType);
    } catch (error) {
        res.status(400).json({ error: error.message });
        console.log(error);
    }
};


exports.addFurnitureInRoom = async (req, res) => {
    const { roomTypeId } = req.params;
    const { furnitureTypeIds } = req.body; // Expecting an array of ObjectId strings from the frontend
    try {
        const room = await RoomType.findById(roomTypeId);
        if (!room) {
            return res.status(404).json({ error: 'Room not found' });
        }
        if (!Array.isArray(furnitureTypeIds) || 
            !furnitureTypeIds.every(id => mongoose.Types.ObjectId.isValid(id))) {
            return res.status(400).json({ error: 'Invalid furnitureTypeIds array' });
        }
        const updatedRoomType = await RoomType.findByIdAndUpdate(
            roomTypeId,
            {
                $addToSet: { furnitureType: { $each: furnitureTypeIds } } // Add without duplicates
            },
            { new: true } // Return the updated document
        );
        res.status(200).json(updatedRoomType);
    } catch (error) {
        res.status(400).json({ error: error.message });
        console.error(error);
    }
};
exports.removeFurnitureFromRoom = async (req, res) => {
    const { roomTypeId } = req.params;
    const { furnitureTypeIds } = req.body; // Expecting an array of ObjectId strings from the frontend
    try {
        const room = await RoomType.findById(roomTypeId);
        if (!room) {
            return res.status(404).json({ error: 'Room not found' });
        }
        if (!Array.isArray(furnitureTypeIds) || 
            !furnitureTypeIds.every(id => mongoose.Types.ObjectId.isValid(id))) {
            return res.status(400).json({ error: 'Invalid furnitureTypeIds array' });
        }
        const updatedRoomType = await RoomType.findByIdAndUpdate(
            roomTypeId,
            {
                $pull: { furnitureType: { $in: furnitureTypeIds } } // Remove the specified ObjectId(s)
            },
            { new: true } // Return the updated document
        );
        res.status(200).json(updatedRoomType);
    } catch (error) {
        res.status(400).json({ error: error.message });
        console.error(error);
    }
};

// Delete a room type
exports.deleteRoomType = async (req, res) => {
    try {
        const deletedRoomType = await RoomType.findByIdAndDelete( req.params.roomTypeId );
        if (!deletedRoomType) return res.status(404).json({ error: 'RoomType not found' });
        res.status(200).json({ message: 'RoomType deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
