const { ObjectId } = require("mongodb");
const mongoose = require("mongoose");

const logCommunicationSchema = new mongoose.Schema(
  {
    communicationType: String,
    sender: String,
    date: Date,
    message: String,
    customerId: ObjectId,
    financeId: ObjectId,
    invoiceId:ObjectId
  },
  { timestamps: true }
);

module.exports = mongoose.model("logCommunication", logCommunicationSchema);
