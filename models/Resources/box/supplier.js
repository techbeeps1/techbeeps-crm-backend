const mongoose = require("mongoose");

const supplierSchema = new mongoose.Schema({
    companyName:String,
    website: String,
    purchase: Number,
    fname: String,
    infix: String,
    lname: String,
    email: String,
    telephone: String,
    mobile: String,
    postCode: String,
    houseNumber: String,
    addition: String,
    street: String,
    city: String,
    selectedCountry: String,
    boxId: String,
    materialId: String,
    selectedSupplier: String
});

module.exports = mongoose.model("Supplier", supplierSchema);
