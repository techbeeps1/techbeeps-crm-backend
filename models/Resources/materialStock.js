const mongoose = require('mongoose');

const stockSchema = new mongoose.Schema({
    supplier: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Supplier',
        required: true
    },
    material: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MovingBox', 
        required: true
    },
    receivedOn: {
        type: Date,default:new Date()
    },
    quantity: {
        type: Number, 
    },
    orderOn:{
        type:Date,default:new Date()
    },
    orderQuantity: {
        type: Number,
    },
    type:{
        type: String, default : 'Order'
    }
}, { timestamps: true });

module.exports = mongoose.model('MaterialStock', stockSchema);
