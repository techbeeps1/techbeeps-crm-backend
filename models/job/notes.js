const mongoose = require("mongoose");

const notesSchema = new mongoose.Schema({
    jobId: String,
    genralNotes: String,
    employeeNotes : String,
    customerNotes : String,
   })

   module.exports = mongoose.model("Notes", notesSchema);
