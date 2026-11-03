const mongoose = require('mongoose');
const { validatePhoneNumber } = require('../utils/phoneValidator');

const leadSchema = new mongoose.Schema({
    typeOfCustomer: {
        type: String,
        default: 'Individual',
    },
    firstName: {
        type: String,
        required: true,
        trim: true,
    },
    lastName: {
        type: String,
        required: true,
        trim: true,
    },
    gender: {
        type: String,
        default: '',
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
    },
    contact: {
        type: String,
        trim: true,
        validate: {
            validator: validatePhoneNumber,
            message: 'Please enter a valid telephone/mobile number.'
        }
    },
    mobile: {
        type: String,
        trim: true,
        validate: {
            validator: validatePhoneNumber,
            message: 'Please enter a valid mobile number (e.g. 06 12345678 or +31 6 12345678).'
        }
    },
    findUs: {
        type: String,
        default: '',
    },
    city: {
        type: String,
        trim: true,
    },
    postcode: {
        type: String,
        trim: true,
    },
    street: {
        type: String,
        trim: true,
    },
    houseNumber: {
        type: String,
        trim: true,
    },
    taal: {
        type: String,
        default: 'Dutch',
    },
    source: {
        type: String,
        default: 'Manual',
    },
    status: {
        type: String,
        default: 'New',
    },
    leadIndex: {
        type: Number,
        index: true,
    },
    duplicateOf: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lead',
        default: null,
    },
    convertedCustomer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer',
        default: null,
    },
    inquiryCount: {
        type: Number,
        default: 1,
    },
    duplicateInquiries: [{
        receivedAt: { type: Date, default: Date.now },
        email: String,
        contact: String,
        notes: String,
    }],
    notes: {
        type: String,
        default: '',
    },
}, { timestamps: true });

leadSchema.pre('save', async function () {
    if (this.isNew && !this.leadIndex) {
      try {
        const lastLead = await this.constructor
          .findOne()
          .sort({ leadIndex: -1 });
        this.leadIndex = lastLead && lastLead.leadIndex ? lastLead.leadIndex + 1 : 1;
      } catch (error) {
        throw error;
      }
    }
});

module.exports = mongoose.model('Lead', leadSchema);
