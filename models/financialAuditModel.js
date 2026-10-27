const mongoose = require('mongoose');

const financialAuditSchema = new mongoose.Schema({
  entityType: {
    type: String,
    enum: ['INVOICE', 'PAYMENT', 'CREDIT_NOTE', 'TARIFF', 'COMPANY_BANK', 'ROLE', 'CUSTOMER'],
    required: true,
    index: true,
  },
  entityId: {
    type: String,
    required: true,
    index: true,
  },
  action: {
    type: String,
    enum: [
      'PAYMENT_RECORDED',
      'PAYMENT_REVERSED',
      'CREDIT_NOTE_ISSUED',
      'INVOICE_CREATED',
      'INVOICE_UPDATED',
      'TARIFF_UPDATED',
      'COMPANY_BANK_UPDATED',
      'ROLE_UPDATED',
    ],
    required: true,
  },
  amount: {
    type: Number,
  },
  currency: {
    type: String,
    default: 'EUR',
  },
  actor: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: { type: String },
    email: { type: String },
    role: { type: String },
  },
  reason: {
    type: String,
  },
  before: {
    type: mongoose.Schema.Types.Mixed,
  },
  after: {
    type: mongoose.Schema.Types.Mixed,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
  },
  ipAddress: {
    type: String,
  },
}, {
  timestamps: true,
});

// Append-only guarantee: Prevent modification of historical audit logs
financialAuditSchema.pre('updateOne', function() {
  throw new Error('Financial audit log entries are immutable and append-only.');
});
financialAuditSchema.pre('updateMany', function() {
  throw new Error('Financial audit log entries are immutable and append-only.');
});
financialAuditSchema.pre('findOneAndUpdate', function() {
  throw new Error('Financial audit log entries are immutable and append-only.');
});

module.exports = mongoose.model('FinancialAuditLog', financialAuditSchema);
