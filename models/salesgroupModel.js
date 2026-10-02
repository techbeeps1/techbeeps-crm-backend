const mongoose = require('mongoose');

const salesGroupSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    type: {
        type: String,
    },
    code: {
        type: String,
    },
    surcharge: {
        type: Number,
        default: 0,
    }
}, { timestamps: true });

module.exports = mongoose.model('SalesGroup', salesGroupSchema);
