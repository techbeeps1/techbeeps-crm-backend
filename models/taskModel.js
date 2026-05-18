const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
    summary: {
        type: String,
    },
    scheduledFor: {
        type: Date,
    },
    scheduledTime: {
        type: String,
    },
    description: {
        type: String,
    },
    assignedTo: {
        type: String,
    },
    teamMembers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    priority: {
        type: String,
    },
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer',
    },
    job: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'jobSchedule',
    },
    status: {
        type: String,
        default: 'open'
    }
}, { timestamps: true });

const Task = mongoose.model('Task', taskSchema);
module.exports = Task;
