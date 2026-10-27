const mongoose = require('mongoose');
const { validateBoxDimensions } = require('../../utils/labourCalculator');

const inventorySupplierSchema = new mongoose.Schema({
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Supplier",
  },
  purchasePrice: {
    type: Number,
  },
}, { _id: false });

const MovingBoxSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    length: { type: Number, required: true, min: [0.001, 'Length must be greater than 0'] },
    width: { type: Number, required: true, min: [0.001, 'Width must be greater than 0'] },
    height: { type: Number, required: true, min: [0.001, 'Height must be greater than 0'] },
    cubicMeter: { type: Number },
    weight: { type: Number, default: 0 },
    movingBox: { type: Boolean, default: true },
    inventoryType: { type: String, default: "Box" },
    rentalPrice: { type: Number },
    sellingPrice: { type: Number },
    status: { type: String, default: "InStock" },
    inventorySuppliers: [inventorySupplierSchema],
    expiresAt: { type: Date, default: null },
    currentStock:{type:Number, default: 0},
    outstanding: { type: Number, default:0}
  }
);

MovingBoxSchema.pre('save', function (next) {
  const validation = validateBoxDimensions({
    length: this.length,
    width: this.width,
    height: this.height,
  });
  if (!validation.valid) {
    const err = new Error(validation.error);
    if (typeof next === 'function') return next(err);
    throw err;
  }
  this.cubicMeter = (this.height * this.width * this.length) / 1000000;
  if (typeof next === 'function') next();
});

module.exports = mongoose.model('MovingBox', MovingBoxSchema);
