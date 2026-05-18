const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    invoiceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Invoice',
        required: true
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
    },
    reference: {
        type: String,
    },
    description: {
        type: String,
    }
});

const Payment = mongoose.model('Payment', paymentSchema);
module.exports = Payment;
