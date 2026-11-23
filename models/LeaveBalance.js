const mongoose = require('mongoose');

const leaveBalanceSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    employeeName: {
      type: String,
      default: '',
    },
    year: {
      type: Number,
      default: () => new Date().getFullYear(),
    },
    annualEntitlement: {
      type: Number,
      default: 20, // Statutory Dutch baseline: 20 paid vacation days per year (4 x weekly working days)
    },
    usedDays: {
      type: Number,
      default: 0,
    },
    unpaidDays: {
      type: Number,
      default: 0,
    },
    usedBreakdown: {
      annual: { type: Number, default: 0 },
      sick: { type: Number, default: 0 },
      casual: { type: Number, default: 0 },
      emergency: { type: Number, default: 0 },
      unpaid: { type: Number, default: 0 },
      maternity: { type: Number, default: 0 },
    },
    notes: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

// Ensure one balance document per employee per year
leaveBalanceSchema.index({ employeeId: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('LeaveBalance', leaveBalanceSchema);
