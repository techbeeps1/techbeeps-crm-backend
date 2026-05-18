const mongoose = require("mongoose");

const reportingSchema = new mongoose.Schema({
  htmlDesign: {
    type: Object,
    required: true,
  },
  name: {
    type: String,
  },
  htmlContent: {
    type: String,
  },
  link_template: {
    type: String
  },
  documentType: {
    type: String,
  },
  status:{
    type: String,
    default: 'Enable'
  }
});

module.exports = mongoose.model("reporting", reportingSchema);