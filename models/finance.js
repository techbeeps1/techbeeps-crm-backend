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
    componentId: { type: String },
    isManual: { type: Boolean, default: false },
    manualOverride: { type: Boolean, default: false },
    manualReason: { type: String },
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
  expire_date: { type: Date },
  version: { type: Number, default: 1 },
  isSuperseded: { type: Boolean, default: false },
  supersededBy: {
    type: Schema.Types.ObjectId,
    ref: 'Finance',
  },
  parentQuote: {
    type: Schema.Types.ObjectId,
    ref: 'Finance',
  },
  rootQuote: {
    type: Schema.Types.ObjectId,
    ref: 'Finance',
  },
  rejectionReason: { type: String },
  rejectedAt: { type: Date },
  rejectedBy: {
    type: String,
    enum: ['CUSTOMER', 'STAFF'],
    default: 'CUSTOMER',
  },
  revokedAt: { type: Date },
  revokedReason: { type: String },
  acceptedAt: { type: Date },
  customerSignature: { type: String },
  acceptance: {
    isAccepted: { type: Boolean, default: false },
    acceptedAt: { type: Date },
    acceptedVersion: { type: Number, default: 1 },
    method: {
      type: String,
      enum: ['PUBLIC_LINK', 'ON_SITE_SIGNATURE', 'STAFF_RECORDED'],
      default: 'PUBLIC_LINK',
    },
    customerIdentity: {
      name: { type: String },
      email: { type: String },
      comments: { type: String },
      ipAddress: { type: String },
      userAgent: { type: String },
    },
    signature: {
      data: { type: String },
      capturedAt: { type: Date },
    },
    staffActor: {
      userId: { type: Schema.Types.ObjectId, ref: 'User' },
      name: { type: String },
      email: { type: String },
      role: { type: String },
    },
    immutableAgreementSnapshot: {
      type: Schema.Types.Mixed,
    },
    acknowledgementEvent: {
      eventId: { type: String },
      timestamp: { type: Date },
      type: { type: String, default: 'QUOTE_ACCEPTED' },
    },
  },
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
}, { timestamps: true });

financeSchema.pre('save', async function () {
  if (!this.isNew) return;
  try {
    const crypto = require('crypto');
    if (!this.capabilityToken) {
      this.capabilityToken = crypto.randomBytes(32).toString('hex');
    }
    if (!this.tokenExpiresAt) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 30); // 30-day default validity
      this.tokenExpiresAt = expiry;
    }

    const isStaging = process.env.NODE_ENV !== 'production' || process.env.IS_STAGING === 'true';
    const prefix = isStaging ? 'TEST-QUO-' : '';
    const currentYear = new Date().getFullYear();

    if (this.index && typeof this.index === 'string' && this.index.trim() !== '') {
      if (isStaging && !this.index.startsWith('TEST-')) {
        this.index = `${prefix}${this.index}`;
      }
      return;
    }

    const lastFinance = await this.constructor.findOne({})
      .sort({ createdAt: -1 });

    let lastIndex = 0;
    if (lastFinance && lastFinance.index) {
      const match = String(lastFinance.index).match(/(\d+)$/);
      if (match) {
        lastIndex = parseInt(match[1], 10);
      }
    }

    const newIndex = `${prefix}${currentYear}/${String(lastIndex + 1).padStart(4, '0')}`;
    this.index = newIndex;
  } catch (error) {
    throw error;
  }
});

module.exports = mongoose.model("Finance", financeSchema);







