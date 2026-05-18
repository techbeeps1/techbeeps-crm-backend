const mongoose = require('mongoose');

// Maintenance Schema
const MaintenanceSchema = new mongoose.Schema({
  dealer: { type: String },
  leasingCompany: { type: String },
  nextInspection: { type: Date, default: null },
  maintenanceRequired: { type: Date, default: null },
});

// Fuel Card Schema
const FuelCardSchema = new mongoose.Schema({
  supplier: { type: String},
  cardNumber: { type: String, match: /^[0-9]{16}$/ },
  cvc: { type: String, match: /^[0-9]{3}$/ },
  pincode: { type: String, match: /^[0-9]{5,6}$/ },
});

// Vehicle Schema
const VehicleSchema = new mongoose.Schema({
  requiredLicense: { type: [String]},
  vehicleType: { type: String},
  name: { type: String},
  pricePerKilometer: { type: Number },
  pricePerHour: { type: Number },
  licensePlate: { type: String },
  model: { type: String},
  fuelType: { type: String},
  transmissionType: { type: String},
  purchasingDate: { type: Date },
  isTowBar: { type: Boolean, default: false },
  floors :{type:Number},
  length: { type: Number },
  width: { type: Number},
  height: { type: Number},
  contents: { type: Number },
  tailLiftLength: { type: Number},
  drawWeight: { type: Number },
  maintenance: { type: MaintenanceSchema },
  fuelCard: { type: FuelCardSchema},
}, { timestamps: true });

module.exports = mongoose.model('Vehicle', VehicleSchema);
