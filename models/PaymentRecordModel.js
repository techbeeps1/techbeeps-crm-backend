const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    invoiceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Invoice',
        required: true,
        index: true
    },
    amount: {
        type: Number,
        required: true,
    },
    date: {
        type: Date,
        default: Date.now
    },
    paymentMode: {
        type: String,
        default: 'bank_transfer'
    },
    type: {
        type: String,
        enum: ['payment', 'credit_note', 'reversal'],
        default: 'payment',
        index: true
    },
    status: {
        type: String,
        enum: ['completed', 'reversed', 'pending'],
        default: 'completed',
        index: true
    },
    currency: {
        type: String,
        default: 'EUR'
    },
    recordedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    authorName: {
        type: String
    },
    reversalOf: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Payment'
    },
    reversalReason: {
        type: String
    },
    creditNoteIndex: {
        type: String,
        sparse: true,
        index: true
    },
    idempotencyKey: {
        type: String,
        sparse: true,
        index: true
    },
    taxRate: {
        type: Number
    },
    taxAmount: {
        type: Number
    },
    netAmount: {
        type: Number
    },
    reference: {
        type: String,
        default: ''
    },
    description: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

const Payment = mongoose.model('Payment', paymentSchema);
module.exports = Payment;
