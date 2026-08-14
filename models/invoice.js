const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const dynamicSchema = new mongoose.Schema({
  dynamicFields: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },
}, { strict: false });

const invoiceSchema = new mongoose.Schema({
  index: { type: String },
  Type: { type: String, default: "invoice" },
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
  jobinput: { type: dynamicSchema, default: {} },
  reference: { type: String },
  discount: { type: Number, default: 0 },
  discountedPrice: { type: Number, default: 0 },
  discount_description: { type: String },
  year: { type: Number, default: new Date().getFullYear() },
  Status: { type: String },
  note: { type: String },
  ignoreRules: { type: String },
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
  date: { type: Date },
  expire_date: { type: Date },
  taxTypeSalesGroup: {
    type: Schema.Types.ObjectId,
    ref: 'taxTypeSalesGroup',
  },
  remark: {type: String},

}, { timestamps: true });



invoiceSchema.pre('save', async function () {
  if (!this.isNew) return;

  const Type = this.Type;
  const currentYear = new Date().getFullYear();

  const lastInvoice = await this.constructor
    .findOne({ Type })
    .sort({ createdAt: -1 });

  const lastIndex = lastInvoice?.index
    ? parseInt(lastInvoice.index.split('/')[1], 10)
    : 0;

  const newIndex = `${currentYear}/${String(lastIndex + 1).padStart(4, '0')}`;

  this.index = newIndex;
});



module.exports = mongoose.model("Invoice", invoiceSchema);