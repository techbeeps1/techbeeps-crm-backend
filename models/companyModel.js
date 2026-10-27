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
  kvkNumber: { type: String },
  btwNumber: { type: String },
  bankName: { type: String, default: 'ABN AMRO Bank' },
  iban: { type: String, default: 'NL91 ABNA 0417 1643 00' },
  bic: { type: String, default: 'ABNANL2A' },
  logoUrl: { type: String },
});

module.exports = mongoose.model('CompanyDetails', companyDetailsSchema);
