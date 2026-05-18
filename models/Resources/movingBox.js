const mongoose = require('mongoose');

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
    length: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
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
  this.cubicMeter = (this.height * this.width * this.length) / 1000000;
  next();
});

module.exports = mongoose.model('MovingBox', MovingBoxSchema);
