const mongoose = require('mongoose');

const emailSchema = new mongoose.Schema({
  from: { type: String, required: true },
  recipient: { type: String, required: true },
  bcc: { type: String },
  subject: { type: String, required: true },
  htmlContent: { type: String, required: true },
  sentAt: { type: Date, default: Date.now },
  offer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Finance'
  },
  job: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'jobSchedule'
  },
  customer: {
    type: String,
  },
  attachment: {
    type: String,
  },
  // EXEC-26: Outbox & Delivery Verification Fields
  eventId: {
    type: String,
    index: true,
  },
  eventType: {
    type: String,
    index: true,
  },
  status: {
    type: String,
    enum: ['QUEUED', 'SENT', 'FAILED', 'INTERCEPTED_DUPLICATE', 'BLOCKED_INVALID_VARIABLES'],
    default: 'SENT',
    index: true,
  },
  idempotencyKey: {
    type: String,
    index: true,
    sparse: true,
  },
  templateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'reporting',
  },
  templateName: {
    type: String,
  },
  deliveryResult: {
    messageId: { type: String },
    mode: { type: String, enum: ['SMTP', 'MAIL_SINK', 'MOCK'] },
    response: { type: String },
    timestamp: { type: Date },
  },
  variablesSnapshot: {
    type: mongoose.Schema.Types.Mixed,
  },
  reconciledBalance: {
    total: { type: Number },
    totalPaid: { type: Number },
    totalCredited: { type: Number },
    balanceDue: { type: Number },
    paymentStatus: { type: String },
    dueDate: { type: String },
  },
  errorReason: {
    type: String,
  },
  attachments: [{
    filename: String,
    contentType: String,
    size: Number,
  }],
}, { timestamps: true });

const Email = mongoose.model('Email', emailSchema);

module.exports = Email;
