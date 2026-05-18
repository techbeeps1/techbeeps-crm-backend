const mongoose = require('mongoose');

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
  contact: { type: String },
  taal: { type: String },
  findUs: { type: String },
  mobile: { type: String },
  customerIndex: {
    type: Number,
    index: true,
  },
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
customerSchema.pre('save', async function (next) {
  if (this.isNew) {
    try {
      const lastCustomer = await this.constructor
        .findOne()
        .sort({ customerIndex: -1 });
      this.customerIndex = lastCustomer ? lastCustomer.customerIndex + 1 : 1;
      next();
    } catch (error) {
      next(error);
    }
  } else {
    next();
  }
});

module.exports = mongoose.model('Customer', customerSchema);
