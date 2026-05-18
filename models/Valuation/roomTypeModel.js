const mongoose = require('mongoose');

const roomTypeSchema = new mongoose.Schema(
    {
        roomTypeName: { type: String, required: true },
        icon: {
            type: String,
        },
        weight: { type: Number, default: 0 },
        furnitureType: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'FurnitureType',
            },
        ],
    },
    { timestamps: true }
);

module.exports = mongoose.model('RoomType', roomTypeSchema);
