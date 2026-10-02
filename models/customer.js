const mongoose = require('mongoose');
const { validatePhoneNumber } = require('../utils/phoneValidator');

const customerSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    default: 'Customer',
    enum: ['leads', 'Customer'], // Ensure valid types
  },
  typeOfCustomer: {
    type: String,
    required: true,
  },
  salutation: { type: String },
  firstName: { type: String },
  lastName: { type: String },
  gender: { type: String },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  contact: {
    type: String,
    validate: {
      validator: validatePhoneNumber,
      message: 'Please enter a valid telephone number (e.g. 010 1234567 or +31 10 1234567).'
    }
  },
  taal: { type: String },
  findUs: { type: String },
  mobile: {
    type: String,
    validate: {
      validator: validatePhoneNumber,
      message: 'Please enter a valid mobile number (e.g. 06 12345678 or +31 6 12345678).'
    }
  },
  customerIndex: {
    type: Number,
    index: true,
  },
  companyName: { type: String, trim: true },
  contacts: [{
    salutation: { type: String },
    firstName: { type: String },
    lastName: { type: String },
    email: { type: String },
    mobile: {
      type: String,
      validate: {
        validator: validatePhoneNumber,
        message: 'Please enter a valid contact mobile number.'
      }
    },
    contact: {
      type: String,
      validate: {
        validator: validatePhoneNumber,
        message: 'Please enter a valid contact telephone number.'
      }
    },
    role: { type: String, default: 'General' },
  }],
  status: {
    type: String,
    default: 'Active',
    enum: ['Active', 'Inactive', 'Suspended'],
  },
  address: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Address',
  }]
}, { timestamps: true });


// { type: this.type }
customerSchema.pre('save', async function () {
  if (this.isNew) {
    try {
      const lastCustomer = await this.constructor
        .findOne()
        .sort({ customerIndex: -1 });
      this.customerIndex = lastCustomer ? lastCustomer.customerIndex + 1 : 1;
    } catch (error) {
      throw error;
    }
  }
});

module.exports = mongoose.model('Customer', customerSchema);
