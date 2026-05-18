const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
    typeOfCustomer:String,
    salutation:String,
    firstName:String,
    lastName:String,
    gender:String,
    email:String,
    contact:Number,
    findUs:String,
    time:String,
    date:String,
    from:String,
    to:String,
    whereOption:String,
    distance:String,
    floor:Number,
    reports:String,
    permission:String,
    simage:String,
    lift:String,
    selectedRadio:String,
    internetLink:String,
    additionalDetail:String,
    selectedFile:String
});

module.exports = mongoose.model('Lead', leadSchema);