const mongoose = require('mongoose');

const leaveRequestSchema = new mongoose.Schema(
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
    leaveType: {
      type: String,
      enum: [
        'Annual / Vacation',
        'Sick Leave',
        'Casual Leave',
        'Emergency / Personal',
        'Unpaid Leave',
        'Maternity / Paternity',
      ],
      default: 'Annual / Vacation',
      required: true,
    },
    durationType: {
      type: String,
      enum: [
        'Full Day',
        'Half Day - First Half',
        'Half Day - Second Half',
        'Multiple Days',
      ],
      default: 'Full Day',
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    totalDays: {
      type: Number,
      required: true,
      min: 0.5,
    },
    paidDays: {
      type: Number,
      default: 0,
    },
    unpaidDays: {
      type: Number,
      default: 0,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
      default: 'Pending',
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewerName: {
      type: String,
    },
    reviewerComment: {
      type: String,
      trim: true,
    },
    reviewedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);
