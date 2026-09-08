const mongoose = require('mongoose');

const declarationItemSchema = new mongoose.Schema(
  {
    declarationType: {
      type: String,
      default: 'Travel & Mileage',
    },
    title: {
      type: String,
      trim: true,
      default: '',
    },
    amount: {
      type: Number,
      default: 0,
      min: 0,
    },
    distanceKm: {
      type: Number,
      default: 0,
    },
    startLocation: {
      type: String,
      trim: true,
      default: '',
    },
    destinationLocation: {
      type: String,
      trim: true,
      default: '',
    },
    date: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const declarationSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    employeeName: {
      type: String,
      required: true,
    },
    employeeRole: {
      type: String,
      default: 'Staff',
    },
    declarationType: {
      type: String,
      default: 'Other Out-of-Pocket',
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'EUR',
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },

    // Line items list (Invoice-style items)
    items: [declarationItemSchema],

    // Travel & Mileage specific fields
    distanceKm: {
      type: Number,
      default: 0,
    },
    ratePerKm: {
      type: Number,
      default: 0.23,
    },
    startLocation: {
      type: String,
      trim: true,
      default: '',
    },
    destinationLocation: {
      type: String,
      trim: true,
      default: '',
    },

    // Job reference (if expense relates to a customer job)
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'jobSchedule',
      default: null,
    },
    jobIndex: {
      type: String,
      trim: true,
      default: '',
    },

    description: {
      type: String,
      trim: true,
      default: '',
    },
    receiptUrl: {
      type: String,
      trim: true,
      default: '',
    },
    receiptName: {
      type: String,
      trim: true,
      default: '',
    },

    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Paid', 'Cancelled'],
      default: 'Pending',
    },

    // Review / Approval Details
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewerName: {
      type: String,
      default: '',
    },
    reviewerComment: {
      type: String,
      trim: true,
      default: '',
    },
    reviewedAt: {
      type: Date,
      default: null,
    },

    // Reimbursement / Payment Details
    paidAt: {
      type: Date,
      default: null,
    },
    paymentReference: {
      type: String,
      trim: true,
      default: '',
    },
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Declaration', declarationSchema);
