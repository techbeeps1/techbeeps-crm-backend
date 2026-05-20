const mongoose = require('mongoose');

const furnitureTypeSchema = new mongoose.Schema(
    {
        furnitureTypeName: {
            type: String,
           
        },
        cubicMeter: {
            type: Number,
            default: 0,
        },
        icon: {
            type: String
        },
        servicesPossible: {
            type: Boolean,
            default: true,
        },
        isDisassambled: {
            type: Boolean,
        },
        iconFileName: {
            type: String,
        },
        type: {
            type: String,
            default: "furniture",
        },
        variant:[
            {type: Object}
        ],
        weight:{
            type: Number,
            default: 0,
        },
        price:{
            type: Number,
            default: 0,
        }
    },
    { timestamps: true } // Adds createdAt and updatedAt fields automatically
);

module.exports = mongoose.model("FurnitureType", furnitureTypeSchema);
