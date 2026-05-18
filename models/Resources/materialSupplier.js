// models/Supplier.js
const mongoose = require("mongoose");

const supplierSchema = new mongoose.Schema({
  name: { type: String, required: true },
  website: { type: String },
  firstName: { type: String, required: true },
  lastName: { type: String },
  phoneNumber: { type: String },
  mobileNumber: { type: String },
  emailAddress: { type: String, required: true, unique: true },
  houseNumber: { type: String },
  streetName: { type: String },
  addition: { type: String },
  zipCode: { type: String },
  country: { type: String },
  city: { type: String },
}, { timestamps: true });

module.exports = mongoose.model("Supplier", supplierSchema);
