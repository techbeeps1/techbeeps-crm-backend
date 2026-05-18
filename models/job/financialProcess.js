const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const FixedAmountDataSchema = new Schema({
  id: { type: String, required: true },
  salesGroup: String,
  description: String,
  number: String,
  btw: String,
  unitPrice: Number,
});

const percentageDataSchema = new Schema({
  id: { type: String, required: true },
  salesGroup: String,
  description: String,
  percentage: String,
});

const AcceptanceJobDataSchema = new Schema({
  package: String,
  financialTemplate: String,
  discountDescription: String,
  percentage: String,
  isVATIncluded: Boolean,
  onTheInvoice: String,
  taskTime: String,
  fixedAmountData: [FixedAmountDataSchema],
  percentageData: [percentageDataSchema],
});

const startJobDataSchema = new Schema({
  financialTemplate: String,
  discountDescription: String,
  percentage: String,
  isVATIncluded: Boolean,
  onTheInvoice: String,
  taskTime: String,
  fixedAmountData: [FixedAmountDataSchema],
  percentageData: [percentageDataSchema],
});

const storageLoadedDataSchema = new Schema({
  financialTemplate: String,
  discountDescription: String,
  percentage: String,
  isVATIncluded: Boolean,
  onTheInvoice: String,
  taskTime: String,
  fixedAmountData: [FixedAmountDataSchema],
  percentageData: [percentageDataSchema],
});

const lastAppointmentDataSchema = new Schema({
  financialTemplate: String,
  discountDescription: String,
  percentage: String,
  isVATIncluded: Boolean,
  onTheInvoice: String,
  taskTime: String,
  fixedAmountData: [FixedAmountDataSchema],
  percentageData: [percentageDataSchema],
});

const FinancialProcessSchema = new Schema({
  jobId: { type: mongoose.Schema.Types.ObjectId, required: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, required: true },
  acceptanceJobData: AcceptanceJobDataSchema,
  startJobData: startJobDataSchema,
  storageLoadedData: storageLoadedDataSchema,
  lastAppointmentData: lastAppointmentDataSchema,
});

const FinancialProcess = mongoose.model(
  "FinancialProcess",
  FinancialProcessSchema
);

module.exports = FinancialProcess;
