const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
    addressType:{type: String,default:'head'},
    postcode: { type: String },
    houseNumber: { type: String },
    addition: { type: String, default: '' },
    street: { type: String },
    city: { type: String },
    floor: { type: String, default: '' },
    hasElevator: { type: Boolean, default: false },
    deliveringBoxes: { type: Boolean, default: false },
    placingSigns: { type: Boolean, default: false },
    applyForPermit: { type: Boolean, default: false },
    country: { type: String },
    typeOfProperty: { type: String },
    distanceToLift: { type: String },
    distanceToApartment: { type: String },
});

const Address = mongoose.model('Address', addressSchema);

module.exports = Address;
