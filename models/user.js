const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'Staff' },
  gender: { type: String },
  language: { type: String },
  dob: { type: Date },
  telephone: { type: String },
  postCode: { type: String },
  houseNumber: { type: String },
  addition: { type: String },
  street: { type: String },
  city: { type: String },
  country: { type: String },
  inservice: { type: Date },
  outofservice: { type: Date },
  trailPeriod: { type: Number },
  contract: {
    startDate: { type: Date },
    endDate: { type: Date },
    type: { type: String },
    hourlyWage: { type: Number },
    hoursWeek: { type: Number },
    daysWeek: { type: String },
  },
  drivingLicense: { type: [String] },
  skills: { type: [String] },
  access: {
  type: [String],
  default: ['Dashboard']
},
  documentNumber: { type: String },

}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
