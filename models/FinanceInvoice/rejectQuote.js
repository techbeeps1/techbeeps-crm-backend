const { ObjectId } = require("mongodb");
const mongoose = require("mongoose");

const rejectQuoteSchema = new mongoose.Schema(
  {
    financeId: ObjectId,
    cancelProject: String,
    reason: String
  },
  { timestamps: true }
);

module.exports = mongoose.model("rejectQuote", rejectQuoteSchema);