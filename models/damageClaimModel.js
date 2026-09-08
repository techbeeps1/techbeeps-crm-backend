const mongoose = require('mongoose');

const damagedItemSchema = new mongoose.Schema(
  {
    itemName: {
      type: String,
      required: true,
      trim: true,
    },
    itemCategory: {
      type: String,
      enum: [
        'Furniture',
        'Electronics & Appliances',
        'Glass & Fragile',
        'Artwork & Antiques',
        'Building / Property Damage',
        'Boxes / Personal Effects',
        'Other',
      ],
      default: 'Furniture',
    },
    damageType: {
      type: String,
      enum: [
        'Broken / Shattered',
        'Scratch / Dent',
        'Water Damage',
        'Lost / Missing',
        'Structural Damage',
        'Stain / Tear',
        'Other',
      ],
      default: 'Scratch / Dent',
    },
    quantity: {
      type: Number,
      default: 1,
      min: 1,
    },
    estimatedOriginalValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    claimedAmount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    approvedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    evidencePhotos: [
      {
        url: { type: String, required: true },
        name: { type: String, default: 'Damage Photo' },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    repairQuoteUrl: {
      type: String,
      default: '',
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { _id: true }
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      required: true,
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    changedByName: {
      type: String,
      default: 'Admin / System',
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    comment: {
      type: String,
      default: '',
      trim: true,
    },
    action: {
      type: String,
      default: 'Status Updated',
    },
  },
  { _id: true }
);

const damageClaimSchema = new mongoose.Schema(
  {
    claimNumber: {
      type: String,
      unique: true,
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'jobSchedule',
      required: false,
    },
    jobIndex: {
      type: String,
      default: '',
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: false,
    },
    customerName: {
      type: String,
      required: true,
      trim: true,
    },
    customerEmail: {
      type: String,
      default: '',
      trim: true,
    },
    customerPhone: {
      type: String,
      default: '',
      trim: true,
    },
    reportedBy: {
      type: String,
      enum: ['Customer', 'Driver / Mover', 'Operations Manager', 'Claims Adjuster', 'Admin'],
      default: 'Customer',
    },
    reportedByName: {
      type: String,
      default: '',
    },
    incidentDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    reportedDate: {
      type: Date,
      default: Date.now,
    },
    incidentStage: {
      type: String,
      enum: [
        'Pre-Move / Packing',
        'Loading / In-Transit',
        'Unloading / Delivery',
        'Storage / Warehouse',
        'Assembly / Handyman',
        'Other',
      ],
      default: 'Loading / In-Transit',
    },
    incidentLocation: {
      type: String,
      default: '',
      trim: true,
    },
    incidentDescription: {
      type: String,
      default: '',
      trim: true,
    },

    // Damaged items list
    items: [damagedItemSchema],

    // Insurance Details
    insuranceType: {
      type: String,
      enum: [
        'Standard Transit Liability',
        'Full Value Protection (All-Risk)',
        'Company Self-Insured',
        'Customer Home Insurance',
        'Third-Party Carrier Insurance',
      ],
      default: 'Standard Transit Liability',
    },
    policyNumber: {
      type: String,
      default: '',
      trim: true,
    },
    deductibleAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Financial Totals
    currency: {
      type: String,
      default: 'EUR',
    },
    totalClaimedAmount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    totalApprovedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    deductibleApplied: {
      type: Number,
      default: 0,
      min: 0,
    },
    netSettlementAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Settlement Processing
    settlementStatus: {
      type: String,
      enum: ['Unsettled', 'Partially Settled', 'Settled'],
      default: 'Unsettled',
    },
    settlementType: {
      type: String,
      enum: [
        'None',
        'Direct Bank Transfer',
        'Repair / Restoration',
        'Replacement Purchase',
        'Invoice Credit / Offset',
        'Cash Voucher',
        'Insurance Direct Payout',
      ],
      default: 'None',
    },
    settlementDate: {
      type: Date,
      default: null,
    },
    paymentReference: {
      type: String,
      default: '',
      trim: true,
    },
    settledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    settledByName: {
      type: String,
      default: '',
    },
    settlementNotes: {
      type: String,
      default: '',
      trim: true,
    },
    releaseAgreementSigned: {
      type: Boolean,
      default: false,
    },
    releaseDocumentUrl: {
      type: String,
      default: '',
    },

    // Overall Status Workflow
    status: {
      type: String,
      enum: [
        'Reported',
        'Under Review',
        'Inspection Scheduled',
        'Approved',
        'Partially Approved',
        'Settled',
        'Rejected',
        'Closed',
      ],
      default: 'Reported',
    },
    reviewerComment: {
      type: String,
      default: '',
      trim: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewedByName: {
      type: String,
      default: '',
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      default: '',
      trim: true,
    },

    // Audit Log History
    statusHistory: [statusHistorySchema],
  },
  { timestamps: true }
);

// Auto-generate claim number: CLM-YYYY-XXXX
damageClaimSchema.pre('save', async function () {
  if (!this.claimNumber) {
    const currentYear = new Date().getFullYear();
    const prefix = `CLM-${currentYear}-`;

    const lastClaim = await this.constructor
      .findOne({ claimNumber: new RegExp(`^${prefix}`) })
      .sort({ createdAt: -1 });

    let nextNumber = 1;
    if (lastClaim && lastClaim.claimNumber) {
      const parts = lastClaim.claimNumber.split('-');
      if (parts.length === 3) {
        const parsed = parseInt(parts[2], 10);
        if (!isNaN(parsed)) {
          nextNumber = parsed + 1;
        }
      }
    }

    this.claimNumber = `${prefix}${String(nextNumber).padStart(4, '0')}`;
  }
});

module.exports = mongoose.model('DamageClaim', damageClaimSchema);
