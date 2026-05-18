const { ObjectId } = require("mongodb");
const mongoose = require("mongoose");

const newsItemsSchema = new mongoose.Schema(
  {
    title: String,
    body: String,
    publishAt: Date,
    employeeId: String,
    publisherName: String
  },
  { timestamps: true }
);

module.exports = mongoose.model("newsItems", newsItemsSchema);
