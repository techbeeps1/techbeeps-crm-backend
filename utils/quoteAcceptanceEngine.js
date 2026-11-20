const mongoose = require('mongoose');
const crypto = require('crypto');
const Finance = require('../models/finance');
const JobSchedule = require('../models/jobSchedule');
const Activity = require('../models/activityModel');
const { calculateCommercialTotals } = require('./moneyCalculator');

/**
 * Validates whether a quotation is in an eligible state for acceptance.
 * 
 * Rules:
 * - Must exist in database.
 * - If already accepted: eligible (will be handled idempotently).
 * - Superseded quote: strictly REJECTED (409 Conflict).
 * - Revoked, Cancelled, Declined quote: strictly REJECTED (409 Conflict).
 * - Expired quote (link or date): strictly REJECTED (410 Gone).
 * - Draft quote:
 *     - If public recipient: strictly REJECTED (422 Unprocessable Entity).
 *     - If staff user in on-site signature flow: ALLOWED (issues & freezes version).
 * - Version mismatch: strictly REJECTED (409 Conflict).
 */
function validateAcceptanceEligibility(quote, options = {}) {
  const { staffUser, requestedVersion, method } = options;

  if (!quote) {
    return {
      eligible: false,
      statusCode: 404,
      errorCode: 'QUOTE_NOT_FOUND',
      message: 'Quotation not found.',
    };
  }

  // Idempotency: already accepted
  if (quote.acceptance?.isAccepted || (quote.Status && quote.Status.toLowerCase() === 'accepted')) {
    return {
      eligible: true,
      alreadyAccepted: true,
      quote,
    };
  }

  // Superseded check
  if (quote.isSuperseded || (quote.Status && quote.Status.toLowerCase() === 'superseded')) {
    return {
      eligible: false,
      statusCode: 409,
      errorCode: 'QUOTE_SUPERSEDED',
      message: 'This quotation version has been superseded by a newer version and cannot be accepted.',
    };
  }

  // Revocation / Cancellation / Declined / Rejected check
  const statusLower = (quote.Status || '').toLowerCase();
  if (['revoked', 'cancelled', 'declined', 'rejected'].includes(statusLower)) {
    return {
      eligible: false,
      statusCode: 409,
      errorCode: 'QUOTE_REVOKED',
      message: `This quotation has been ${statusLower} and is no longer eligible for acceptance.`,
    };
  }

  // Expiry check
  const now = new Date();
  const isTokenExpired = quote.tokenExpiresAt && new Date(quote.tokenExpiresAt) < now;
  const isDateExpired = quote.expire_date && new Date(quote.expire_date) < now;
  if (isTokenExpired || isDateExpired || statusLower === 'expired') {
    return {
      eligible: false,
      statusCode: 410,
      errorCode: 'QUOTE_EXPIRED',
      message: 'Quotation acceptance link has expired.',
    };
  }

  // Draft check
  if (statusLower === 'draft') {
    const isOnSiteStaff = method === 'ON_SITE_SIGNATURE' && staffUser && ['Admin', 'Staff', 'Agent'].includes(staffUser.role);
    if (!isOnSiteStaff) {
      return {
        eligible: false,
        statusCode: 422,
        errorCode: 'DRAFT_ACCEPTANCE_BLOCKED',
        message: 'Draft quotation cannot be accepted by public recipient. Quotation must be officially issued or sent before acceptance.',
      };
    }
    // On-site staff path: approved to issue & freeze
    return {
      eligible: true,
      requireOnSiteIssuance: true,
      quote,
    };
  }

  // Version check (if requestedVersion specified by client)
  if (requestedVersion !== undefined && requestedVersion !== null) {
    const currentVersion = quote.version || 1;
    if (Number(requestedVersion) !== Number(currentVersion)) {
      return {
        eligible: false,
        statusCode: 409,
        errorCode: 'VERSION_MISMATCH',
        message: `Quotation version ${requestedVersion} does not match current eligible version ${currentVersion}.`,
      };
    }
  }

  return {
    eligible: true,
    quote,
  };
}

/**
 * Executes quote acceptance with immutable snapshot, consent provenance,
 * server-side idempotency, and downstream job lifecycle transition.
 */
async function executeAcceptance({ quoteIdOrToken, acceptancePayload = {}, staffUser = null, clientIp = '', userAgent = '', idempotencyKey = null }) {
  if (!quoteIdOrToken) {
    return {
      statusCode: 400,
      success: false,
      errorCode: 'INVALID_IDENTIFIER',
      message: 'Quotation identifier or capability token is required.',
    };
  }

  const isObjectId = mongoose.Types.ObjectId.isValid(quoteIdOrToken);
  const query = isObjectId
    ? { $or: [{ _id: quoteIdOrToken }, { capabilityToken: quoteIdOrToken }] }
    : { capabilityToken: quoteIdOrToken };

  const quote = await Finance.findOne(query).populate('customer package job');

  const method = acceptancePayload.method || (staffUser ? 'ON_SITE_SIGNATURE' : 'PUBLIC_LINK');
  const requestedVersion = acceptancePayload.version !== undefined ? acceptancePayload.version : undefined;

  const eligibility = validateAcceptanceEligibility(quote, {
    staffUser,
    requestedVersion,
    method,
  });

  if (!eligibility.eligible) {
    return {
      statusCode: eligibility.statusCode,
      success: false,
      errorCode: eligibility.errorCode,
      message: eligibility.message,
    };
  }

  // Idempotent return if already accepted
  if (eligibility.alreadyAccepted) {
    const existingAckId = quote.acceptance?.acknowledgementEvent?.eventId || `ACK-EXISTING-${quote._id}`;
    return {
      statusCode: 200,
      success: true,
      idempotent: true,
      message: 'Quotation has already been accepted.',
      quote,
      acknowledgementEventId: existingAckId,
      acceptedAt: quote.acceptance?.acceptedAt || quote.acceptedAt || quote.updatedAt,
      acceptance: quote.acceptance,
    };
  }

  // If on-site staff workflow on draft, first transition to Sent/Issued
  if (eligibility.requireOnSiteIssuance) {
    quote.Status = 'Sent';
    if (!quote.version) quote.version = 1;
  }

  // Ensure customer document is populated for verified email lookup (UM3-025)
  if (quote.customer && !quote.customer.email && mongoose.Types.ObjectId.isValid(quote.customer)) {
    try {
      const Customer = require('../models/customer');
      const foundCustomer = await Customer.findById(quote.customer);
      if (foundCustomer) {
        quote.customer = foundCustomer;
      }
    } catch (custErr) {
      console.warn('Customer lookup warning in quote acceptance:', custErr.message);
    }
  }

  // Authoritative financial totals calculation
  const calculatedTotals = calculateCommercialTotals(quote);

  const CompanyDetails = require('../models/companyModel');
  const { APPROVED_COMPANY_DETAILS } = require('./statutoryInvoice');
  const companyDoc = (await CompanyDetails.findOne().lean()) || {};

  const resolvedCompanySnapshot = {
    legalName: companyDoc.companyName || APPROVED_COMPANY_DETAILS.companyName,
    tradeName: companyDoc.companyName || APPROVED_COMPANY_DETAILS.companyName,
    address: companyDoc.companyAddress || APPROVED_COMPANY_DETAILS.companyAddress,
    kvkNumber: companyDoc.kvkNumber || companyDoc.companyRegNumber || APPROVED_COMPANY_DETAILS.kvkNumber,
    vatNumber: companyDoc.btwNumber || companyDoc.companyVatNumber || APPROVED_COMPANY_DETAILS.btwNumber,
    bankName: companyDoc.bankName || APPROVED_COMPANY_DETAILS.bankName,
    iban: companyDoc.iban || APPROVED_COMPANY_DETAILS.iban,
    bic: companyDoc.bic || APPROVED_COMPANY_DETAILS.bic,
  };

  // Build immutable agreement snapshot
  const agreementSnapshot = {
    quoteId: quote._id,
    quoteIndex: quote.index,
    version: quote.version || 1,
    subTotal: calculatedTotals.subTotal,
    taxDetails: calculatedTotals.taxDetails,
    btw: String(calculatedTotals.btw),
    total: calculatedTotals.total,
    discount: quote.discount || 0,
    discountedPrice: calculatedTotals.discountedPrice || quote.discountedPrice || 0,
    items: JSON.parse(JSON.stringify(quote.items || [])),
    package: quote.package ? (quote.package.name || quote.package._id || quote.package) : null,
    customerSnapshot: quote.customer ? {
      id: quote.customer._id,
      name: `${quote.customer.firstName || ''} ${quote.customer.lastName || ''}`.trim(),
      email: quote.customer.email,
      phone: quote.customer.phone,
      address: quote.customer.address,
    } : null,
    companySnapshot: resolvedCompanySnapshot,
    terms: 'Approved Universal Movers B.V. Standard Commercial & Relocation Terms',
    validityDate: quote.expire_date || quote.tokenExpiresAt,
    depositRequired: quote.depositRequired || 0,
    frozenAt: new Date(),
  };

  // Generate unique dedicated acknowledgement event ID
  const ackEventId = `ACK-QUO-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const acceptedAt = new Date();

  // Resolve customer name and email (UM3-025: Strictly prioritize verified customer record over untrusted payload)
  const verifiedCustomerName = quote.customer ? `${quote.customer.firstName || ''} ${quote.customer.lastName || ''}`.trim() : '';
  const resolvedCustomerName = verifiedCustomerName || (acceptancePayload.name || '').trim() || 'Customer';

  const verifiedCustomerEmail = (quote.customer && quote.customer.email ? quote.customer.email : '').trim();
  const signerProvidedEmail = (acceptancePayload.email || '').trim();
  const isRedirectAttempt = Boolean(
    signerProvidedEmail &&
    verifiedCustomerEmail &&
    signerProvidedEmail.toLowerCase() !== verifiedCustomerEmail.toLowerCase()
  );

  if (isRedirectAttempt) {
    console.warn(`[Security UM3-025] Quote acceptance signer email "${signerProvidedEmail}" differs from verified customer email "${verifiedCustomerEmail}". Confirmation email will be delivered strictly to verified customer email.`);
  }

  // Authoritative recipient is strictly the verified customer email if available
  const resolvedCustomerEmail = verifiedCustomerEmail || signerProvidedEmail;
  const signatureData = acceptancePayload.customerSignature || acceptancePayload.signature || 'DIGITALLY_CONFIRMED';

  // Apply state change
  quote.Status = 'Accepted';
  quote.acceptedAt = acceptedAt;
  quote.customerSignature = signatureData;
  quote.subTotal = calculatedTotals.subTotal;
  quote.total = calculatedTotals.total;
  quote.btw = String(calculatedTotals.btw);

  quote.acceptance = {
    isAccepted: true,
    acceptedAt: acceptedAt,
    acceptedVersion: quote.version || 1,
    method: method,
    customerIdentity: {
      name: resolvedCustomerName,
      email: resolvedCustomerEmail,
      signerProvidedEmail: signerProvidedEmail || undefined,
      signerProvidedName: (acceptancePayload.name || '').trim() || undefined,
      emailRedirectAttemptBlocked: isRedirectAttempt,
      comments: (acceptancePayload.comments || '').trim(),
      ipAddress: clientIp || '',
      userAgent: userAgent || '',
    },
    signature: {
      data: signatureData,
      capturedAt: acceptedAt,
    },
    staffActor: staffUser ? {
      userId: staffUser._id || staffUser.id,
      name: staffUser.name || `${staffUser.firstName || ''} ${staffUser.lastName || ''}`.trim() || 'Staff Member',
      email: staffUser.email,
      role: staffUser.role,
    } : undefined,
    immutableAgreementSnapshot: agreementSnapshot,
    acknowledgementEvent: {
      eventId: ackEventId,
      timestamp: acceptedAt,
      type: 'QUOTE_ACCEPTED',
    },
  };

  await quote.save();

  // Downstream Job lifecycle transition: Pending -> Processing
  try {
    const jobQuery = [{ offer: quote._id }];
    if (quote.job) {
      jobQuery.push({ _id: quote.job._id || quote.job });
    }
    const linkedJobs = await JobSchedule.find({ $or: jobQuery });
    for (const job of linkedJobs) {
      const currentStatus = (job.status || '').toLowerCase();
      if (['pending', 'draft'].includes(currentStatus)) {
        job.status = 'Processing';
        await job.save();
      }
    }
  } catch (jobErr) {
    console.error('Error updating linked job status on quote acceptance:', jobErr.message);
  }

  // Record activity log for the dedicated acknowledgement event
  try {
    await Activity.create({
      type: 'offer',
      title: `Quotation # ${quote.index || quote._id} accepted by ${resolvedCustomerName}`,
      offer: quote._id,
      reference: staffUser ? 'Staff / On-Site' : 'Customer / Public',
      status: 'success',
      comment: acceptancePayload.comments || '',
      sender: resolvedCustomerEmail,
      acknowledgementEventId: ackEventId,
    });
  } catch (actErr) {
    // Non-blocking for activity logging
    console.warn('Non-blocking activity logging warning:', actErr.message);
  }

  // EXEC-26: Dispatch Quote Acceptance Acknowledgment via Outbox (never post-move thank-you)
  let emailDeliveryResult = null;
  if (resolvedCustomerEmail) {
    try {
      const { dispatchOutboxEmail, EMAIL_EVENTS } = require('./emailOutboxService');
      emailDeliveryResult = await dispatchOutboxEmail({
        eventType: EMAIL_EVENTS.QUOTE_ACCEPTED,
        recipient: resolvedCustomerEmail,
        context: {
          customer: quote.customer || { name: resolvedCustomerName, email: resolvedCustomerEmail, firstName: resolvedCustomerName.split(' ')[0] },
          invoice: quote,
          code: quote.capabilityToken ? `/${quote.capabilityToken}` : `/${quote._id}`,
        },
        idempotencyKey: idempotencyKey || ackEventId,
      });
    } catch (emailErr) {
      console.warn('Non-blocking quote acceptance acknowledgment email warning:', emailErr.message);
    }
  }

  return {
    statusCode: 200,
    success: true,
    message: 'Quotation successfully accepted.',
    quote,
    acknowledgementEventId: ackEventId,
    acceptedAt: acceptedAt,
    immutableAgreementSnapshot: agreementSnapshot,
    acceptance: quote.acceptance,
    acknowledgementEmail: emailDeliveryResult,
  };
}

module.exports = {
  validateAcceptanceEligibility,
  executeAcceptance,
};
