const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  supplier: String,
  date: Date,
  number: Number,
  boxId: String,
  materialId: String
},{timestamps:true}
);

module.exports = mongoose.model("order", orderSchema);
