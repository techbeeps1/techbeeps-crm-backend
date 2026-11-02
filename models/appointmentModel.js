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
    workLocation: {
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
    // EXEC-31: Publication workflow
    publicationStatus: {
      type: String,
      enum: ["Draft", "Published"],
      default: "Draft",
    },
    publishedAt: {
      type: Date,
    },
    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    publishedByName: {
      type: String,
    },
    // EXEC-31: Survey appointment disambiguation
    surveyDetails: {
      estimatorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      estimatorName: {
        type: String,
      },
      valuationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ValuationRooms",
      },
      surveyNotes: {
        type: String,
      },
    },
    // EXEC-31: Auditable resource conflict overrides
    conflictOverrides: [
      {
        conflicts: [
          {
            conflictType: { type: String },
            message: { type: String },
            severity: { type: String },
            targetId: { type: String },
            targetName: { type: String },
          },
        ],
        reason: { type: String, required: true },
        overriddenBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        overriddenByName: { type: String },
        overriddenAt: { type: Date, default: Date.now },
        userRole: { type: String },
      },
    ],
    // EXEC-31: Schedule history for rescheduling & publication
    scheduleHistory: [
      {
        previousDate: { type: Date },
        previousStartTime: { type: Date },
        previousEndTime: { type: Date },
        previousPublicationStatus: { type: String },
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        reason: { type: String },
      },
    ],
    // EXEC-31: Audit notification log for published customer updates
    notificationLog: [
      {
        event: { type: String },
        recipient: { type: String },
        sentAt: { type: Date, default: Date.now },
        status: { type: String },
        outboxId: { type: mongoose.Schema.Types.ObjectId },
      },
    ],
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Appointment", appointmentSchema);
