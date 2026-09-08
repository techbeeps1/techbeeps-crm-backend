const mongoose = require('mongoose');

const workHourSchema = new mongoose.Schema(
  {
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      required: true,
      index: true,
    },
    employabilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employability',
      required: true,
      index: true,
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'jobSchedule',
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    employeeName: {
      type: String,
      default: '',
    },
    workType: {
      type: String,
      default: 'Mover',
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    scheduledStartTime: {
      type: Date,
    },
    scheduledEndTime: {
      type: Date,
    },
    scheduledHours: {
      type: Number,
      default: 0,
    },
    actualStartTime: {
      type: Date,
    },
    actualEndTime: {
      type: Date,
    },
    breakMinutes: {
      type: Number,
      default: 0,
    },
    approvedHours: {
      type: Number,
      default: 0,
    },
    overtimeHours: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending',
      index: true,
    },
    notes: {
      type: String,
      default: '',
    },
    rejectionReason: {
      type: String,
      default: '',
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
    },
    approvedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure uniqueness per appointment shift
workHourSchema.index({ appointmentId: 1, employabilityId: 1 }, { unique: true });

module.exports = mongoose.model('WorkHour', workHourSchema);
