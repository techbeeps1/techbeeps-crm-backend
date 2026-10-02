const DEFAULT_R2_LOGO = 'https://pub-5a1825f2dbec4d2eb0b6c533f4b0fa5f.r2.dev/logos/universal_movers_logo.png';
const TECHBEEPS_LOGO_REGEX = /https:\/\/assets\.unlayer\.com\/projects\/0\/1732090350147-logo\.png(\?[^"'\s>]*)?/gi;

/**
 * Normalizes company details object so both prefixed and standard keys resolve cleanly.
 */
function normalizeCompany(company) {
  const c = company ? (company.toObject ? company.toObject() : { ...company }) : {};
  const name = c.companyName || c.name || 'Universal Movers B.V.';
  const email = c.companyEmail || c.email || 'info@universalmovers.nl';
  const phone = c.companyPhone || c.phone || '+31 20 123 4567';
  const address = c.companyAddress || c.address || 'Starterspand, H.J.E. Wenckebachweg 53-M';
  const state = c.companyState || c.state || 'Amsterdam';
  const country = c.companyCountry || c.country || 'Netherlands';
  const website = c.companyWebsite || c.website || 'https://universalmovers.nl';
  const taxNumber = c.companyTaxNumber || c.taxNumber || 'NL861234567B01';
  const vatNumber = c.companyVatNumber || c.vatNumber || taxNumber;
  const regNumber = c.companyRegNumber || c.regNumber || '81234567';
  const logoUrl = c.logoUrl && c.logoUrl.startsWith('http') ? c.logoUrl : DEFAULT_R2_LOGO;

  return {
    ...c,
    companyName: name,
    name,
    companyEmail: email,
    email,
    companyPhone: phone,
    phone,
    companyAddress: address,
    address,
    companyState: state,
    state,
    companyCountry: country,
    country,
    companyWebsite: website,
    website,
    companyTaxNumber: taxNumber,
    taxNumber,
    companyVatNumber: vatNumber,
    vatNumber,
    companyRegNumber: regNumber,
    regNumber,
    logoUrl,
  };
}

/**
 * Normalizes customer details object.
 */
function normalizeCustomer(customer) {
  if (!customer) return {};
  const cust = customer.toObject ? customer.toObject() : { ...customer };
  const firstName = cust.firstName || '';
  const lastName = cust.lastName || '';
  const fullName = cust.name || `${firstName} ${lastName}`.trim() || cust.username || 'Valued Customer';
  const email = cust.email || '';
  const phone = cust.phone || cust.phoneNumber || '';
  const address = cust.address || '';

  return {
    ...cust,
    firstName: firstName || fullName,
    lastName,
    name: fullName,
    fullName,
    email,
    phone,
    phoneNumber: phone,
    address,
  };
}

/**
 * Renders an email template by substituting dynamic variables and ensuring the Cloudflare R2 logo is used.
 * @param {string} htmlContent - Raw HTML of email template
 * @param {object} context - { company, customer, invoice, job, appointment, data, extraData, link }
 * @returns {string} Fully parsed and substituted HTML
 */
function renderEmailTemplate(htmlContent, context = {}) {
  if (!htmlContent || typeof htmlContent !== 'string') {
    return '';
  }

  const normalizedComp = normalizeCompany(context.company);
  const normalizedCust = normalizeCustomer(context.customer);
  const inv = context.invoice ? (context.invoice.toObject ? context.invoice.toObject() : { ...context.invoice }) : {};
  const jb = context.job ? (context.job.toObject ? context.job.toObject() : { ...context.job }) : {};
  const appt = context.appointment ? (context.appointment.toObject ? context.appointment.toObject() : { ...context.appointment }) : {};
  const ext = context.extraData || context.data || {};

  const activeLogo = normalizedComp.logoUrl || DEFAULT_R2_LOGO;

  // 1. Automatically replace hardcoded Techbeeps unlayer logo with the active Cloudflare R2 logo
  let rendered = htmlContent.replace(TECHBEEPS_LOGO_REGEX, activeLogo);

  const invId = inv._id || inv.id || '';
  const acceptQuoteUrl = context.acceptQuoteUrl || context.quoteUrl || context.link || (invId ? `https://universal-movers-front.vercel.app/quotes/accept/${invId}` : 'https://universal-movers-front.vercel.app');
  const otpVal = context.otp || ext.otp || (context.data && context.data.otp) || '';

  // 2. Prepare comprehensive merged data map
  const data = {
    company: normalizedComp,
    customer: normalizedCust,
    user: context.user || normalizedCust,
    otp: otpVal,
    acceptQuoteUrl: acceptQuoteUrl,
    quoteUrl: acceptQuoteUrl,
    link: acceptQuoteUrl,
    invoice: {
      ...inv,
      index: inv.index || inv.invoiceNumber || inv._id || '',
      id: invId,
      total: inv.total !== undefined ? inv.total : (inv.grandTotal || ''),
      amount: inv.total !== undefined ? inv.total : (inv.grandTotal || ''),
      dueDate: inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '',
      date: inv.date ? new Date(inv.date).toLocaleDateString() : new Date().toLocaleDateString(),
      acceptQuoteUrl: acceptQuoteUrl,
      quoteUrl: acceptQuoteUrl,
      acceptUrl: acceptQuoteUrl,
    },
    job: {
      ...jb,
      jobNumber: jb.jobNumber || jb._id || '',
      jobDate: jb.jobDate ? new Date(jb.jobDate).toLocaleDateString() : '',
      status: jb.status || '',
    },
    appointment: {
      ...appt,
      date: appt.date || appt.appointmentDate || '',
      time: appt.time || appt.appointmentTime || '',
    },
    data: ext,
    extraData: ext,
    code: context.code || (invId ? `/${invId}` : ''),
    currency: context.currency || 'EUR',
    currencySymbol: context.currencySymbol || '€',
  };

  // Direct quick replacements
  rendered = rendered.replace(/{{\s*company\.logoUrl\s*}}/gi, activeLogo);
  rendered = rendered.replace(/{{\s*logoUrl\s*}}/gi, activeLogo);
  rendered = rendered.replace(/{{\s*acceptQuoteUrl\s*}}/gi, acceptQuoteUrl);
  rendered = rendered.replace(/{{\s*quoteUrl\s*}}/gi, acceptQuoteUrl);
  if (otpVal) {
    rendered = rendered.replace(/{{\s*otp\s*}}/gi, otpVal);
    rendered = rendered.replace(/{{\s*data\.otp\s*}}/gi, otpVal);
    rendered = rendered.replace(/{{\s*extraData\.otp\s*}}/gi, otpVal);
  }

  // 3. Replace double curly braces: {{object.property}} or {{property}}
  rendered = rendered.replace(/{{\s*([\w.]+)\s*}}/g, (match, path) => {
    const value = path.split('.').reduce((obj, prop) => {
      if (obj === null || obj === undefined) return undefined;
      return obj[prop];
    }, data);

    if (value !== undefined && value !== null) {
      return String(value);
    }
    return '';
  });

  // 4. Remove any unresolved ES6 template syntax like ${...}
  rendered = rendered.replace(/\$\{[^}]*\}/g, '');

  return rendered;
}

module.exports = {
  DEFAULT_R2_LOGO,
  normalizeCompany,
  normalizeCustomer,
  renderEmailTemplate,
};
