const mongoose = require("mongoose");

const receivedInventorySchema = new mongoose.Schema({
  supplier: String,
  date: String,
  number: Number,
  boxId:String,
  materialId:String,
});

module.exports = mongoose.model("receivedInventory", receivedInventorySchema);