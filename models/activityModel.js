const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema(
    {
        type: {
            type: String
        },
        status: {
            type: String
        },
        title: {
            type: String
        },
        description: {
            type: String
        },
        reference: {
            type: String
        },
        sender: {
            type: String,
            default: process.env.SMTP_USER
        },
        offer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Finance'
        },
        comment: {
            type: String
        },
        date: {
            type: Date,
            default: Date.now,
        },
        email: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Email'
        },
        // EXEC-27: Truthful actor and preview distinction
        actor: {
            type: String,
            enum: ['Staff', 'Customer', 'System', 'Anonymous'],
            default: 'System',
        },
        actorName: {
            type: String,
        },
        action: {
            type: String,
            enum: ['PREVIEW', 'VIEW', 'SEND', 'ACCEPT', 'REJECT', 'UPDATE', 'CREATE'],
            default: 'VIEW',
        },
        documentState: {
            type: String,
        },
        isStaffPreview: {
            type: Boolean,
            default: false,
        },
        acknowledgementEventId: {
            type: String,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Activity", activitySchema);
