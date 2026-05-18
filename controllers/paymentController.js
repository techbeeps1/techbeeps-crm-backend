const Payment = require('../models/PaymentRecordModel');
const Invoice = require('../models/invoice');


const recordPayment = async (req, res) => {
    const { invoiceId, date, amount, paymentMode, description } = req.body;
    try {
        const invoice = await Invoice.findById(invoiceId);
        if (!invoice) {
            return res.status(404).json({ message: 'Invoice not found' });
        }
        const remainingAmount = invoice.total - invoice.paid;
        if (amount > remainingAmount) {
            return res.status(400).json({ message: `Payment exceeds the remaining invoice amount of ${remainingAmount}` });
        }
        const payment = new Payment({
            invoiceId,
            amount,
            date,
            paymentMode,
            description
        });
        await payment.save();
        invoice.paid = Number(invoice.paid) + Number(amount);
        if (invoice.paid == invoice.total || invoice.paid > invoice.total) {
            invoice.paid = invoice.total;
            invoice.payment = 'paid';
        } else {
            invoice.payment = 'partially_paid';
        }
        await invoice.save();
        return res.status(201).json({ message: 'Payment recorded successfully', payment });
    } catch (error) {
        return res.status(500).json({ message: 'Error recording payment', error });
    }
};


const getPaymentsByInvoiceId = async (req, res) => {
    const { invoiceId } = req.params;
    try {
        const payments = await Payment.find({ invoiceId });
        if (payments.length === 0) {
            return res.status(404).json({ message: 'No payments found for this invoice' });
        }

        return res.status(200).json({ message: 'Payments retrieved successfully', payments });
    } catch (error) {
        return res.status(500).json({ message: 'Error retrieving payments', error });
    }
};

// Get all payments in the system (optional)
const getAllPayments = async (req, res) => {
    try {
        const payments = await Payment.find();
        return res.status(200).json({ message: 'All payments retrieved successfully', payments });
    } catch (error) {
        return res.status(500).json({ message: 'Error retrieving all payments', error });
    }
};



module.exports = { recordPayment, getPaymentsByInvoiceId, getAllPayments };
