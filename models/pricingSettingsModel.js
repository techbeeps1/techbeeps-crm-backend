const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const pricingSettingsSchema = new Schema({
  version: {
    type: Number,
    required: true,
    unique: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    default: function () {
      return `Pricing Settings v${this.version || 3}`;
    },
  },
  description: {
    type: String,
    default: '',
  },
  startDate: {
    type: Date,
    required: true,
    default: Date.now,
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },
  settings: {
    type: Schema.Types.Mixed,
    required: true,
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

// Ensure only one version can be active at a time if isActive is true
pricingSettingsSchema.pre('save', async function () {
  if (this.isActive) {
    await this.constructor.updateMany(
      { _id: { $ne: this._id } },
      { $set: { isActive: false } }
    );
  }
});

module.exports = mongoose.model('PricingSettings', pricingSettingsSchema);
