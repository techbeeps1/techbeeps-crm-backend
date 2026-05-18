const mongoose = require('mongoose');

const companyDetailsSchema = new mongoose.Schema({
  companyName: { type: String},
  companyAddress: { type: String},
  companyState: { type: String },
  companyCountry: { type: String },
  companyEmail: { type: String },
  companyPhone: { type: String },
  companyWebsite: { type: String },
  companyTaxNumber: { type: String },
  companyVatNumber: { type: String },
  companyRegNumber: { type: String },
});

module.exports = mongoose.model('CompanyDetails', companyDetailsSchema);
