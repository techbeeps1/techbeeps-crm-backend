const { ObjectId } = require("mongodb");
const mongoose = require("mongoose");

const sendQuoteSchema = new mongoose.Schema(
  {
    expirationDate: Date,
    additionalEmail: String,
    financeId: ObjectId,
  },
  { timestamps: true }
);

module.exports = mongoose.model("sendQuote", sendQuoteSchema);
