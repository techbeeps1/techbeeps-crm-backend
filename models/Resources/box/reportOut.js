
const mongoose = require("mongoose");

const reportOutSchema = new mongoose.Schema({
  customer: String,
  date: String,
  number: Number,
  job: String,
  boxId: String,
  materialId: String,
});

module.exports = mongoose.model("reportOut", reportOutSchema);
