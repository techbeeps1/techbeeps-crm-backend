const mongoose = require('mongoose');

const iconSchema = new mongoose.Schema({
    name: { type: String, required: true },
    svg: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Icon', iconSchema);
