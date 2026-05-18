const mongoose = require('mongoose');

const DocumentTemplateSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        minlength: [2, 'Name must be at least 2 characters long'],
        maxlength: [55, 'Name must be at most 55 characters long']
    },
    documentType: {
        type: String,
    },
    templateType: {
        type: String,
    },
    link_template: {
        type: String
    },
    expiryPeriod: {
        type: String,
        default: '2 Weeks'
    },
    htmlDesign: {
        type: Object,
    },
    htmlContent:{
        type: String,
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const DocumentTemplate = mongoose.model('DocumentTemplate', DocumentTemplateSchema);
module.exports = DocumentTemplate;
