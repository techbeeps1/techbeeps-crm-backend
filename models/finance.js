const mongoose = require("mongoose");
// const { isString } = require("puppeteer");
// const { schema } = require("./appointmentModel");
const Schema = mongoose.Schema;

const dynamicSchema = new mongoose.Schema({
  dynamicFields: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },
}, { strict: false });

const financeSchema = new mongoose.Schema({
  index: { type: String },
  customer: {
    type: Schema.Types.ObjectId,
    ref: 'Customer',
  },
  contactPerson: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  package: {
    type: Schema.Types.ObjectId,
    ref: 'package',
  },
  financialTemplate: {
    type: Schema.Types.ObjectId,
    ref: 'DocumentTemplate',
  },
  job: {
    type: Schema.Types.ObjectId,
    ref: 'jobSchedule',
  },
  btw: { type: String },
  reference: { type: String },
  discount: { type: Number, default: 0 },
  discountedPrice:{type: Number,default: 0 },
  discount_description: { type: String },
  year: { type: Number, default: new Date().getFullYear() },
  Status: { type: String, default: 'Draft' },
  note: { type: String },
  ignoreRules: { type: String },
  jobinput: { type: dynamicSchema, default: {} },
  items: [{
    salesgroup: {
      type: Schema.Types.ObjectId,
      ref: 'SalesGroup',
    },
    description: { type: String },
    quantity: { type: Number },
    price: { type: Number },
    btw: { type: String }
  }],
  paid: { type: Number, default: "00" },
  payment: { type: String, default: "Unpaid" },
  vat: { type: String },
  subTotal: { type: Number },
  total: { type: Number },
  date: { type: Date, default: new Date() },
  expire_date: { type: Date }
}, { timestamps: true });

financeSchema.pre('save', async function (next) {
  if (!this.isNew) return next();
  try {
    const currentYear = new Date().getFullYear();
    const lastInvoice = await this.constructor.findOne({ index: new RegExp(`^${currentYear}/`) })
    .sort({ createdAt: -1 });
    const lastIndex = lastInvoice && lastInvoice.index
      ? parseInt(lastInvoice.index.split('/')[1])
      : 0;
    const newIndex = `${currentYear}/${String(lastIndex + 1).padStart(4, '0')}`;
    this.index = newIndex;
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model("Finance", financeSchema);







