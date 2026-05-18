const mongoose = require('mongoose');

const extraFieldSchema = new mongoose.Schema({
    label: { type: String},
    name: { type: String},
    type: { type: String},
    required: { type: Boolean, default: false }
});

const InputSchema = new mongoose.Schema({
    inputFor:{type: String},
    name: { type: String},
    extraFields: [extraFieldSchema]
});

const Inputs = mongoose.model('Inputs', InputSchema);

module.exports = Inputs;
