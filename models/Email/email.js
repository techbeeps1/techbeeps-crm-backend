const mongoose = require('mongoose');

const emailSchema = new mongoose.Schema({
  from: { type: String, required: true },
  recipient: { type: String, required: true },
  bcc: { type: String },
  subject: { type: String, required: true },
  htmlContent: { type: String, required: true },
  sentAt: { type: Date, default: Date.now },
  offer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Finance'
  },
  customer: {
    type:String,
  },
  attachment: {
    type: String,
  }
});

const Email = mongoose.model('Email', emailSchema);

module.exports = Email;
