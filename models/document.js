const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,  // Assuming it's a reference to a Customer model
      ref: 'Customer',
    },
    path: {
      type: String,
    },
    name: {
      type: String,
    },
    fileName: {
      type: String,
    },
    documentType: {
      type: String,
    },
    email: {
      type: String,
      ref: 'User'
    },
    isEmployee: {
      type: String,
    },
  },
  {
    timestamps: true,  // Automatically adds createdAt and updatedAt fields
  }
);

module.exports = mongoose.model('Document', documentSchema);
