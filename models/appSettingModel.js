const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const emailTemplateSchema = new Schema({
    quote: { type: String ,default:""},
    quoteReminders: { type: String ,default:""},
    appointment: { type: String ,default:""},
    rescheduleAppointment: { type: String ,default:""},
    invoice: { type: String ,default:""},
    invoiceReminder: { type: String ,default:""},
    confirmation: { type: String ,default:""},
    cancellation: { type: String ,default:""},
    paymentReminder: { type: String ,default:""},
    paymentReminder2: { type: String ,default:""},
    thankyou: { type: String ,default:""},
    storageInovice : { type: String ,default:""},
});

const standardPriceSchema={
    pricePerMeterCubic :{type:Number,default:0},
    pricePerHour :{type:Number,default:0},
    pricePerKilometer :{type:Number,default:0},
    cubicMeterPerHourPerEmployee:{type:Number,default:0},
    packingBoxPerHour :{type:Number,default:0},
    unPackagingBoxPerHour :{type:Number,default:0},
    assemblingTimePerfurniture :{type:Number,default:0},
    disassemblingTimePerfurniture :{type:Number,default:0},
}

const appSettingsSchema = new Schema({
    language: { type: String, enum: ['en', 'es', 'fr', 'de'] },
    currency: { type: String, enum: ['USD', 'EUR', 'GBP', 'INR'] },
    emailTemplates: emailTemplateSchema,
    standardPrice:standardPriceSchema
});

const AppSettings = mongoose.model('AppSettings', appSettingsSchema);

module.exports = AppSettings;
