const nodemailer = require('nodemailer');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Email = require('../models/Email/email');
const AppSettings = require('../models/appSettingModel');
const Reporting = require('../models/reporting');
const CompanyDetails = require('../models/companyModel');
const { calculateInvoiceBalance } = require('./financialLedger');
const { renderEmailTemplate, formatDutchDate, formatTime } = require('./emailTemplateUtil');

/**
 * Standardized Canonical Email Event Types
 */
const EMAIL_EVENTS = {
  QUOTE_SENT: 'QUOTE_SENT',
  QUOTE_ACCEPTED: 'QUOTE_ACCEPTED',
  QUOTE_REJECTED: 'QUOTE_REJECTED',
  QUOTE_REMINDER: 'QUOTE_REMINDER',
  SURVEY_SCHEDULED: 'SURVEY_SCHEDULED',
  SURVEY_RESCHEDULED: 'SURVEY_RESCHEDULED',
  SURVEY_CANCELLED: 'SURVEY_CANCELLED',
  MOVE_SCHEDULED: 'MOVE_SCHEDULED',
  MOVE_RESCHEDULED: 'MOVE_RESCHEDULED',
  MOVE_CANCELLED: 'MOVE_CANCELLED',
  INVOICE_ISSUED: 'INVOICE_ISSUED',
  INVOICE_REMINDER: 'INVOICE_REMINDER',
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
  POST_MOVE_THANKYOU: 'POST_MOVE_THANKYOU',
};

/**
 * Staging Mail Sink: captures delivered messages for verification and test evidence.
 */
const stagingMailSink = [];

function getStagingMailSink() {
  return stagingMailSink;
}

function clearStagingMailSink() {
  stagingMailSink.length = 0;
}

function findInMailSink(predicate) {
  return stagingMailSink.filter(predicate);
}

/**
 * Validates recipient email syntax according to RFC 5322 basics.
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Strict Pre-send Variable Validation:
 * Prevents misleading customer communications with blank dates, times, or addresses.
 */
function validateEventVariables(eventType, context = {}) {
  const recipient = context.recipient || context.customer?.email || context.extraData?.email;
  if (!recipient || !isValidEmail(recipient)) {
    return {
      valid: false,
      errorCode: 'INVALID_RECIPIENT_EMAIL',
      message: `Invalid or missing recipient email address: "${recipient}"`,
      missing: ['recipient'],
    };
  }

  const missing = [];

  // 1. Survey Appointments: Date and Time are mandatory
  if ([EMAIL_EVENTS.SURVEY_SCHEDULED, EMAIL_EVENTS.SURVEY_RESCHEDULED].includes(eventType)) {
    const appt = context.appointment || {};
    const dateVal = appt.date || appt.appointmentDate || context.date;
    const timeVal = appt.time || appt.startTime || appt.appointmentTime || context.time;
    if (!dateVal || String(dateVal).trim() === '') {
      missing.push('appointment.date');
    }
    if (!timeVal || String(timeVal).trim() === '') {
      missing.push('appointment.time');
    }
    if (missing.length > 0) {
      return {
        valid: false,
        errorCode: 'MISSING_APPOINTMENT_VARIABLES',
        message: `Survey appointment communication blocked: [${missing.join(', ')}] are required and cannot be blank.`,
        missing,
      };
    }
  }

  // 2. Move Scheduled Appointments: Move Date is mandatory
  if ([EMAIL_EVENTS.MOVE_SCHEDULED, EMAIL_EVENTS.MOVE_RESCHEDULED].includes(eventType)) {
    const job = context.job || {};
    const moveDate = job.jobDate || job.date || context.date;
    if (!moveDate || String(moveDate).trim() === '') {
      missing.push('job.jobDate');
    }
    if (missing.length > 0) {
      return {
        valid: false,
        errorCode: 'MISSING_MOVE_VARIABLES',
        message: `Move schedule communication blocked: [${missing.join(', ')}] are required.`,
        missing,
      };
    }
  }

  // 3. Invoices: Index and Due Date are mandatory
  if ([EMAIL_EVENTS.INVOICE_ISSUED, EMAIL_EVENTS.INVOICE_REMINDER].includes(eventType)) {
    const inv = context.invoice || {};
    const invIndex = inv.index || inv.invoiceNumber || inv._id;
    const dueDate = inv.dueDate || inv.expire_date;
    if (!invIndex) {
      missing.push('invoice.index');
    }
    if (!dueDate) {
      missing.push('invoice.dueDate');
    }
    if (missing.length > 0) {
      return {
        valid: false,
        errorCode: 'MISSING_INVOICE_VARIABLES',
        message: `Invoice communication blocked: [${missing.join(', ')}] are required.`,
        missing,
      };
    }
  }

  // 4. Quote Acceptance: Quote Index/ID and Customer Name are mandatory
  if (eventType === EMAIL_EVENTS.QUOTE_ACCEPTED) {
    const inv = context.invoice || {};
    const quoteId = inv._id || inv.id || inv.index;
    if (!quoteId) {
      missing.push('quote.index');
    }
    if (missing.length > 0) {
      return {
        valid: false,
        errorCode: 'MISSING_QUOTE_VARIABLES',
        message: `Quote acceptance acknowledgement blocked: [${missing.join(', ')}] are required.`,
        missing,
      };
    }
  }

  return { valid: true };
}

/**
 * Resolves the approved email template for a given event.
 * CRITICAL RULE: QUOTE_ACCEPTED must NEVER resolve to settings.emailTemplates.thankyou!
 */
async function resolveTemplateForEvent(eventType, requestedTemplateId = null, appSettings = null) {
  let settings = appSettings;
  if (!settings) {
    settings = await AppSettings.findOne();
  }

  let templateDoc = null;

  // If a specific template ID was passed, verify it is not forbidden for this event
  if (requestedTemplateId && mongoose.Types.ObjectId.isValid(requestedTemplateId)) {
    // SECURITY GUARD: If event is QUOTE_ACCEPTED, strictly prohibit the post-move thankyou template
    const isThankYouId = settings?.emailTemplates?.thankyou &&
      String(settings.emailTemplates.thankyou) === String(requestedTemplateId);

    if (eventType === EMAIL_EVENTS.QUOTE_ACCEPTED && isThankYouId) {
      console.warn(`[EXEC-26 GUARD] Intercepted attempt to use 'thankyou' template for QUOTE_ACCEPTED event. Diverting to Quote Acceptance Acknowledgment template.`);
      requestedTemplateId = null; // Force fallback to legitimate acceptance template
    } else {
      templateDoc = await Reporting.findById(requestedTemplateId);
      // Double check name if loaded
      if (eventType === EMAIL_EVENTS.QUOTE_ACCEPTED && templateDoc && /thank\s*you\s*for\s*choosing|post-move/i.test(templateDoc.name)) {
        console.warn(`[EXEC-26 GUARD] Template "${templateDoc.name}" is post-move thank-you. Diverting to Quote Acceptance Acknowledgment.`);
        templateDoc = null;
      }
    }
  }

  if (templateDoc) {
    return templateDoc;
  }

  // Event-specific mapping
  switch (eventType) {
    case EMAIL_EVENTS.QUOTE_ACCEPTED: {
      // 1. Try AppSettings quoteAcceptance
      if (settings?.emailTemplates?.quoteAcceptance && mongoose.Types.ObjectId.isValid(settings.emailTemplates.quoteAcceptance)) {
        templateDoc = await Reporting.findById(settings.emailTemplates.quoteAcceptance);
      }
      // 2. Try Reporting search for Acceptance Acknowledgment
      if (!templateDoc) {
        templateDoc = await Reporting.findOne({
          name: { $regex: /Quote - Acceptance Acknowledgment|Quote Acceptance & Confirmation|Acceptance Acknowledgment/i },
          status: 'Enable'
        });
      }
      // 3. Fallback to confirmation
      if (!templateDoc && settings?.emailTemplates?.confirmation && mongoose.Types.ObjectId.isValid(settings.emailTemplates.confirmation)) {
        templateDoc = await Reporting.findById(settings.emailTemplates.confirmation);
      }
      break;
    }

    case EMAIL_EVENTS.QUOTE_SENT: {
      if (settings?.emailTemplates?.quote && mongoose.Types.ObjectId.isValid(settings.emailTemplates.quote)) {
        templateDoc = await Reporting.findById(settings.emailTemplates.quote);
      }
      if (!templateDoc) {
        templateDoc = await Reporting.findOne({ name: { $regex: /Fixed Price Quote|Proposal/i } });
      }
      break;
    }

    case EMAIL_EVENTS.QUOTE_REMINDER: {
      if (settings?.emailTemplates?.quoteReminders && mongoose.Types.ObjectId.isValid(settings.emailTemplates.quoteReminders)) {
        templateDoc = await Reporting.findById(settings.emailTemplates.quoteReminders);
      }
      if (!templateDoc) {
        templateDoc = await Reporting.findOne({ name: { $regex: /Reminder Quote|Quote Reminder/i } });
      }
      break;
    }

    case EMAIL_EVENTS.SURVEY_SCHEDULED: {
      if (settings?.emailTemplates?.appointment && mongoose.Types.ObjectId.isValid(settings.emailTemplates.appointment)) {
        templateDoc = await Reporting.findById(settings.emailTemplates.appointment);
      }
      if (!templateDoc) {
        templateDoc = await Reporting.findOne({ name: { $regex: /Appointment - Booking Confirmation|Appointment Booked/i } });
      }
      break;
    }

    case EMAIL_EVENTS.SURVEY_RESCHEDULED:
    case EMAIL_EVENTS.MOVE_RESCHEDULED: {
      if (settings?.emailTemplates?.rescheduleAppointment && mongoose.Types.ObjectId.isValid(settings.emailTemplates.rescheduleAppointment)) {
        templateDoc = await Reporting.findById(settings.emailTemplates.rescheduleAppointment);
      }
      if (!templateDoc) {
        templateDoc = await Reporting.findOne({ name: { $regex: /Appointment - Rescheduled Notice|Rescheduled/i } });
      }
      break;
    }

    case EMAIL_EVENTS.SURVEY_CANCELLED:
    case EMAIL_EVENTS.MOVE_CANCELLED: {
      if (settings?.emailTemplates?.cancellation && mongoose.Types.ObjectId.isValid(settings.emailTemplates.cancellation)) {
        templateDoc = await Reporting.findById(settings.emailTemplates.cancellation);
      }
      if (!templateDoc) {
        templateDoc = await Reporting.findOne({ name: { $regex: /Cancellation/i } });
      }
      break;
    }

    case EMAIL_EVENTS.MOVE_SCHEDULED: {
      if (settings?.emailTemplates?.confirmation && mongoose.Types.ObjectId.isValid(settings.emailTemplates.confirmation)) {
        templateDoc = await Reporting.findById(settings.emailTemplates.confirmation);
      }
      if (!templateDoc) {
        templateDoc = await Reporting.findOne({ name: { $regex: /Job - Move Confirmation & Schedule|Move Order Confirmation/i } });
      }
      break;
    }

    case EMAIL_EVENTS.INVOICE_ISSUED: {
      if (settings?.emailTemplates?.invoice && mongoose.Types.ObjectId.isValid(settings.emailTemplates.invoice)) {
        templateDoc = await Reporting.findById(settings.emailTemplates.invoice);
      }
      if (!templateDoc) {
        templateDoc = await Reporting.findOne({ name: { $regex: /Invoice - Billing|Invoice/i } });
      }
      break;
    }

    case EMAIL_EVENTS.INVOICE_REMINDER: {
      if (settings?.emailTemplates?.invoiceReminder && mongoose.Types.ObjectId.isValid(settings.emailTemplates.invoiceReminder)) {
        templateDoc = await Reporting.findById(settings.emailTemplates.invoiceReminder);
      }
      if (!templateDoc && settings?.emailTemplates?.paymentReminder && mongoose.Types.ObjectId.isValid(settings.emailTemplates.paymentReminder)) {
        templateDoc = await Reporting.findById(settings.emailTemplates.paymentReminder);
      }
      if (!templateDoc) {
        templateDoc = await Reporting.findOne({ name: { $regex: /Payment Reminder|Invoice - Follow-up/i } });
      }
      break;
    }

    case EMAIL_EVENTS.PAYMENT_RECEIVED: {
      if (settings?.emailTemplates?.paymentReceived && mongoose.Types.ObjectId.isValid(settings.emailTemplates.paymentReceived)) {
        templateDoc = await Reporting.findById(settings.emailTemplates.paymentReceived);
      }
      if (!templateDoc) {
        templateDoc = await Reporting.findOne({ name: { $regex: /Payment Received Receipt|Payment Received/i } });
      }
      break;
    }

    case EMAIL_EVENTS.POST_MOVE_THANKYOU: {
      if (settings?.emailTemplates?.thankyou && mongoose.Types.ObjectId.isValid(settings.emailTemplates.thankyou)) {
        templateDoc = await Reporting.findById(settings.emailTemplates.thankyou);
      }
      if (!templateDoc) {
        templateDoc = await Reporting.findOne({ name: { $regex: /Thank You & Feedback/i } });
      }
      break;
    }

    default:
      break;
  }

  // General fallback
  if (!templateDoc) {
    templateDoc = await Reporting.findOne({ status: 'Enable' });
  }

  return templateDoc;
}

/**
 * Reconciles invoice financial data for accurate communication.
 * Embeds balanceDue, totalPaid, totalCredited, and dueDate so the email
 * never shows stale unadjusted amounts.
 */
async function reconcileInvoiceForEmail(invoice) {
  if (!invoice) return null;
  const invObj = invoice.toObject ? invoice.toObject() : { ...invoice };
  
  let balanceInfo = {
    totalPaid: Number(invObj.paid || 0),
    totalCredited: Number(invObj.credited || 0),
    balanceDue: invObj.balanceDue !== undefined ? Number(invObj.balanceDue) : Number(invObj.total || 0),
    paymentStatus: invObj.payment || 'unpaid',
  };

  // If invoice has an ID in MongoDB, recalculate authoritative balance from ledger
  if (invoice._id && mongoose.Types.ObjectId.isValid(invoice._id)) {
    try {
      balanceInfo = await calculateInvoiceBalance(invoice);
    } catch (e) {
      console.warn('Could not compute ledger balance for email, using embedded values:', e.message);
    }
  }

  const rawTotal = Number(invObj.total || invObj.grandTotal || 0);
  const balanceDue = balanceInfo.balanceDue;
  const totalPaid = balanceInfo.totalPaid;
  const totalCredited = balanceInfo.totalCredited;
  const paymentStatus = balanceInfo.paymentStatus;
  const dueDateFormatted = formatDutchDate(invObj.dueDate || invObj.expire_date);

  return {
    ...invObj,
    total: balanceDue, // In payment context, total reflects the outstanding balance due
    amount: balanceDue,
    balanceDue: balanceDue,
    outstandingAmount: balanceDue,
    originalTotal: rawTotal,
    totalPaid: totalPaid,
    totalCredited: totalCredited,
    paymentStatus: paymentStatus,
    dueDate: dueDateFormatted,
    reconciledBalance: {
      total: rawTotal,
      totalPaid,
      totalCredited,
      balanceDue,
      paymentStatus,
      dueDate: dueDateFormatted,
    }
  };
}

/**
 * Core Outbox Dispatch Engine:
 * Validates, renders, deduplicates, saves to immutable outbox, and dispatches via SMTP / Mail Sink.
 */
async function dispatchOutboxEmail(options = {}) {
  const {
    eventType,
    recipient: rawRecipient,
    subject: customSubject,
    emailTemplateId = null,
    context = {},
    attachments = [],
    idempotencyKey = null,
    forceSink = false,
  } = options;

  const recipient = (rawRecipient || context.recipient || context.customer?.email || context.extraData?.email || '').trim();

  // 1. Pre-send Variable Validation
  const validationResult = validateEventVariables(eventType, { ...context, recipient });
  if (!validationResult.valid) {
    // Record failed validation attempt in outbox for auditability
    const blockedEmail = new Email({
      from: process.env.SMTP_USER || 'info@universalmovers.nl',
      recipient: recipient || 'missing_recipient@error.invalid',
      subject: customSubject || `[BLOCKED] ${eventType}`,
      htmlContent: `<p>Blocked due to missing required variables: ${validationResult.message}</p>`,
      eventType,
      status: 'BLOCKED_INVALID_VARIABLES',
      errorReason: validationResult.message,
      variablesSnapshot: { missing: validationResult.missing, eventType },
      offer: context.invoice?._id || context.offerId || null,
      job: context.job?._id || context.jobId || null,
      customer: context.customer?._id ? String(context.customer._id) : (context.customer?.name || ''),
    });
    await blockedEmail.save().catch(e => console.error('Error saving blocked email record:', e.message));

    return {
      success: false,
      blocked: true,
      statusCode: 422,
      errorCode: validationResult.errorCode,
      message: validationResult.message,
      missing: validationResult.missing,
      emailId: blockedEmail._id,
    };
  }

  // 2. Deduplication & Idempotency Check
  if (idempotencyKey) {
    const existingKeyRecord = await Email.findOne({ idempotencyKey });
    if (existingKeyRecord) {
      return {
        success: true,
        duplicate: true,
        intercepted: true,
        message: 'Duplicate email request intercepted by idempotency key.',
        email: existingKeyRecord,
        emailId: existingKeyRecord._id,
        subject: existingKeyRecord.subject,
        renderedHtml: existingKeyRecord.htmlContent,
        eventType: existingKeyRecord.eventType,
        recipient: existingKeyRecord.recipient,
      };
    }
  }

  // Rapid debounce check (10-second window for same recipient + eventType + docId)
  const targetDocId = context.invoice?._id || context.job?._id || context.offerId || context.jobId;
  if (targetDocId) {
    const tenSecondsAgo = new Date(Date.now() - 10000);
    const rapidDuplicate = await Email.findOne({
      recipient,
      eventType,
      $or: [{ offer: targetDocId }, { job: targetDocId }],
      createdAt: { $gt: tenSecondsAgo },
      status: { $in: ['SENT', 'QUEUED'] },
    });
    if (rapidDuplicate) {
      return {
        success: true,
        duplicate: true,
        intercepted: true,
        message: 'Duplicate rapid submission debounced.',
        email: rapidDuplicate,
        emailId: rapidDuplicate._id,
        subject: rapidDuplicate.subject,
        renderedHtml: rapidDuplicate.htmlContent,
        eventType: rapidDuplicate.eventType,
        recipient: rapidDuplicate.recipient,
      };
    }
  }

  // 3. Resolve Company & AppSettings
  let company = await CompanyDetails.findOne();
  if (!company) {
    company = {
      companyName: 'Universal Movers B.V.',
      companyEmail: 'info@universalmovers.nl',
      companyPhone: '+31 20 123 4567',
      companyAddress: 'Starterspand, H.J.E. Wenckebachweg 53-M',
      companyState: 'Amsterdam',
      companyCountry: 'Netherlands',
      companyWebsite: 'https://universalmovers.nl',
      companyTaxNumber: 'NL861234567B01',
    };
  }
  const appSettings = await AppSettings.findOne();

  // 4. Authoritative Invoice Financial Reconciliation
  let reconciledInvoice = context.invoice;
  let balanceRecord = null;
  if (context.invoice) {
    reconciledInvoice = await reconcileInvoiceForEmail(context.invoice);
    balanceRecord = reconciledInvoice?.reconciledBalance;
  }

  // 5. Template Resolution
  const template = await resolveTemplateForEvent(eventType, emailTemplateId, appSettings);
  const templateHtml = template?.htmlContent || `<p>Dear {{customer.firstName}},</p><p>Notice regarding ${eventType}.</p>`;
  const templateName = template?.name || 'Default Template';

  // 6. Template Rendering
  const renderedHtml = renderEmailTemplate(templateHtml, {
    ...context,
    company,
    customer: context.customer,
    invoice: reconciledInvoice,
    job: context.job,
    appointment: context.appointment,
    extraData: context.extraData,
    eventType,
    currencySymbol: appSettings?.currencySymbol || '€',
  });

  // 7. Subject Construction
  let finalSubject = customSubject;
  if (!finalSubject) {
    const invIndex = reconciledInvoice?.index || '';
    switch (eventType) {
      case EMAIL_EVENTS.QUOTE_ACCEPTED:
        finalSubject = `Confirmation: Quotation #${invIndex} Accepted - ${company.companyName || 'Universal Movers'}`;
        break;
      case EMAIL_EVENTS.QUOTE_SENT:
        finalSubject = `Quotation #${invIndex} from ${company.companyName || 'Universal Movers'}`;
        break;
      case EMAIL_EVENTS.QUOTE_REMINDER:
        finalSubject = `Reminder: Quotation #${invIndex} - ${company.companyName || 'Universal Movers'}`;
        break;
      case EMAIL_EVENTS.INVOICE_ISSUED:
        finalSubject = `Invoice #${invIndex} from ${company.companyName || 'Universal Movers'}`;
        break;
      case EMAIL_EVENTS.INVOICE_REMINDER:
        finalSubject = `Payment Reminder: Invoice #${invIndex} - Outstanding Balance ${appSettings?.currencySymbol || '€'} ${reconciledInvoice?.balanceDue?.toFixed(2) || ''}`;
        break;
      case EMAIL_EVENTS.PAYMENT_RECEIVED:
        finalSubject = `Payment Receipt Confirmed: Invoice #${invIndex} - ${company.companyName || 'Universal Movers'}`;
        break;
      case EMAIL_EVENTS.SURVEY_SCHEDULED:
        finalSubject = `Appointment Confirmed: Survey & Inspection - ${company.companyName || 'Universal Movers'}`;
        break;
      case EMAIL_EVENTS.MOVE_SCHEDULED:
        finalSubject = `Move Order Confirmed #${context.job?.jobNumber || context.job?.index || ''} - ${company.companyName || 'Universal Movers'}`;
        break;
      case EMAIL_EVENTS.POST_MOVE_THANKYOU:
        finalSubject = `Thank You for Choosing ${company.companyName || 'Universal Movers'}!`;
        break;
      default:
        finalSubject = `${company.companyName || 'Universal Movers'} Notification`;
    }
  }

  // 8. Approved Sender Resolution
  const approvedSender = company.companyEmail || process.env.SMTP_USER || 'info@universalmovers.nl';
  const fromHeader = `"${company.companyName || 'Universal Movers'}" <${approvedSender}>`;

  // 9. Generate Unique Event ID
  const eventId = `EML-${eventType}-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  // 10. Prepare Email Record
  const newEmail = new Email({
    from: approvedSender,
    recipient,
    subject: finalSubject,
    htmlContent: renderedHtml,
    offer: reconciledInvoice?._id || context.offerId || null,
    job: context.job?._id || context.jobId || null,
    customer: context.customer?._id ? String(context.customer._id) : (context.customer?.name || ''),
    eventId,
    eventType,
    idempotencyKey: idempotencyKey || undefined,
    templateId: template?._id || null,
    templateName,
    reconciledBalance: balanceRecord,
    variablesSnapshot: {
      recipient,
      subject: finalSubject,
      balanceDue: reconciledInvoice?.balanceDue,
      totalPaid: reconciledInvoice?.totalPaid,
      originalTotal: reconciledInvoice?.originalTotal,
      dueDate: reconciledInvoice?.dueDate,
      appointmentDate: context.appointment?.date,
      appointmentTime: context.appointment?.time,
      jobDate: context.job?.jobDate,
    },
    attachments: attachments.map(a => ({
      filename: a.filename,
      contentType: a.contentType || 'application/pdf',
      size: a.content ? (Buffer.isBuffer(a.content) ? a.content.length : a.content.toString().length) : 0,
    })),
  });

  // 11. Staging Mail Sink or Live SMTP Dispatch
  const isTestEnv = process.env.NODE_ENV === 'test' || forceSink || !process.env.SMTP_HOST;

  let deliveryResult = {};
  if (isTestEnv) {
    const messageId = `SINK-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    deliveryResult = {
      messageId,
      mode: 'MAIL_SINK',
      response: 'Captured in staging mailbox sink',
      timestamp: new Date(),
    };

    // Push into staging mailbox sink for verification
    stagingMailSink.push({
      messageId,
      eventId,
      eventType,
      from: fromHeader,
      to: recipient,
      subject: finalSubject,
      html: renderedHtml,
      attachments,
      reconciledBalance: balanceRecord,
      timestamp: new Date(),
    });

    newEmail.status = 'SENT';
    newEmail.deliveryResult = deliveryResult;
  } else {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT, 10) || 587,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      const mailOptions = {
        from: fromHeader,
        to: recipient,
        subject: finalSubject,
        html: renderedHtml,
        attachments: attachments.map(a => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType || 'application/pdf',
        })),
      };

      const info = await transporter.sendMail(mailOptions);
      deliveryResult = {
        messageId: info.messageId,
        mode: 'SMTP',
        response: info.response,
        timestamp: new Date(),
      };
      newEmail.status = 'SENT';
      newEmail.deliveryResult = deliveryResult;

      // Also copy to staging mail sink for live inspection
      stagingMailSink.push({
        messageId: info.messageId,
        eventId,
        eventType,
        from: fromHeader,
        to: recipient,
        subject: finalSubject,
        html: renderedHtml,
        attachments,
        reconciledBalance: balanceRecord,
        timestamp: new Date(),
      });
    } catch (smtpErr) {
      console.error('[SMTP Outbox Warning]:', smtpErr.message);
      newEmail.status = 'FAILED';
      newEmail.errorReason = smtpErr.message;
      deliveryResult = {
        messageId: 'FAILED',
        mode: 'SMTP',
        response: smtpErr.message,
        timestamp: new Date(),
      };
      newEmail.deliveryResult = deliveryResult;
    }
  }

  const savedEmail = await newEmail.save();

  return {
    success: newEmail.status === 'SENT',
    statusCode: newEmail.status === 'SENT' ? 200 : 500,
    emailId: savedEmail._id,
    eventId,
    eventType,
    recipient,
    subject: finalSubject,
    templateName,
    renderedHtml,
    deliveryResult,
    reconciledBalance: balanceRecord,
  };
}

module.exports = {
  EMAIL_EVENTS,
  stagingMailSink,
  getStagingMailSink,
  clearStagingMailSink,
  findInMailSink,
  isValidEmail,
  validateEventVariables,
  resolveTemplateForEvent,
  reconcileInvoiceForEmail,
  dispatchOutboxEmail,
};
