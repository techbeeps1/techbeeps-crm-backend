
const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
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
  _id: false
});

const relocationSchema = new mongoose.Schema({
  relocation_totalVolume: { type: Number, default: 0 },
  relocation_pricePerMeterCubic: { type: Number, default: 0 },
  relocation_requiredHours: { type: Number, default: 0 },
  relocation_movers: { type: Number, default: 0 },
  relocation_travelTime: { type: Number, default: 0 },
  relocation_pricePerHour: { type: Number, default: 0 },
  relocation_distance: { type: Number, default: 0 },
  relocation_pricePerKilometer: { type: Number, default: 0 },
  relocation_totalBoxes: { type: Number, default: 0 },
  movingLift_quantity: { type: Number, default: 0 },
  movingLift_price: { type: Number, default: 0 },
  packing_requiredHours: { type: Number, default: 0 },
  packing_appliedPrice: { type: Number, default: 0 },
  packing_requiredPackers: { type: Number, default: 0 },
  unpacking_requiredHours: { type: Number, default: 0 },
  unpacking_appliedPrice: { type: Number, default: 0 },
  unpacking_requiredPackers: { type: Number, default: 0 },
  assembling_requiredHours: { type: Number, default: 0 },
  assembling_appliedPrice: { type: Number, default: 0 },
  assembling_requiredHandyman: { type: Number, default: 0 },
  certificate_quantity: { type: Number, default: 0 },
  certificate_price: { type: Number, default: 0 },
  disassembling_requiredHours: { type: Number, default: 0 },
  disassembling_appliedPrice: { type: Number, default: 0 },
  disassembling_requiredHandyman: { type: Number, default: 0 },
  storage_storageVolume: { type: Number, default: 0 },
  storage_appliedPrice: { type: Number, default: 0 },
  storage_additionCharges: { type: Number, default: 0 },
  insurance_quantity: { type: Number, default: 0 },
  insurance_price: { type: Number, default: 0 },
  total_handyman: { type: Number, default: 0 },
  _id: false
});


const jodScheduleSchema = new mongoose.Schema({
  status: { type: String, default: "Pending" },
  index: { type: String },
  date: { type: Date, default: Date.now },
  load: { type: addressSchema },
  unload: { type: addressSchema },
  services: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ServiceType' }],
  knownAddress: { type: Boolean, default: false },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  package: { type: mongoose.Schema.Types.ObjectId, ref: 'package' },
  offer: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Finance' }],
  invoice: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' }],
  materials: [
    {
      material: { type: mongoose.Schema.Types.ObjectId, ref: 'MovingBox' },
      quantity: { type: Number, required: true, min: 1 },
      _id: false
    }
  ],
  relocation: { type: relocationSchema },
}, { timestamps: true });

jodScheduleSchema.pre('save', async function () {
  if (!this.isNew) return;

  const currentYear = new Date().getFullYear();

  const lastJob = await this.constructor
    .findOne({
      index: new RegExp(`^${currentYear}/`)
    })
    .sort({ createdAt: -1 });

  const lastIndex = lastJob?.index
    ? parseInt(lastJob.index.split('/')[1], 10)
    : 0;

  this.index = `${currentYear}/${String(lastIndex + 1).padStart(4, '0')}`;
});

module.exports = mongoose.model("jobSchedule", jodScheduleSchema);

