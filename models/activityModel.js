const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema(
    {
        type: {
            type: String
        },
        status:{
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
        sender:{
            type: String,
            default: process.env.GMAIL_USER
        },
        offer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Finance'
        },
        comment:{
            type: String
        },
        date: {
            type: Date,
            default: Date.now,
        },
        email:{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Email'
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Activity", activitySchema);
