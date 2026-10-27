const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g. "invoice_TEST-INV-2026_invoice" or "invoice_2026_invoice"
  seq: { type: Number, default: 0 },
}, { timestamps: true });

const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

module.exports = Counter;
