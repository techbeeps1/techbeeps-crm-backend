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
    componentId: { type: String },
    isManual: { type: Boolean, default: false },
    manualOverride: { type: Boolean, default: false },
    manualReason: { type: String },
    description: { type: String },
    quantity: { type: Number },
    price: { type: Number },
    btw: { type: String }
  }],
  paid: { type: Number, default: 0 },
  credited: { type: Number, default: 0 },
  balanceDue: { type: Number },
  dueDate: { type: Date },
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
  capabilityToken: {
    type: String,
    unique: true,
    sparse: true,
    index: true,
  },
  tokenExpiresAt: {
    type: Date,
  },
  isStaging: {
    type: Boolean,
    default: () => process.env.NODE_ENV !== 'production' || process.env.IS_STAGING === 'true',
  },
  idempotencyKey: {
    type: String,
    sparse: true,
    index: true,
  },
  companySnapshot: {
    type: Object,
    default: null,
  },
  customerSnapshot: {
    type: Object,
    default: null,
  },
  statutorySnapshot: {
    type: Object,
    default: null,
  },
}, { timestamps: true });

invoiceSchema.index({ index: 1 }, { unique: true, sparse: true });



invoiceSchema.pre('save', async function () {
  if (!this.isNew) return;

  const crypto = require('crypto');
  if (!this.capabilityToken) {
    this.capabilityToken = crypto.randomBytes(32).toString('hex');
  }
  if (!this.tokenExpiresAt) {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);
    this.tokenExpiresAt = expiry;
  }

  const isStaging = process.env.NODE_ENV !== 'production' || process.env.IS_STAGING === 'true';
  const prefix = isStaging ? 'TEST-INV-' : '';
  const currentYear = new Date().getFullYear();

  // If index is already explicitly provided
  if (this.index && typeof this.index === 'string' && this.index.trim() !== '') {
    if (isStaging && !this.index.startsWith('TEST-')) {
      this.index = `${prefix}${this.index}`;
    }
    return;
  }

  const Type = this.Type || 'invoice';
  const { getNextInvoiceIndex } = require('../utils/sequenceGenerator');
  this.index = await getNextInvoiceIndex(Type, isStaging, currentYear);
});



module.exports = mongoose.model("Invoice", invoiceSchema);