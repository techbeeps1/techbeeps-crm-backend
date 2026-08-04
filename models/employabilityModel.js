const mongoose = require('mongoose');

const employabilitySchema = new mongoose.Schema({
    employeeId :{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
    },
    employeeName: String,
    workType: String,
    date: {
        type: Date,
    },
    startTime: {
        type: Date,
    },
    endTime: {
        type: Date,
    },
    vehicle: String || null,

    }, {
    timestamps: true,
});

module.exports = mongoose.model('Employability', employabilitySchema);
