require('dotenv').config();
const mongoose = require('mongoose');
const Reporting = require('../models/reporting');

const R2_LOGO_URL = 'https://pub-5a1825f2dbec4d2eb0b6c533f4b0fa5f.r2.dev/logos/universal_movers_logo.png';

/**
 * Builds standard clean HTML for emails
 */
function buildHtml({ title, subtitle, greeting, bodyHtml, buttonText, buttonUrl, specialBlock }) {
  const cta = buttonText && buttonUrl ? `
    <div style="text-align: center; margin: 28px 0;">
      <a href="${buttonUrl}" style="background-color: #3C50E0; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 14px; box-shadow: 0 4px 6px rgba(60, 80, 224, 0.25);">
        ${buttonText}
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
      <p class="greeting">${greeting || 'Dear {{customer.firstName}} {{customer.lastName}},'}</p>
      ${bodyHtml}
      ${specialBlock || ''}
      ${cta}
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

/**
 * Builds Unlayer design JSON so the visual editor displays headers, text, and buttons properly
 */
function buildDesign({ title, subtitle, greeting, bodyHtml, buttonText, buttonUrl, specialBlockText }) {
  const contents = [
    {
      type: 'heading',
      values: {
        text: title,
        headingType: 'h2',
        textAlign: 'center',
        color: '#0f172a'
      }
    }
  ];

  if (subtitle) {
    contents.push({
      type: 'text',
      values: {
        text: `<p style="text-align: center; color: #64748b; margin-top: 0; font-size: 14px;">${subtitle}</p>`,
        color: '#64748b'
      }
    });
  }

  contents.push({
    type: 'text',
    values: {
      text: `<p><strong>${greeting || 'Dear {{customer.firstName}} {{customer.lastName}},'}</strong></p>${bodyHtml}`,
      color: '#334155'
    }
  });

  if (specialBlockText) {
    contents.push({
      type: 'text',
      values: {
        text: specialBlockText,
        color: '#0f172a'
      }
    });
  }

  if (buttonText && buttonUrl) {
    contents.push({
      type: 'button',
      values: {
        text: `<span><span>${buttonText}</span></span>`,
        href: {
          name: 'web',
          attrs: {
            href: '{{href}}',
            target: '{{target}}'
          },
          values: {
            href: buttonUrl,
            target: '_blank'
          }
        },
        buttonColors: {
          color: '#FFFFFF',
          backgroundColor: '#3C50E0',
          hoverColor: '#FFFFFF',
          hoverBackgroundColor: '#2b3eb5'
        },
        size: { autoWidth: true, width: '100%' },
        fontSize: '14px',
        lineHeight: '120%',
        textAlign: 'center',
        padding: '12px 28px',
        borderRadius: '6px',
        containerPadding: '15px'
      }
    });
  }

  contents.push({
    type: 'text',
    values: {
      text: `<p style="background-color: #f8fafc; border-left: 4px solid #3c50e0; padding: 12px; margin-top: 20px; font-size: 13px; line-height: 1.6;"><strong>Contact:</strong><br>{{company.companyName}}<br>{{company.companyAddress}} {{company.companyState}}, {{company.companyCountry}}<br>Email: {{company.companyEmail}}<br>Phone: {{company.companyPhone}}</p>`,
      color: '#475569'
    }
  });

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
                    altText: 'Universal Movers Logo'
                  }
                }
              ],
              values: {
                backgroundColor: '#1c2434',
                padding: '24px 20px'
              }
            }
          ]
        },
        {
          cells: [1],
          columns: [
            {
              contents,
              values: {
                backgroundColor: '#ffffff',
                padding: '30px 25px'
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
                    text: `<p style="text-align: center; font-size: 12px; color: #94a3b8; margin: 0;">{{company.companyName}} &copy; All Rights Reserved<br>Tax: {{company.companyTaxNumber}} | VAT: {{company.companyVatNumber}} | {{company.companyWebsite}}</p>`,
                    textAlign: 'center'
                  }
                }
              ],
              values: {
                backgroundColor: '#f1f5f9',
                padding: '16px'
              }
            }
          ]
        }
      ],
      values: {
        backgroundColor: '#f4f7fa',
        fontFamily: { label: 'Arial', value: 'Arial, Helvetica, sans-serif' }
      }
    },
    schemaVersion: 7
  };
}

const templatesData = [
  // 1. Quote - Fixed Price Proposal
  {
    name: 'Quote - Fixed Price Proposal',
    title: 'Quotation #{{invoice.index}}',
    subtitle: 'Your Moving & Relocation Price Estimate',
    greeting: 'Dear {{customer.firstName}} {{customer.lastName}},',
    bodyHtml: '<p>Hereby, you receive a quote and price estimate from us for your upcoming relocation. Please review the detailed scope of services and pricing proposal.</p><p>You can review and accept this quotation directly online through our secure portal:</p>',
    buttonText: 'View & Accept Quotation',
    buttonUrl: '{{acceptQuoteUrl}}',
  },

  // 2. Quote - Follow-up Reminder
  {
    name: 'Quote - Follow-up Reminder',
    title: 'Quote Reminder #{{invoice.index}}',
    subtitle: 'Pending Quotation Acceptance Follow-up',
    greeting: 'Dear {{customer.firstName}} {{customer.lastName}},',
    bodyHtml: '<p>We wanted to follow up on Quotation #{{invoice.index}} sent to you recently. We are currently holding the requested moving schedule and team for your relocation.</p><p>If you have any questions or wish to secure your booking, please click below to review and confirm:</p>',
    buttonText: 'Review & Confirm Quotation',
    buttonUrl: '{{acceptQuoteUrl}}',
  },

  // 3. Quote - Online Acceptance Link
  {
    name: 'Quote - Online Acceptance Link',
    title: 'Accept Your Quotation Online',
    subtitle: 'Instant Digital Quote Confirmation',
    greeting: 'Dear {{customer.firstName}} {{customer.lastName}},',
    bodyHtml: '<p>Your quotation #{{invoice.index}} is ready for digital approval. Please click the button below to view the itemized breakdown and confirm your booking online:</p>',
    buttonText: 'Accept Quotation Online',
    buttonUrl: '{{acceptQuoteUrl}}',
  },

  // 4. Quote - Acceptance Acknowledgment
  {
    name: 'Quote - Acceptance Acknowledgment',
    title: 'Quote Acceptance Confirmed',
    subtitle: 'Thank You for Confirming Quotation #{{invoice.index}}',
    greeting: 'Dear {{customer.firstName}} {{customer.lastName}},',
    bodyHtml: '<p>Thank you for accepting Quotation #{{invoice.index}} from {{company.companyName}}!</p><p>We have successfully registered your formal acceptance. Our operations planning department is now preparing your booking and assigning dedicated equipment and movers.</p><p>You will receive a formal Move Confirmation with schedule details shortly.</p>',
  },

  // 5. Appointment - Booking Confirmation
  {
    name: 'Appointment - Booking Confirmation',
    title: 'Survey Appointment Confirmed',
    subtitle: 'Pre-Move Inspection & Consultation Schedule',
    greeting: 'Dear {{customer.firstName}} {{customer.lastName}},',
    bodyHtml: '<p>Your survey appointment with {{company.companyName}} has been successfully booked. Our relocation specialist will visit you or connect at the confirmed time.</p><p style="background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;"><strong>Appointment Date:</strong> {{appointment.date}}<br><strong>Appointment Time:</strong> {{appointment.time}}</p><p>If you need to change your appointment or have any questions beforehand, please let us know.</p>',
  },

  // 6. Appointment - Rescheduled Notice
  {
    name: 'Appointment - Rescheduled Notice',
    title: 'Updated Appointment Notice',
    subtitle: 'Your Consultation Schedule Has Been Modified',
    greeting: 'Dear {{customer.firstName}} {{customer.lastName}},',
    bodyHtml: '<p>Please note that your survey appointment schedule with {{company.companyName}} has been updated.</p><p style="background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;"><strong>New Appointment Date:</strong> {{appointment.date}}<br><strong>New Time:</strong> {{appointment.time}}</p><p>If this updated schedule does not work for you, please contact us immediately to select an alternative slot.</p>',
  },

  // 7. Job - Move Confirmation & Schedule
  {
    name: 'Job - Move Confirmation & Schedule',
    title: 'Move Order Confirmation',
    subtitle: 'Booking #{{job.jobNumber}} Officially Scheduled',
    greeting: 'Dear {{customer.firstName}} {{customer.lastName}},',
    bodyHtml: '<p>We are delighted to confirm your upcoming relocation with {{company.companyName}}! Our professional moving crew has been officially assigned to your job.</p><p style="background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;"><strong>Job Reference:</strong> #{{job.jobNumber}}<br><strong>Scheduled Move Date:</strong> {{job.jobDate}}</p><p>Our operations dispatch team will contact you the day prior to confirm final arrival logistics.</p>',
  },

  // 8. Booking - Cancellation Notice
  {
    name: 'Booking - Cancellation Notice',
    title: 'Cancellation Acknowledgment',
    subtitle: 'Booking or Quotation Cancellation Confirmed',
    greeting: 'Dear {{customer.firstName}} {{customer.lastName}},',
    bodyHtml: '<p>As per your request, your move booking or quotation has been cancelled in our system. We regret that we could not assist you on this occasion.</p><p>If your plans change or you require moving and storage solutions in the future, we will be pleased to assist you.</p>',
  },

  // 9. Invoice - Billing & Payment Due
  {
    name: 'Invoice - Billing & Payment Due',
    title: 'Invoice #{{invoice.index}}',
    subtitle: 'Invoice Dispatched from {{company.companyName}}',
    greeting: 'Dear {{customer.firstName}} {{customer.lastName}},',
    bodyHtml: '<p>Please find attached Invoice #{{invoice.index}} for your relocation services. The details of your account are summarized below:</p><p style="background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;"><strong>Total Balance Due:</strong> {{currencySymbol}} {{invoice.total}}<br><strong>Payment Due Date:</strong> {{invoice.dueDate}}</p><p>We kindly request payment on or before the due date. Thank you for your business.</p>',
  },

  // 10. Invoice - Follow-up Reminder
  {
    name: 'Invoice - Follow-up Reminder',
    title: 'Invoice Payment Reminder #{{invoice.index}}',
    subtitle: 'Friendly Notice Regarding Outstanding Balance',
    greeting: 'Dear {{customer.firstName}} {{customer.lastName}},',
    bodyHtml: '<p>This is a friendly reminder that Invoice #{{invoice.index}} for <strong>{{currencySymbol}} {{invoice.total}}</strong> is currently due.</p><p>If you have already processed this payment, please accept our thanks and disregard this notice. Otherwise, please remit payment at your earliest convenience.</p>',
  },

  // 11. Invoice - Payment Reminder (1st Notice)
  {
    name: 'Invoice - Payment Reminder (1st Notice)',
    title: 'Payment Reminder - First Notice',
    subtitle: 'Statement of Account for Invoice #{{invoice.index}}',
    greeting: 'Dear {{customer.firstName}} {{customer.lastName}},',
    bodyHtml: '<p>According to our accounting records, Invoice #{{invoice.index}} in the amount of <strong>{{currencySymbol}} {{invoice.total}}</strong> remains unpaid.</p><p>Please review the attached invoice and arrange payment. If you require bank transfer details or assistance, please contact our finance desk.</p>',
  },

  // 12. Invoice - Payment Reminder (Final Notice)
  {
    name: 'Invoice - Payment Reminder (Final Notice)',
    title: 'Urgent: Final Payment Notice',
    subtitle: 'Immediate Settlement Required for Invoice #{{invoice.index}}',
    greeting: 'Dear {{customer.firstName}} {{customer.lastName}},',
    bodyHtml: '<p>This is an urgent final reminder regarding overdue Invoice #{{invoice.index}} for <strong>{{currencySymbol}} {{invoice.total}}</strong>.</p><p style="color: #b91c1c; font-weight: 600;">Please arrange immediate settlement today to avoid administrative late fees or collection proceedings.</p><p>If payment has already been sent, please email your payment receipt to {{company.companyEmail}} right away.</p>',
  },

  // 13. Invoice - Payment Received Receipt
  {
    name: 'Invoice - Payment Received Receipt',
    title: 'Payment Receipt Confirmed',
    subtitle: 'We Have Received Your Payment',
    greeting: 'Dear {{customer.firstName}} {{customer.lastName}},',
    bodyHtml: '<p>Thank you! We have successfully received and processed your payment for Invoice #{{invoice.index}}.</p><p>Your balance has been updated accordingly and no further action is required at this time. Thank you for choosing {{company.companyName}}.</p>',
  },

  // 14. Storage - Monthly Rental Invoice
  {
    name: 'Storage - Monthly Rental Invoice',
    title: 'Storage Charges Invoice',
    subtitle: 'Monthly Warehouse & Storage Statement',
    greeting: 'Dear {{customer.firstName}} {{customer.lastName}},',
    bodyHtml: '<p>Please find attached your monthly recurring storage invoice for warehouse safekeeping services.</p><p style="background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;"><strong>Total Storage Amount:</strong> {{currencySymbol}} {{invoice.total}}<br><strong>Billing Period:</strong> Current Month</p><p>Thank you for trusting {{company.companyName}} with your storage needs.</p>',
  },

  // 15. Customer - Thank You & Feedback
  {
    name: 'Customer - Thank You & Feedback',
    title: 'Thank You for Choosing Us!',
    subtitle: 'We Hope You Enjoyed a Smooth Move',
    greeting: 'Dear {{customer.firstName}} {{customer.lastName}},',
    bodyHtml: '<p>On behalf of the entire team at {{company.companyName}}, thank you for trusting us with your relocation!</p><p>Our goal is always to deliver an effortless moving experience. If our crew served you well, we would be deeply grateful if you could take 30 seconds to share your review:</p>',
    buttonText: 'Leave Us a Google Review',
    buttonUrl: '{{company.companyWebsite}}',
  },

  // 16. Security - One-Time Password (OTP)
  {
    name: 'Security - One-Time Password (OTP)',
    title: 'Verification Code (OTP)',
    subtitle: 'Password Reset Verification Code',
    greeting: 'Hello {{customer.firstName}},',
    bodyHtml: '<p>We received a request to reset the password for your {{company.companyName}} CRM account. Please use the following one-time verification code to proceed:</p>',
    specialBlock: '<div style="text-align: center; margin: 26px 0;"><span style="display: inline-block; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #1c2434; background-color: #f1f5f9; padding: 14px 28px; border-radius: 8px; border: 2px dashed #3c50e0;">{{otp}}</span><p style="font-size: 12px; color: #64748b; margin-top: 10px;">This code expires in 10 minutes. Do not share it with anyone.</p></div>',
    specialBlockText: '<div style="text-align: center; margin: 20px 0;"><span style="display: inline-block; font-size: 30px; font-weight: bold; letter-spacing: 8px; color: #1c2434; background: #f1f5f9; padding: 12px 24px; border-radius: 6px; border: 2px dashed #3c50e0;">{{otp}}</span><p style="font-size: 12px; color: #64748b; margin-top: 8px;">Code valid for 10 minutes</p></div>',
  },

  // 17. Internal - Employee Welcome & Credentials
  {
    name: 'Internal - Employee Welcome & Credentials',
    title: 'Welcome to the Team!',
    subtitle: 'Your CRM Staff Account Access',
    greeting: 'Hello {{data.username}},',
    bodyHtml: '<p>Welcome to {{company.companyName}}! Your administrative staff access has been activated.</p><p style="background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;"><strong>Login Email:</strong> {{data.email}}<br><strong>Temporary Password:</strong> {{data.password}}</p><p>Please log in and update your password immediately upon your first sign-in:</p>',
    buttonText: 'Login to CRM Dashboard',
    buttonUrl: 'https://universal-movers-front.vercel.app/auth/signin',
  },

  // 18. Internal - Task Assignment Notice
  {
    name: 'Internal - Task Assignment Notice',
    title: 'New Task Assigned',
    subtitle: 'Operational Task Notification',
    greeting: 'Hello {{user.username}},',
    bodyHtml: '<p>A new operational task has been assigned to you in {{company.companyName}} CRM.</p><p style="background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;"><strong>Summary:</strong> {{task.summary}}<br><strong>Description:</strong> {{task.description}}<br><strong>Scheduled For:</strong> {{task.scheduledFor}}</p><p>Please check your task board in the CRM to view complete details.</p>',
  }
];

async function updateAll() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  for (const tData of templatesData) {
    const htmlContent = buildHtml({
      title: tData.title,
      subtitle: tData.subtitle,
      greeting: tData.greeting,
      bodyHtml: tData.bodyHtml,
      buttonText: tData.buttonText,
      buttonUrl: tData.buttonUrl,
      specialBlock: tData.specialBlock
    });

    const htmlDesign = buildDesign({
      title: tData.title,
      subtitle: tData.subtitle,
      greeting: tData.greeting,
      bodyHtml: tData.bodyHtml,
      buttonText: tData.buttonText,
      buttonUrl: tData.buttonUrl,
      specialBlockText: tData.specialBlockText
    });

    let record = await Reporting.findOne({ name: tData.name });
    if (!record) {
      record = new Reporting({
        name: tData.name,
        status: 'Enable'
      });
    }

    record.htmlContent = htmlContent;
    record.htmlDesign = htmlDesign;
    record.status = 'Enable';
    await record.save();
    console.log(`Updated content & visual design for: "${tData.name}"`);
  }

  console.log('\nAll 18 email templates have been fully updated with proper designs, dynamic variables, and visual editor blocks.');
  process.exit(0);
}

updateAll().catch(err => {
  console.error(err);
  process.exit(1);
});
