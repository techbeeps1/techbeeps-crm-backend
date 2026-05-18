const mongoose = require("mongoose");
const customer = require('../customer')

const sendQuoteSchema = new mongoose.Schema(
  {
    address:{},
    contactPerson:{},
    discount: String,
    employeeId: String,
    expiresAt: Date,
    rules:String,
    // finishQuote: Boolean,
    movingHours: String,
    isVatIncluded: Boolean,
    IgnoreZeroQuantityLines: Boolean,
    jobId: String,
    templateId: String,
    totalIncludingVat:{},
    relationId : String, // relation Id specify the connection with job and customer that is customer Id
  },
  { timestamps: true }
);

module.exports = mongoose.model("sendQuoteToCustomer", sendQuoteSchema);
