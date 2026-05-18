const mongoose = require('mongoose');
const dynamicSchema = new mongoose.Schema({
    dynamicFields: { 
        type: Map, 
        of: mongoose.Schema.Types.Mixed
    },
    // financialTemplate: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailTemplate'},
}, { strict: false }); 

const PackageSchema = new mongoose.Schema({
    name: { type: String, required: true },
    type_job :{type:String,default: "Manual/No job"},
    vat:{type:String},
    priceAgree:{type:String},
    ignoreRules: { type: Boolean, default: false },
    offers: { type: dynamicSchema, default: {} }, 
    invoice: { type: dynamicSchema, default: {} },
    start_job: { type: dynamicSchema, default: {} },
    Storage: { type: dynamicSchema, default: {} }, 
    appointment: { type: dynamicSchema, default: {} } 
}, { strict: false }); 

const Package = mongoose.model('package', PackageSchema);

module.exports = Package;