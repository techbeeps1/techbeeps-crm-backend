const mongoose = require('mongoose');

const employabilitySchema = new mongoose.Schema({
    employeeId :{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
    },
    employeeName: String,
    workType: String,
    startTime: {
        type: Date,
    },
    endTime: {
        type: Date,
    },
    vehicle: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Vehicle',
    },

    }, {
    timestamps: true,
});

module.exports = mongoose.model('Employability', employabilitySchema);
