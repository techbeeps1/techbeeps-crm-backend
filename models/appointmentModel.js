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
    departureTime: {
        type: Date,
    },
    arrivalTime: {
        type: Date,
    },
    workLocation: {
        type: String,
    },
    departureLocation: {
        type: String,
    },
    notes: {
        type: String,
    },
    additionalFields: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model('Appointment', appointmentSchema);
