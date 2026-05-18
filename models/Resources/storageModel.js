const mongoose = require('mongoose');


const itemsSchema = new mongoose.Schema({
    description: { type: String },
    itemCode: { type: String },
    externalCode: { type: String },
    contents: { type: String },
    storageLocation: { type: mongoose.Schema.Types.ObjectId, ref: "StorageLocation", required: false, default: null },
    loadedOn: { type: Date },
    ReleasedOn: { type: Date },
    loadedByEmployee: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    ReleasedByEmployee: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    loadedByCustomer: { type: Boolean, default: false }
});

const actionSchema = new mongoose.Schema({
    description: { type: String },
    price: { type: Number },
    quantity: { type: Number },
    actionDate: { type: Date }
});

const storageSchema = new mongoose.Schema(
    {
        storageCode: { type: String, required: true, unique: true },
        storageType: { type: String, required: true },
        selfOwned: { type: Boolean, default: true },
        cubicMeter: { type: Number, required: true },
        warehouse: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Warehouse',
        },
        storageLocation: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'StorageLocation',
        },
        storageStatus: { type: String, default: 'free' },
        percentageFill: { type: Number, default: 0 },
        customer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Customer',
        },
        storedForProject: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'jobSchedule',
        },
        salesGroup: { type: String, default: null },
        notes: { type: String, default: null },
        invoicingPeriod: { type: String, default: null },
        costAction: [actionSchema],
        price: { type: Number, default: null },
        invoicingStartDate: { type: Date, default: null },
        lastInvoicedDate: { type: Date, default: null },
        includingVat: { type: String, default: null },
        billStorageInAdvance: { type: String, default: null },
        invoiceReference: { type: String, default: null },
        volumeType: { type: String, default: null },
        totalVolume:{type:Number,default:0},
        invoicePerVolume: { type: Boolean, default: false },
        setVolumeToQuantity: { type: Boolean, default: false },
        volumeChanges: { type: [String], default: [] },
        invoicedPeriods: { type: [String], default: [] },
        events: [itemsSchema],
        photos: { type: [String], default: [] },
        vatPercentage: { type: Number, default: null },
        loadedOn: { type: Date, default: null },
        deleted: { type: Boolean, default: false },
    },
    { timestamps: true } // Adds createdAt and updatedAt automatically
);

module.exports = mongoose.model('Storage', storageSchema);
