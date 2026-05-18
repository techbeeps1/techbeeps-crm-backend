const mongoose = require('mongoose');

const storageLocationSchema = new mongoose.Schema({
    name: { type: String, required: true },
    code: { type: String, required: true },
    description: { type: String, default: '' },
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
    },
    disabledAfter: { type: Date, default: null },
    storedItemIds: { type: [String], default: [] },
    deleted: { type: Boolean, default: false },
    status:{
      type: String,
      default: 'active'
    }
});

module.exports = mongoose.model('StorageLocation', storageLocationSchema);
