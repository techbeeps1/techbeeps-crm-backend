const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  sender: {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
  recipient: {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
  text: String,
  file: String,
  read: { type: Boolean, default: false }, 
}, {timestamps:true});

const MessageModel = mongoose.model('messagecs', MessageSchema);

module.exports = MessageModel;