const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
    jobId :{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'jobSchedule',
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
        type: String
    },
    departureLocation: {
        type: String,
    },

    assignedEmployees: {
        type: [String],
    },
    selectedLifts: {
        type: [String],
    },
    notes: {
        type: String,
    },

}, {
    timestamps: true,
});

module.exports = mongoose.model('Appointment', appointmentSchema);
