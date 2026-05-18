const mongoose = require('mongoose');

const serviceTypeSchema = new mongoose.Schema({
    serviceName: {
        type: String,
        required: true,
        unique: true,
    },
    serviceTypeName: {
        type: String,
        required: true,
    },
    type: {
        type: String,
        default: 'service'
    },
    icon: {
        type: String,
    },
    price: {
        type: Number,
        default: 0,
    },
    weight: {
        type: Number,
        default: 0,
    }
}, { timestamps: true });

module.exports = mongoose.model('ServiceType', serviceTypeSchema);
