const mongoose = require("mongoose");

const staffSchema = new mongoose.Schema({
    gender: String,
    firstName: String,
    middleName: String,
    lastName: String,
    language: String,
    dob: String,
    email: String,
    street: String,
    houseNumber: String,
    addition: String,
    postCode: String,
    city: String,
    country: String,
    inService: String,
    outService: String,
    probation: String,
    startDate: String,
    endDate: String,
    type: String,
    hourlyWage: String,
    hoursWeek: String,
    days: String,
    driverLicense: String,
    skills: String,
});

module.exports = mongoose.model("staff", staffSchema);


