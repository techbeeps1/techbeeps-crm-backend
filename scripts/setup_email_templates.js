require('dotenv').config();
const mongoose = require('mongoose');
const Reporting = require('../models/reporting');
const AppSettings = require('../models/appSettingModel');
const CompanyDetails = require('../models/companyModel');

const R2_LOGO_URL = 'https://pub-5a1825f2dbec4d2eb0b6c533f4b0fa5f.r2.dev/logos/universal_movers_logo.png';
const TECHBEEPS_IMAGE_REGEX = /https:\/\/assets\.unlayer\.com\/projects\/0\/1732090350147-logo\.png(\?[^"'\s>]*)?/gi;

function generateTemplateHtml({ title, subtitle, mainBody, callToActionText, callToActionUrl }) {
  const ctaBlock = callToActionText && callToActionUrl ? `
    <div style="text-align: center; margin: 30px 0;">
      <a href="${callToActionUrl}" style="background-color: #3C50E0; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 14px;">
        ${callToActionText}
      </a>
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f7fa; color: #1e293b; }
    .email-container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
    .header-banner { background-color: #1c2434; padding: 24px 20px; text-align: center; }
    .header-logo { max-height: 48px; max-width: 220px; object-fit: contain; }
    .content-body { padding: 32px 28px; line-height: 1.6; font-size: 14px; }
    .content-title { font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 8px; text-align: center; }
    .content-subtitle { font-size: 14px; color: #64748b; margin-top: 0; margin-bottom: 24px; text-align: center; }
    .greeting { font-size: 15px; font-weight: 600; margin-bottom: 16px; color: #0f172a; }
    .contact-card { background-color: #f8fafc; border-left: 4px solid #3c50e0; padding: 16px; border-radius: 4px; margin-top: 28px; font-size: 13px; line-height: 1.6; }
    .contact-title { font-weight: 700; color: #1e293b; margin-bottom: 6px; }
    .footer-bar { background-color: #f1f5f9; padding: 18px 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header-banner">
      <img src="${R2_LOGO_URL}" alt="{{company.companyName}}" class="header-logo" />
    </div>
    <div class="content-body">
      <h2 class="content-title">${title}</h2>
      ${subtitle ? `<p class="content-subtitle">${subtitle}</p>` : ''}
      <p class="greeting">Dear {{customer.firstName}} {{customer.lastName}},</p>
      ${mainBody}
      ${ctaBlock}
      <div class="contact-card">
        <div class="contact-title">Contact:</div>
        <div>{{company.companyName}}</div>
        <div>{{company.companyAddress}} {{company.companyState}}, {{company.companyCountry}}</div>
        <div>Email: {{company.companyEmail}}</div>
        <div>Phone: {{company.companyPhone}}</div>
      </div>
    </div>
    <div class="footer-bar">
      <div>{{company.companyName}} &copy; All Rights Reserved</div>
      <div style="margin-top: 4px; font-size: 11px;">
        Tax: {{company.companyTaxNumber}} | VAT: {{company.companyVatNumber}} | {{company.companyWebsite}}
      </div>
    </div>
  </div>
</body>
</html>`;
}

function generateUnlayerDesign({ title, bodyText }) {
  return {
    body: {
      rows: [
        {
          cells: [1],
          columns: [
            {
              contents: [
                {
                  type: 'image',
                  values: {
                    src: { url: R2_LOGO_URL, width: 220, height: 48 },
                    align: 'center',
                    altText: 'Company Logo'
                  }
                }
              ],
              values: {
                backgroundColor: '#1c2434',
                padding: '20px'
              }
            }
          ]
        },
        {
          cells: [1],
          columns: [
            {
              contents: [
                {
                  type: 'heading',
                  values: {
                    text: title,
                    headingType: 'h2',
                    textAlign: 'center',
                    color: '#0f172a'
                  }
                },
                {
                  type: 'text',
                  values: {
                    text: `<p>Dear {{customer.firstName}} {{customer.lastName}},</p><p>${bodyText}</p>`,
                    color: '#334155'
                  }
                },
                {
                  type: 'text',
                  values: {
                    text: `<p><strong>Contact:</strong><br>{{company.companyName}}<br>{{company.companyAddress}} {{company.companyState}}, {{company.companyCountry}}<br>{{company.companyEmail}}<br>{{company.companyPhone}}</p>`,
                    color: '#64748b'
                  }
                }
              ],
              values: {
                backgroundColor: '#ffffff',
                padding: '30px'
              }
            }
          ]
        },
        {
          cells: [1],
          columns: [
            {
              contents: [
                {
                  type: 'text',
                  values: {
                    text: `<p style="text-align: center; font-size: 12px; color: #94a3b8;">{{company.companyName}} &copy; All Rights Reserved<br>Tax: {{company.companyTaxNumber}} | {{company.companyWebsite}}</p>`,
                    textAlign: 'center'
                  }
                }
              ],
              values: {
                backgroundColor: '#f1f5f9',
                padding: '15px'
              }
            }
          ]
        }
      ],
      values: {
        backgroundColor: '#f8fafc',
        fontFamily: { label: 'Arial', value: 'Arial, Helvetica, sans-serif' }
      }
    },
    schemaVersion: 7
  };
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  // 1. Delete junk / 0-byte templates
  const junkNames = ['New Task Assigned', 'new', 'QA test Template'];
  const deletedResult = await Reporting.deleteMany({
    $or: [
      { name: { $in: junkNames } },
      { htmlContent: { $in: ['', null] } }
    ]
  });
  console.log(`Deleted ${deletedResult.deletedCount} junk/empty templates`);

  // 2. Fix typos on existing templates
  await Reporting.updateOne({ name: 'Payment Receviced' }, { name: 'Payment Received' });
  await Reporting.updateOne({ name: 'Task Assigment' }, { name: 'Task Assignment' });
  await Reporting.updateOne({ name: 'Appointment booked ' }, { name: 'Appointment Booked' });
  await Reporting.updateOne({ name: 'Storage invoice' }, { name: 'Storage Invoice' });
  await Reporting.updateOne({ name: 'Reminder Quotes' }, { name: 'Reminder Quote' });
  await Reporting.updateOne({ name: 'send accept quote' }, { name: 'Quote Acceptance & Confirmation' });
  await Reporting.updateMany({}, { status: 'Enable' });
  console.log('Fixed template names and enabled active statuses');

  // 3. Update all existing templates to replace hardcoded Techbeeps unlayer logo with R2 logo
  const existingTemplates = await Reporting.find({});
  for (const t of existingTemplates) {
    let changed = false;
    let html = t.htmlContent || '';
    if (TECHBEEPS_IMAGE_REGEX.test(html)) {
      html = html.replace(TECHBEEPS_IMAGE_REGEX, R2_LOGO_URL);
      t.htmlContent = html;
      changed = true;
    }

    if (t.htmlDesign) {
      let designStr = JSON.stringify(t.htmlDesign);
      if (designStr.includes('1732090350147-logo.png')) {
        designStr = designStr.replace(TECHBEEPS_IMAGE_REGEX, R2_LOGO_URL);
        t.htmlDesign = JSON.parse(designStr);
        changed = true;
      }
    }

    if (changed) {
      await t.save();
      console.log(`Updated logo in template: "${t.name}"`);
    }
  }

  // 4. Define standard 12 operational templates specifications
  const operationalTemplates = [
    {
      key: 'quote',
      name: 'Fixed Price Quote',
      title: 'Quotation #{{invoice.index}}',
      subtitle: 'Your Official Moving & Relocation Estimate',
      body: '<p>Hereby, you receive a quote and price estimate from us for our relocation services. Please review the proposal details and pricing.</p><p>You can accept or view your quotation directly online at any time.</p>',
      ctaText: 'View & Accept Quote',
      ctaUrl: '{{company.companyWebsite}}/quotes/accept/{{invoice.id}}'
    },
    {
      key: 'quoteReminders',
      name: 'Reminder Quote',
      title: 'Quote Reminder #{{invoice.index}}',
      subtitle: 'Gentle reminder regarding your pending quote',
      body: '<p>We wanted to follow up on Quotation #{{invoice.index}} sent recently. Our team is holding the requested dates and resources for your move.</p><p>If you have any questions or would like to confirm your booking, please let us know or click the button below to accept.</p>',
      ctaText: 'Review Quotation',
      ctaUrl: '{{company.companyWebsite}}/quotes/accept/{{invoice.id}}'
    },
    {
      key: 'appointment',
      name: 'Appointment Booked',
      title: 'Appointment Confirmation',
      subtitle: 'Survey & Consultation Schedule Confirmed',
      body: '<p>Your appointment with {{company.companyName}} has been successfully booked. Our relocation specialist will visit you or connect at the scheduled time.</p><p><strong>Appointment Date:</strong> {{appointment.date}}<br><strong>Time:</strong> {{appointment.time}}</p><p>If you need to reschedule or have special instructions, please contact us promptly.</p>'
    },
    {
      key: 'rescheduleAppointment',
      name: 'Appointment Rescheduled',
      title: 'Updated Appointment Notice',
      subtitle: 'Your consultation schedule has been modified',
      body: '<p>Please note that your appointment schedule has been updated.</p><p><strong>New Appointment Date:</strong> {{appointment.date}}<br><strong>New Time:</strong> {{appointment.time}}</p><p>If this new timing does not work for you, please reach out to us and we will arrange an alternative slot.</p>'
    },
    {
      key: 'invoice',
      name: 'Invoice',
      title: 'Invoice #{{invoice.index}}',
      subtitle: 'Invoice dispatched from {{company.companyName}}',
      body: '<p>Please find attached Invoice #{{invoice.index}} for services rendered. The total balance due is <strong>{{currencySymbol}} {{invoice.total}}</strong>.</p><p><strong>Due Date:</strong> {{invoice.dueDate}}</p><p>We appreciate your prompt payment.</p>'
    },
    {
      key: 'invoiceReminder',
      name: 'Reminder Invoice',
      title: 'Invoice Payment Reminder #{{invoice.index}}',
      subtitle: 'Friendly follow-up on outstanding balance',
      body: '<p>This is a friendly reminder that Invoice #{{invoice.index}} for <strong>{{currencySymbol}} {{invoice.total}}</strong> is currently due.</p><p>If you have already submitted payment, please disregard this notice. Otherwise, please remit payment at your earliest convenience.</p>'
    },
    {
      key: 'confirmation',
      name: 'Job Confirmation',
      title: 'Move Order Confirmation',
      subtitle: 'Your move booking is officially confirmed',
      body: '<p>We are delighted to confirm your upcoming relocation booking with {{company.companyName}}! Our professional moving crew has been assigned to your job.</p><p><strong>Job Reference:</strong> #{{job.jobNumber}}<br><strong>Scheduled Move Date:</strong> {{job.jobDate}}</p><p>We will contact you the day before to confirm final arrival logistics.</p>'
    },
    {
      key: 'cancellation',
      name: 'Cancellation Notice',
      title: 'Cancellation Acknowledgment',
      subtitle: 'Booking cancellation confirmed',
      body: '<p>As per your request, your move or quotation has been cancelled. We regret that we are unable to assist you on this occasion.</p><p>If you need moving or storage services in the future, please do not hesitate to contact us.</p>'
    },
    {
      key: 'paymentReminder',
      name: 'Payment Reminder (First Notice)',
      title: 'Payment Reminder - First Notice',
      subtitle: 'Statement of account for Invoice #{{invoice.index}}',
      body: '<p>Our records indicate that we have not yet received payment for Invoice #{{invoice.index}} in the amount of <strong>{{currencySymbol}} {{invoice.total}}</strong>.</p><p>Please arrange payment as soon as possible. If you need a copy of the invoice or banking details, please feel free to reach out.</p>'
    },
    {
      key: 'paymentReminder2',
      name: 'Payment Reminder (Final Notice)',
      title: 'Urgent: Final Payment Notice',
      subtitle: 'Second stage reminder for overdue invoice',
      body: '<p>This is an urgent final notice regarding overdue Invoice #{{invoice.index}} for <strong>{{currencySymbol}} {{invoice.total}}</strong>.</p><p>To avoid administrative surcharges or service suspension, please complete payment immediately via the payment link or bank transfer.</p>'
    },
    {
      key: 'thankyou',
      name: 'Thank You & Feedback',
      title: 'Thank You for Choosing Us!',
      subtitle: 'We hope you had a smooth move',
      body: '<p>Thank you for choosing {{company.companyName}} for your relocation! We hope our moving team took great care of your belongings.</p><p>Your feedback is invaluable to us. If you had a positive experience, please take a moment to leave us a review.</p>',
      ctaText: 'Leave a Review',
      ctaUrl: '{{company.companyWebsite}}'
    },
    {
      key: 'storageInovice',
      name: 'Storage Invoice',
      title: 'Storage Charges Invoice',
      subtitle: 'Monthly warehouse & storage statement',
      body: '<p>Please find attached your recurring invoice for warehouse storage services. Total charges: <strong>{{currencySymbol}} {{invoice.total}}</strong>.</p><p>Thank you for trusting {{company.companyName}} with the safekeeping of your items.</p>'
    }
  ];

  const templateIdMap = {};

  for (const op of operationalTemplates) {
    let t = await Reporting.findOne({ name: op.name });
    if (!t) {
      // Also try regex for match
      t = await Reporting.findOne({ name: { $regex: new RegExp(`^${op.name}`, 'i') } });
    }

    const htmlContent = generateTemplateHtml({
      title: op.title,
      subtitle: op.subtitle,
      mainBody: op.body,
      callToActionText: op.ctaText,
      callToActionUrl: op.ctaUrl
    });

    const htmlDesign = generateUnlayerDesign({
      title: op.title,
      bodyText: op.body
    });

    if (t) {
      t.name = op.name;
      t.htmlContent = htmlContent;
      t.htmlDesign = htmlDesign;
      t.status = 'Enable';
      await t.save();
      console.log(`Updated template: "${op.name}" (ID: ${t._id})`);
      templateIdMap[op.key] = String(t._id);
    } else {
      const newT = new Reporting({
        name: op.name,
        htmlContent,
        htmlDesign,
        status: 'Enable',
      });
      await newT.save();
      console.log(`Created new template: "${op.name}" (ID: ${newT._id})`);
      templateIdMap[op.key] = String(newT._id);
    }
  }

  // 5. Update AppSettings.emailTemplates
  let appSettings = await AppSettings.findOne();
  if (!appSettings) {
    appSettings = new AppSettings();
  }

  appSettings.emailTemplates = {
    quote: templateIdMap.quote,
    quoteReminders: templateIdMap.quoteReminders,
    appointment: templateIdMap.appointment,
    rescheduleAppointment: templateIdMap.rescheduleAppointment,
    invoice: templateIdMap.invoice,
    invoiceReminder: templateIdMap.invoiceReminder,
    confirmation: templateIdMap.confirmation,
    cancellation: templateIdMap.cancellation,
    paymentReminder: templateIdMap.paymentReminder,
    paymentReminder2: templateIdMap.paymentReminder2,
    thankyou: templateIdMap.thankyou,
    storageInovice: templateIdMap.storageInovice
  };

  await appSettings.save();
  console.log('Successfully updated AppSettings.emailTemplates with mapped IDs:');
  console.log(JSON.stringify(appSettings.emailTemplates, null, 2));

  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
