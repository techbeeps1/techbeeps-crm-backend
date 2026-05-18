const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  userId: String,
  username: {
    type: String
  },
  text: String,
  timestamp: { type: Date, default: Date.now }
},
);

module.exports = mongoose.model("comment", commentSchema);
