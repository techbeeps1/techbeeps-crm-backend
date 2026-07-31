// models/RoomType.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const furnitureSchema = new Schema({
    quantity: {
        type: Number,
    },
    cubicMeter: {
        type: Number,
    },
    furnitureTypeName: {
        type: String,
    },
    icon: {
        type: String,
    },
});

const roomTypeSchema = new Schema({
    jobId:{
        type:mongoose.Schema.Types.ObjectId,
        ref: 'jobSchedule',
    },
    roomId:String,
    roomTypeName: {
        type: String,
    },
    name: {
        type: String,
    },
    icon: {
        type: String,
    },
    furnitureType: [furnitureSchema],
    inventoryItems: [
        {
            name: { type: String },
            quantity: { type: Number },
            price: { type: Number },
            cubicMeter: { type: Number },
            
        }
    ],
    assembledItems: [
        {
            furnitureTypeName: { type: String },
            cubicMeter: { type: Number },
            isDisassambled:Boolean,
            _id:String,
            checked:Boolean,

        }

    ],
    dismantledItems: [
        {
            furnitureTypeName: { type: String },
            cubicMeter: { type: Number },
             isDisassambled:Boolean,
            _id:String,
            checked:Boolean,
        }
    ],
    storageItems: [
        {
            furnitureTypeName: { type: String },
            cubicMeter: { type: Number }
        }
    ]
});

module.exports = mongoose.model('ValuationRooms', roomTypeSchema);
