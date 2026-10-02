require('dotenv').config();
const mongoose = require('mongoose');
const Reporting = require('../models/reporting');
const AppSettings = require('../models/appSettingModel');

const nameUpdates = [
  { id: '673d87de7767621e918c7e4b', name: 'Quote - Fixed Price Proposal' },
  { id: '67401066de4efae1efd3670f', name: 'Quote - Follow-up Reminder' },
  { id: '6a995bae1e953597604d2293', name: 'Quote - Online Acceptance Link' },
  { id: '67401029de4efae1efd36705', name: 'Quote - Acceptance Acknowledgment' },

  { id: '67401052de4efae1efd3670a', name: 'Appointment - Booking Confirmation' },
  { id: '6abf5fb94295f033e5cce681', name: 'Appointment - Rescheduled Notice' },

  { id: '6abf5fb94295f033e5cce682', name: 'Job - Move Confirmation & Schedule' },
  { id: '6abf5fba4295f033e5cce683', name: 'Booking - Cancellation Notice' },

  { id: '674010bede4efae1efd36719', name: 'Invoice - Billing & Payment Due' },
  { id: '674010d0de4efae1efd3671e', name: 'Invoice - Follow-up Reminder' },
  { id: '6abf5fba4295f033e5cce684', name: 'Invoice - Payment Reminder (1st Notice)' },
  { id: '6abf5fba4295f033e5cce685', name: 'Invoice - Payment Reminder (Final Notice)' },
  { id: '6740107ade4efae1efd36714', name: 'Invoice - Payment Received Receipt' },
  { id: '67611dd3ca48493a174f71a9', name: 'Storage - Monthly Rental Invoice' },

  { id: '6abf5fba4295f033e5cce686', name: 'Customer - Thank You & Feedback' },

  { id: '67482f4178cf7071e2d8465b', name: 'Internal - Employee Welcome & Credentials' },
  { id: '677bc309a951e7a4ba54e249', name: 'Internal - Task Assignment Notice' },
  { id: '6a10498d6560cd48279e6846', name: 'Security - One-Time Password (OTP)' },
];

async function updateTemplateNames() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  for (const item of nameUpdates) {
    const res = await Reporting.findByIdAndUpdate(item.id, { name: item.name }, { new: true });
    if (res) {
      console.log(`Updated ID ${item.id} -> "${item.name}"`);
    } else {
      console.warn(`Could not find ID ${item.id}`);
    }
  }

  // Verify AppSettings.emailTemplates mapping
  const settings = await AppSettings.findOne();
  console.log('\nCurrent AppSettings.emailTemplates:');
  console.log(JSON.stringify(settings.emailTemplates, null, 2));

  console.log('\nAll updated templates:');
  const all = await Reporting.find({}, 'name status').lean();
  all.forEach((t) => console.log(`- ${t.name} (${t.status})`));

  process.exit(0);
}

updateTemplateNames().catch((err) => {
  console.error(err);
  process.exit(1);
});
