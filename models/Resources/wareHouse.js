const mongoose = require("mongoose");

const warehouseSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
    },
    isOwnWarehouse: {
      type: Boolean,
      default: false, // Default is "Nee"
    },
    postcode: {
      type: String,
    },
    houseNumber: {
      type: String,
    },
    addition: {
      type: String,
    },
    street: {
      type: String,
    },
    city: {
      type: String,
    },
    country: {
      type: String,
    },
    condition: {
      type: String,
      default: "enable", // Default condition
    },
  },
  {
    timestamps: true, // Add createdAt and updatedAt timestamps
  }
);

module.exports = mongoose.model("Warehouse", warehouseSchema);
