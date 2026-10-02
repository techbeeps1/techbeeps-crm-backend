const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "jobSchedule",
    },
    date: {
      type: Date,
    },
    startTime: {
      type: Date,
    },
    endTime: {
      type: Date,
    },
    appointmentType: {
      type: String,
    },
    departureLocation: {
      type: String,
    },

    assignedEmployees: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Employability",
      },
    ],
    vehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
    },
    vehicleName: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["Draft", "Scheduled", "Completed", "Cancelled"],
      default: "Scheduled",
    },
    notes: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Appointment", appointmentSchema);
