const Finance = require('../models/finance');
const JobSchedule = require('../models/jobSchedule');
const Customer = require('../models/customer');
const Address = require('../models/addressModel');
const User = require('../models/user');
const Package = require('../models/PackageModel');
const DocumentTemplate = require('../models/documentTemplateModel');
const mongoose = require('mongoose');
const { ObjectId } = require("mongodb");
const CompanyDetails = require("../models/companyModel");
const nodemailer = require('nodemailer');
const EmailTemplate = require('../models/reporting');

const Email = require('../models/Email/email');
const jwt = require('jsonwebtoken');
const AppSettings = require('../models/appSettingModel');
const SalesGroup = require('../models/salesgroupModel');
const { renderEmailTemplate } = require('../utils/emailTemplateUtil');
const { calculateCommercialTotals, roundToCents } = require('../utils/moneyCalculator');
const { resolveTaxRate } = require('../utils/taxCatalog');
const { validateAcceptanceEligibility, executeAcceptance } = require('../utils/quoteAcceptanceEngine');
const { dispatchOutboxEmail, EMAIL_EVENTS } = require('../utils/emailOutboxService');

const sanitizeFinancePayload = async (data) => {
  if (!data) return data;
  const payload = { ...data };

  if (Array.isArray(payload.items)) {
    payload.items = await Promise.all(
      payload.items.map(async (item) => {
        const itemObj = { ...item };
        if (itemObj.salesgroup) {
          const sgVal = String(itemObj.salesgroup).trim();
          const isValidId = /^[0-9a-fA-F]{24}$/.test(sgVal);
          if (!isValidId) {
            try {
              const matched = await SalesGroup.findOne({
                name: { $regex: new RegExp(`^${sgVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
              });
              if (matched) {
                itemObj.salesgroup = matched._id;
              } else {
                delete itemObj.salesgroup;
              }
            } catch (err) {
              delete itemObj.salesgroup;
            }
          }
        } else {
          delete itemObj.salesgroup;
        }
        return itemObj;
      })
    );

    // EXEC-15: Server Authoritative Money Calculation Contract
    const calc = calculateCommercialTotals(payload);
    payload.items = calc.items;
    payload.subTotal = calc.subTotal;
    payload.discount = calc.discount;
    payload.discountedPrice = calc.discountedPrice;
    payload.btw = calc.btw;
    payload.total = calc.total;
    payload.vat = calc.vat;
  }
  return payload;
};

exports.finance = async (req, res) => {
  try {
    const sanitizedBody = await sanitizeFinancePayload(req.body);

    // EXEC-28: Block direct creation in Accepted status
    if (sanitizedBody && sanitizedBody.Status && sanitizedBody.Status.toLowerCase() === 'accepted') {
      return res.status(422).json({
        error: 'DIRECT_ACCEPTED_CREATION_BLOCKED',
        msg: 'Quotations cannot be directly created in Accepted status. Quotations must be created in Draft/Sent and accepted through the official acceptance workflow.',
        message: 'Quotations cannot be directly created in Accepted status. Quotations must be created in Draft/Sent and accepted through the official acceptance workflow.'
      });
    }

    let finance = new Finance(sanitizedBody);
    const financeData = await finance.save();
    res.json(financeData);
  } catch (error) {
    res.status(500).json({
      message: 'Failed to save the quote',
      error: error.message
    });
  }
}

exports.acceptQuote = async (req, res) => {
  const { id } = req.params;
  const acceptancePayload = req.body || {};
  const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip;
  const userAgent = req.headers['user-agent'] || '';
  const idempotencyKey = req.headers['x-idempotency-key'] || acceptancePayload.idempotencyKey;

  try {
    let staffUser = null;
    const authHeader = req.header('Authorization');
    const token = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.replace('Bearer ', '').trim() : null;
    if (token && token !== 'null' && token !== 'undefined') {
      try {
        staffUser = jwt.verify(token, process.env.JWT_SECRET);
      } catch (err) {}
    }

    const result = await executeAcceptance({
      quoteIdOrToken: id,
      acceptancePayload,
      staffUser,
      clientIp,
      userAgent,
      idempotencyKey,
    });

    if (!result.success) {
      return res.status(result.statusCode).json({
        error: result.errorCode,
        msg: result.message,
        message: result.message,
      });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in acceptQuote:', error);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      msg: 'Failed to accept quotation',
      message: error.message,
    });
  }
};

exports.onSiteAcceptQuote = async (req, res) => {
  const { id } = req.params;
  const acceptancePayload = req.body || {};
  const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip;
  const userAgent = req.headers['user-agent'] || '';
  const idempotencyKey = req.headers['x-idempotency-key'] || acceptancePayload.idempotencyKey;

  try {
    const staffUser = req.user;
    const result = await executeAcceptance({
      quoteIdOrToken: id,
      acceptancePayload: { ...acceptancePayload, method: 'ON_SITE_SIGNATURE' },
      staffUser,
      clientIp,
      userAgent,
      idempotencyKey,
    });

    if (!result.success) {
      return res.status(result.statusCode).json({
        error: result.errorCode,
        msg: result.message,
        message: result.message,
      });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in onSiteAcceptQuote:', error);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      msg: 'Failed to record on-site acceptance',
      message: error.message,
    });
  }
};

exports.updateInvoice = async (req, res) => {
  const { id } = req.params;
  const updatedData = req.body || {};

  const isAcceptingQuote = updatedData.Status && updatedData.Status.toLowerCase() === 'accepted';
  const allowedPublicFields = ['Status', 'customerSignature', 'acceptedAt', 'method', 'name', 'email', 'comments', 'version'];
  const payloadKeys = Object.keys(updatedData);
  const isPublicAcceptanceOnly = isAcceptingQuote && payloadKeys.every(k => allowedPublicFields.includes(k));

  let decodedUser = null;
  const authHeader = req.header('Authorization');
  const token = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.replace('Bearer ', '').trim() : null;
  if (token && token !== 'null' && token !== 'undefined') {
    try {
      decodedUser = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {}
  }

  // If this update is attempting to accept a quotation, strictly route through the acceptance state machine!
  if (isAcceptingQuote) {
    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip;
    const userAgent = req.headers['user-agent'] || '';
    const idempotencyKey = req.headers['x-idempotency-key'] || updatedData.idempotencyKey;

    const result = await executeAcceptance({
      quoteIdOrToken: id,
      acceptancePayload: updatedData,
      staffUser: decodedUser,
      clientIp,
      userAgent,
      idempotencyKey,
    });

    if (!result.success) {
      return res.status(result.statusCode).json({
        error: result.errorCode,
        msg: result.message,
        message: result.message,
      });
    }

    return res.status(200).json(result.quote);
  }

  // Modifications other than customer quote acceptance require Admin authentication
  if (!token || token === 'null' || token === 'undefined') {
    return res.status(401).json({ msg: 'Authentication token required for invoice modification' });
  }
  if (!decodedUser || decodedUser.role !== 'Admin') {
    return res.status(403).json({ msg: 'Access denied: Staff and Agents cannot edit quotes' });
  }

  try {
    const isObjectId = mongoose.Types.ObjectId.isValid(id);
    const query = isObjectId ? { $or: [{ _id: id }, { capabilityToken: id }] } : { capabilityToken: id };

    // EXEC-28: Fetch existing quote to ensure immutable snapshot preservation
    const existingQuote = await Finance.findOne(query);
    if (!existingQuote) {
      return res.status(404).json({
        message: 'Invoice not found',
      });
    }

    // Freeze accepted quotes: immutable agreement snapshot
    if (existingQuote.acceptance?.isAccepted || (existingQuote.Status && existingQuote.Status.toLowerCase() === 'accepted')) {
      return res.status(422).json({
        error: 'MUTATION_OF_ACCEPTED_QUOTE_BLOCKED',
        msg: 'Cannot modify an accepted quotation. The accepted agreement is frozen and immutable. Create a new revision to propose changes.',
        message: 'Cannot modify an accepted quotation. The accepted agreement is frozen and immutable. Create a new revision to propose changes.'
      });
    }

    // Freeze superseded quotes
    if (existingQuote.isSuperseded || (existingQuote.Status && existingQuote.Status.toLowerCase() === 'superseded')) {
      return res.status(409).json({
        error: 'QUOTE_SUPERSEDED',
        msg: 'Cannot modify a superseded quotation version. Edit the latest active version instead.',
        message: 'Cannot modify a superseded quotation version. Edit the latest active version instead.'
      });
    }

    let payloadToSave = await sanitizeFinancePayload(updatedData);

    const updatedInvoice = await Finance.findOneAndUpdate(
      query,
      payloadToSave,
      {
        returnDocument: "after",
        runValidators: true,
      }
    );
    if (!updatedInvoice) {
      return res.status(404).json({
        message: 'Invoice not found',
      });
    }

    res.status(200).json(updatedInvoice);
  } catch (error) {
    res.status(500).json({
      message: 'Failed to update the invoice',
      error: error.message,
    });
  }
};

exports.financeDetail = async (req, res) => {
  const { Id } = req.params;
  const { template } = req.query;
  const token = req.header('Authorization')?.replace('Bearer ', '');

  try {
    if (!Id || Id === 'undefined' || Id === 'null') {
      return res.status(400).json({ message: "Invalid quote identifier" });
    }

    const isObjectId = mongoose.Types.ObjectId.isValid(Id);
    const query = isObjectId ? { $or: [{ _id: Id }, { capabilityToken: Id }] } : { capabilityToken: Id };

    const finance = await Finance.findOne(query).populate({
      path: 'customer',
      populate: {
        path: 'address',
        match: { addressType: 'head' },
      },
    }).populate('contactPerson', 'username').populate('package', 'name type_job priceAgree vat ignoreRules offers').populate('financialTemplate', !template && 'name').populate('items.salesgroup', 'name').populate({
      path: 'job',
      populate: { path: 'package' }
    }).populate('parentQuote', 'index version Status total').populate('supersededBy', 'index version Status total');

    if (!finance) {
      return res.status(404).json({ message: "Quotation not found" });
    }

    // EXEC-20: Authoritative Recalculation (Eliminate stale memoization/cached totals)
    const calc = calculateCommercialTotals(finance);
    finance.subTotal = calc.subTotal;
    finance.discount = calc.discount;
    finance.discountedPrice = calc.discountedPrice;
    finance.btw = calc.btw;
    finance.total = calc.total;
    finance.net = calc.net;
    finance.totalVat = calc.totalVat;

    // Capability token expiration check for public customers
    if (!token && finance.tokenExpiresAt && new Date() > new Date(finance.tokenExpiresAt)) {
      return res.status(410).json({ message: "This quotation link has expired. Please contact us for a refreshed quote." });
    }

    // If request is from an unauthenticated public recipient, sanitize DTO
    if (!token) {
      const { formatCustomerAddress, computeStatutoryTaxBreakdown, formatDutchDate } = require('../utils/statutoryInvoice');
      const { formatEnumDisplay, ENUM_TRANSLATIONS } = require('../utils/dutchLocaleUtil');
      const rawBreakdown = computeStatutoryTaxBreakdown(calc.items, calc.subTotal, calc.discount);
      const taxBreakdown = {
        rates: (rawBreakdown || []).map(r => ({
          rate: r.rate,
          rateLabel: r.rateLabel,
          taxableBase: r.netBase,
          netBase: r.netBase,
          vatAmount: r.vatAmount,
          grossAmount: r.grossAmount,
        })),
        totalBase: calc.net || calc.subTotal,
        totalVat: calc.totalVat,
      };
      
      let financialTemplate = finance.financialTemplate;
      if (!financialTemplate) {
        financialTemplate = await DocumentTemplate.findOne({
          $or: [
            { type: 'quote' },
            { name: /relocation.*estimate/i },
            { name: /quotation/i },
            { name: /quote/i }
          ]
        });
      }

      const pubFinance = {
        _id: finance._id,
        capabilityToken: finance.capabilityToken,
        index: finance.index,
        Status: finance.Status,
        date: formatDutchDate(finance.date || finance.createdAt),
        createdAt: finance.createdAt,
        total: finance.total,
        subtotal: finance.subtotal || finance.subTotal,
        subTotal: finance.subTotal,
        discount: finance.discount,
        discountedPrice: finance.discountedPrice,
        net: finance.net,
        totalVat: finance.totalVat,
        btw: finance.btw,
        vat: finance.vat,
        tax: finance.tax,
        taxBreakdown,
        version: finance.version || 1,
        isSuperseded: finance.isSuperseded || false,
        dueDate: formatDutchDate(finance.expire_date || finance.tokenExpiresAt || finance.dueDate || new Date(new Date(finance.date || finance.createdAt || Date.now()).getTime() + 30 * 86400000)),
        expire_date: formatDutchDate(finance.expire_date || finance.tokenExpiresAt || finance.dueDate || new Date(new Date(finance.date || finance.createdAt || Date.now()).getTime() + 30 * 86400000)),
        validUntil: formatDutchDate(finance.expire_date || finance.tokenExpiresAt || finance.dueDate || new Date(new Date(finance.date || finance.createdAt || Date.now()).getTime() + 30 * 86400000)),
        tokenExpiresAt: finance.tokenExpiresAt,
        acceptedAt: finance.acceptedAt,
        acceptance: finance.acceptance,
        statusLabel: formatEnumDisplay(finance.Status, 'en'),
        statusLabelEn: formatEnumDisplay(finance.Status, 'en'),
        pricingType: finance.package?.priceAgree || 'fixed_price',
        pricingTypeLabel: formatEnumDisplay(finance.package?.priceAgree || 'fixed_price', 'en'),
        pricingTypeLabelEn: formatEnumDisplay(finance.package?.priceAgree || 'fixed_price', 'en'),
        paymentOption: finance.paymentOption,
        paymentOptionLabel: formatEnumDisplay(finance.paymentOption, 'en'),
        paymentOptionLabelEn: formatEnumDisplay(finance.paymentOption, 'en'),
        commercialTerms: {
          quoteValidityDays: 30,
          depositPercentage: 25,
          balancePercentage: 75,
          governingTerms: 'Algemene Voorwaarden voor Verhuizingen (AVV)',
          insuranceCoverage: 'Transit cargo insured up to €100,000 under AVV standards',
          cancellationNoticeHours: 48,
          bankDetails: {
            bankName: 'ABN AMRO Bank N.V.',
            iban: 'NL91 ABNA 0417 1643 00',
            bic: 'ABNANL2A',
          },
        },
        items: (calc.items || finance.items || []).map(item => ({
          description: item.description || (item.salesgroup && item.salesgroup.name) || 'Moving Service',
          price: item.price,
          quantity: item.quantity,
          total: item.lineTotal !== undefined ? item.lineTotal : (item.price * item.quantity),
          btw: item.btw || item.tax || '21',
          tax: item.btw || item.tax || '21',
          unit: item.unit
        })),
        customer: finance.customer ? {
          firstName: finance.customer.firstName || '',
          lastName: finance.customer.lastName || '',
          name: `${finance.customer.firstName || ''} ${finance.customer.lastName || ''}`.trim() || finance.customer.companyName || 'Valued Customer',
          companyName: finance.customer.companyName || '',
          email: finance.customer.email || '',
          phone: finance.customer.phone || finance.customer.telephone || finance.customer.contact || finance.customer.mobile || '',
          telephone: finance.customer.telephone || finance.customer.phone || finance.customer.contact || finance.customer.mobile || '',
          mobile: finance.customer.mobile || finance.customer.phone || finance.customer.telephone || '',
          address: formatCustomerAddress(finance.customer.address),
        } : null,
        financialTemplate,
        package: finance.package ? { name: finance.package.name } : null,
      };
      return res.json({ finance: pubFinance });
    }

    res.json({ finance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.financeList = async (req, res) => {
  try {
    let { job, customer } = req.query;
    const filter = {};
    if (job && job !== 'undefined' && job !== 'null' && job.trim() !== '') {
      filter.job = job;
    }
    if (customer && customer !== 'undefined' && customer !== 'null' && customer.trim() !== '') {
      filter.customer = customer;
    }
    const financeList = await Finance.find(filter)
      .sort({ createdAt: -1 })
      .populate('customer', 'firstName lastName')
      .populate('contactPerson', 'username');
    res.json({
      financeData: financeList,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error fetching quotes' });
  }
};

exports.financeCount = async (req, res) => {
  try {
    const totalFinance = await Finance.countDocuments();
    res.json({ totalFinance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.searchedFinance = async (req, res) => {
  // const searchTerm = req.query.searchTerm.toLowerCase();
  // const financeList = await Finance.find()
  // const searchedFinance = financeList.filter((financeData) => {
  //   const customer = financeData.customer.toLowerCase();
  //   return customer.includes(searchTerm);
  // });
  // res.json(searchedFinance);
};

exports.deleteFinance = async (req, res) => {
  try {
    const financeId = req.params.financeId;
    const dataCheck = await Finance.findById(financeId);
    if (dataCheck) {
      const DeleteData = await Finance.findOneAndDelete(
        { _id: dataCheck._id },
        req.body
      );
      res
        .status(200)
        .send({
          status: true,
          msg: "DATA is successfully deleted",
          data: DeleteData,
        });
    } else {
      return res
        .status(404)
        .send({ status: false, msg: "finance is not found", data: null });
    }
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .send({ status: false, msg: "Internal server error", data: null });
  }
};

exports.financeListByCustomerId = async (req, res) => {
  try {
    const customerId = new ObjectId(req.query.customerId)
    const financeListByCustomerId = await Finance.find({ customer: customerId });
    res.json({
      financeListByCustomerId: financeListByCustomerId,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.DownloadInvoicePDF = async (req, res) => {
  const { Id } = req.body;

  try {
    if (!Id) {
      return res.status(400).send("Invoice ID is required");
    }

    const isObjectId = mongoose.Types.ObjectId.isValid(Id);
    const query = isObjectId ? { $or: [{ _id: Id }, { capabilityToken: Id }] } : { capabilityToken: Id };

    const invoice = await Finance.findOne(query)
      .populate("customer")
      .populate("financialTemplate", "htmlContent");

    if (!invoice) {
      return res.status(404).send("Invoice not found");
    }

    const {
      APPROVED_COMPANY_DETAILS,
      formatDutchDate,
      formatCustomerAddress,
      computeStatutoryTaxBreakdown,
    } = require('../utils/statutoryInvoice');

    const companySource = invoice.companySnapshot || await CompanyDetails.findOne() || APPROVED_COMPANY_DETAILS;
    const company = {
      ...APPROVED_COMPANY_DETAILS,
      ...(companySource.toObject ? companySource.toObject() : companySource),
    };
    company.kvkNumber = company.kvkNumber || company.companyRegNumber || APPROVED_COMPANY_DETAILS.kvkNumber;
    company.companyRegNumber = company.kvkNumber;
    company.btwNumber = company.btwNumber || company.companyVatNumber || company.companyTaxNumber || APPROVED_COMPANY_DETAILS.btwNumber;
    company.companyVatNumber = company.btwNumber;
    company.companyTaxNumber = company.btwNumber;
    company.bankName = company.bankName || APPROVED_COMPANY_DETAILS.bankName;
    company.iban = company.iban || APPROVED_COMPANY_DETAILS.iban;
    company.bic = company.bic || APPROVED_COMPANY_DETAILS.bic;

    const rawCustomer = invoice.customerSnapshot || invoice.customer || {};
    const customerObj = rawCustomer.toObject ? rawCustomer.toObject() : { ...rawCustomer };
    const customer = {
      ...customerObj,
      name: customerObj.name || `${customerObj.firstName || ''} ${customerObj.lastName || ''}`.trim() || customerObj.companyName || 'Valued Customer',
      address: formatCustomerAddress(customerObj.address),
      email: customerObj.email || '',
      phone: customerObj.phone || customerObj.telephone || customerObj.mobile || customerObj.contact || '',
      telephone: customerObj.telephone || customerObj.phone || customerObj.mobile || customerObj.contact || '',
      vatNumber: customerObj.vatNumber || customerObj.btwNumber || '',
    };

    const appSettings = await AppSettings.findOne();
    // EXEC-20: Authoritative Recalculation (Eliminate stale memoization/cached totals)
    const calc = calculateCommercialTotals(invoice);
    const freshInvoice = {
      ...(invoice.toObject ? invoice.toObject() : invoice),
      subTotal: calc.subTotal,
      discount: calc.discount,
      discountedPrice: calc.discountedPrice,
      btw: calc.btw,
      total: calc.total,
      net: calc.net,
      totalVat: calc.totalVat,
      items: calc.items,
      date: formatDutchDate(invoice.date || invoice.createdAt || new Date()),
      dueDate: formatDutchDate(invoice.expire_date || invoice.tokenExpiresAt || invoice.dueDate || (invoice.date ? new Date(new Date(invoice.date).getTime() + 30 * 86400000) : new Date(Date.now() + 30 * 86400000))),
      deliveryDate: formatDutchDate(invoice.deliveryDate || invoice.date || invoice.createdAt || new Date()),
    };
    const data = {
      company,
      customer,
      invoice: freshInvoice,
      currency: appSettings?.currency || 'EUR',
      currencySymbol: appSettings?.currencySymbol || '€',
      currencyPosition: appSettings?.currencyPosition || 'before',
      currencyDecimals: appSettings?.currencyDecimals !== undefined ? appSettings.currencyDecimals : 2,
    };

    let html = invoice.financialTemplate?.htmlContent;
    if (!html) {
      const defaultTemplate = await DocumentTemplate.findOne({
        $or: [
          { type: 'quote' },
          { name: /relocation.*estimate/i },
          { name: /quotation/i },
          { name: /quote/i }
        ]
      });
      html = defaultTemplate?.htmlContent || '<html><body><h1>Quote</h1>{{items}}</body></html>';
    }
    const pdfBuffer = await generatePdf(html, data);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="quote.pdf"',
      "Content-Length": pdfBuffer.length,
    });

    return res.status(200).send(pdfBuffer);

  } catch (error) {
    console.error("Error generating PDF:", error);

    return res.status(500).send("Error generating PDF");
  }
};


const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");
async function generatePdf(htmlContent, data) {
  const sym = data.currencySymbol || '€';
  const pos = data.currencyPosition || 'before';
  const dec = data.currencyDecimals !== undefined ? data.currencyDecimals : 2;
  const fmt = (num) => {
    const val = Number(num || 0).toFixed(dec);
    return pos === 'after' ? `${val} ${sym}` : `${sym} ${val}`;
  };

  const rows = (data.invoice?.items || []).map((item, idx) => {
    const rawQty = item.quantity;
    const qty = (rawQty !== undefined && rawQty !== null && rawQty !== '') ? Number(rawQty) : 0;
    const rawPrice = item.price;
    const price = (rawPrice !== undefined && rawPrice !== null && rawPrice !== '') ? Number(rawPrice) : 0;
    const lineTotal = roundToCents(qty * price);
    const btwRate = resolveTaxRate ? resolveTaxRate(item.btw) : (Number(item.btw) || 0);
    const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    const desc = item.description || (item.salesgroup && item.salesgroup.name) || 'Moving Service';
    return `
    <tr style="border-bottom: 1px solid #e2e8f0; background-color: ${bg};">
      <td style="padding: 10px 12px; color: #1e293b; font-weight: 500; font-size: 13px;">${desc}</td>
      <td style="padding: 10px 10px; text-align: center; color: #475569; font-size: 13px;">${qty}</td>
      <td style="padding: 10px 12px; text-align: right; color: #475569; font-size: 13px;">${fmt(price)}</td>
      <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: #0f172a; font-size: 13px;">${fmt(lineTotal)}</td>
      <td style="padding: 10px 12px; text-align: right; color: #64748b; font-size: 13px;">${btwRate}%</td>
    </tr>
  `;
  }).join('');

  const fullTableHtml = `
    <table style="width: 100%; border-collapse: collapse; margin: 18px 0; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
      <thead>
        <tr style="background-color: #f1f5f9; border-bottom: 2px solid #3c50e0; color: #0f172a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
          <th style="padding: 10px 12px; text-align: left; font-weight: 700; width: 45%;">Description</th>
          <th style="padding: 10px 10px; text-align: center; font-weight: 700; width: 12%;">Qty</th>
          <th style="padding: 10px 12px; text-align: right; font-weight: 700; width: 15%;">Unit Price</th>
          <th style="padding: 10px 12px; text-align: right; font-weight: 700; width: 15%;">Total</th>
          <th style="padding: 10px 12px; text-align: right; font-weight: 700; width: 13%;">BTW (%)</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="5" style="padding: 14px; text-align: center; color: #64748b; font-style: italic;">No items specified</td></tr>'}
      </tbody>
    </table>
  `;

  const isInsideTable = (htmlContent || '').includes('<tbody') && (
    htmlContent.includes('<tbody>{{items}}') ||
    htmlContent.includes('<tbody>\n{{items}}') ||
    htmlContent.includes('<tbody>\r\n{{items}}')
  );
  const itemsHtml = isInsideTable ? rows : fullTableHtml;

  const {
    generateBtwSpecificationHtml,
    generatePaymentInstructionsHtml,
    generateTotalsBreakdownHtml,
  } = require('../utils/statutoryInvoice');

  const taxBreakdownHtml = generateBtwSpecificationHtml(data.invoice?.taxBreakdown?.rates || data.invoice?.taxBreakdown, sym, fmt);
  const paymentInstructionsHtml = generatePaymentInstructionsHtml(data.company, sym);
  const totalsBreakdownHtml = generateTotalsBreakdownHtml(data.invoice, sym, fmt);

  let populatedHtml = (htmlContent || '')
    .replace(/\$\{[^}]*\}/g, '')
    .replace(
      /{{\s*(\w+(\.\w+)*)\s*}}/g,
      (match, key) => {
      if (key === "items") {
        return itemsHtml;
      }
      if (key === 'taxBreakdown' || key === 'btwSpecification') {
        return taxBreakdownHtml;
      }
      if (key === 'paymentInstructions') {
        return paymentInstructionsHtml;
      }
      if (key === 'totalsBreakdown' || key === 'totalsCard') {
        return totalsBreakdownHtml;
      }

      return (
        key
          .split(".")
          .reduce((obj, prop) => obj && obj[prop], data) || ""
      );
    }
  );

  // Upgrade single-line totals-card to full commercial breakdown card
  if (populatedHtml.includes('<div class="totals-card">') || populatedHtml.includes('<div class="totals-card"')) {
    populatedHtml = populatedHtml.replace(/<div class="totals-card"[^>]*>[\s\S]*?<\/div>\s*<\/div>/i, totalsBreakdownHtml.trim());
  }

  // EXEC-27: Eradicate raw implementation enums in PDFs
  const { ENUM_TRANSLATIONS } = require('../utils/dutchLocaleUtil');
  for (const [rawKey, trans] of Object.entries(ENUM_TRANSLATIONS)) {
    const regex = new RegExp(`\\b${rawKey}\\b`, 'g');
    populatedHtml = populatedHtml.replace(regex, trans.en);
  }

  let browser;

  try {
    const isLocal = process.env.NODE_ENV === "development" || process.platform === "win32";

    const resolveChromePath = () => {
      const fs = require('fs');
      const candidatePaths = [
        process.env.CHROME_BIN,
        process.env.CHROME_PATH,
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : null,
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser'
      ].filter(Boolean);

      for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
          return p;
        }
      }
      return 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
    };

    let launchOptions;

    if (isLocal) {
      // Windows local Chrome
      launchOptions = {
        executablePath: resolveChromePath(),
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      };
    } else {
      // AWS Lambda / serverless
      launchOptions = {
        args: chromium.args,
        executablePath: await chromium.executablePath(),
        headless: "shell",
      };
    }

    browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();

    const sanitizedHtml = (populatedHtml || '')
      .replace(/([€$£]\s*)+([€$£])/g, '$2')
      .replace(/(EUR|USD|GBP)\s*([€$£])/gi, '$2')
      .replace(/([€$£])\s*(EUR|USD|GBP)/gi, '$1')
      .replace(/€\s*€/g, '€');

    await page.setContent(sanitizedHtml, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    const pdfData = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "15mm",
        right: "7mm",
        bottom: "15mm",
        left: "7mm",
      },
    });

    return Buffer.from(pdfData);
  } finally {
    if (browser) {
      await browser.close();
    }
  }

}
exports.createInvoicePDF = async (req, res) => {
  const { Id, emailTemplateId, content, eventType: reqEventType } = req.body;
  if (!ObjectId.isValid(Id)) {
    return res.status(400).send('Invalid Invoice ID');
  }
  const idempotencyKey = req.headers['x-idempotency-key'] || req.body.idempotencyKey;
  try {
    const invoice = await Finance.findById(Id)
      .populate('customer')
      .populate('financialTemplate', 'htmlContent');
    if (!invoice) {
      return res.status(404).send('Invoice not found');
    }
    let company = await CompanyDetails.findOne();
    if (!company) {
      company = {
        companyName: 'Universal Movers B.V.',
        companyEmail: process.env.SMTP_USER || 'info@universalmovers.nl',
      };
    }

    const appSettings = await AppSettings.findOne();

    // Determine canonical event
    let eventType = reqEventType;
    if (!eventType) {
      if (invoice.Status === 'Accepted' || invoice.acceptance?.isAccepted) {
        eventType = EMAIL_EVENTS.QUOTE_ACCEPTED;
      } else {
        eventType = EMAIL_EVENTS.QUOTE_SENT;
      }
    }

    // Prepare PDF attachment if required
    let attachments = [];
    if (!content) {
      const data = {
        company: company,
        customer: invoice.customer || {},
        invoice: invoice,
        code: `/${invoice._id}`,
        currency: appSettings?.currency || 'EUR',
        currencySymbol: appSettings?.currencySymbol || '€',
        currencyPosition: appSettings?.currencyPosition || 'before',
        currencyDecimals: appSettings?.currencyDecimals !== undefined ? appSettings.currencyDecimals : 2,
      };

      let html = invoice.financialTemplate?.htmlContent;
      if (!html) {
        const defaultTemplate = await DocumentTemplate.findOne({
          $or: [
            { type: 'offer' },
            { type: 'quote' },
            { name: /standard quotation/i },
            { name: /quotation/i },
            { name: /quote/i }
          ]
        });
        html = defaultTemplate?.htmlContent || '<html><body><h1>Quotation</h1></body></html>';
      }

      try {
        const pdfBuffer = await generatePdf(html, data);
        if (pdfBuffer) {
          attachments.push({
            filename: `Quotation_${invoice.index || invoice._id}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          });
        }
      } catch (pdfErr) {
        console.error("PDF generation skipped in createInvoicePDF:", pdfErr.message);
      }
    }

    const recipient = invoice.customer?.email;
    const quoteCode = invoice.capabilityToken ? `/${invoice.capabilityToken}` : `/${invoice._id}`;

    const dispatchResult = await dispatchOutboxEmail({
      eventType,
      recipient,
      emailTemplateId,
      context: {
        company,
        customer: invoice.customer || {},
        invoice,
        code: quoteCode,
        capabilityToken: invoice.capabilityToken,
        currency: appSettings?.currency || 'EUR',
        currencySymbol: appSettings?.currencySymbol || '€',
      },
      attachments,
      idempotencyKey,
    });

    if (!dispatchResult.success && dispatchResult.blocked) {
      return res.status(dispatchResult.statusCode || 422).json({
        error: dispatchResult.errorCode,
        message: dispatchResult.message,
        missing: dispatchResult.missing,
      });
    }

    return res.status(200).send(dispatchResult.emailId);
  } catch (error) {
    console.error("Error generating or sending PDF:", error);
    return res.status(500).send("Error generating or sending PDF");
  }
};

/**
 * EXEC-28: Controlled Quotation Revision Workflow
 * Clones target quotation into a new version (v2, v3...), marks predecessor as superseded,
 * resets acceptance state, generates fresh capability token & 30-day validity, and logs activity.
 */
exports.reviseQuotation = async (req, res) => {
  const { id } = req.params;
  try {
    const isObjectId = mongoose.Types.ObjectId.isValid(id);
    const query = isObjectId ? { $or: [{ _id: id }, { capabilityToken: id }] } : { capabilityToken: id };

    const targetQuote = await Finance.findOne(query);
    if (!targetQuote) {
      return res.status(404).json({
        error: 'QUOTE_NOT_FOUND',
        message: 'Quotation not found.',
      });
    }

    // If already superseded, reject revision on superseded predecessor
    if (targetQuote.isSuperseded) {
      return res.status(409).json({
        error: 'QUOTE_ALREADY_SUPERSEDED',
        message: 'This quotation has already been superseded by a newer revision.',
        supersededBy: targetQuote.supersededBy,
      });
    }

    const currentVersion = targetQuote.version || 1;
    const newVersion = currentVersion + 1;

    // Calculate revision index: e.g. "TEST-QUO-2026/0099" -> "TEST-QUO-2026/0099-v2"
    const rawIndex = targetQuote.index || '';
    const baseIndex = rawIndex.replace(/-v\d+$/i, '');
    const newIndex = baseIndex ? `${baseIndex}-v${newVersion}` : undefined;

    const crypto = require('crypto');
    const freshCapabilityToken = crypto.randomBytes(32).toString('hex');
    const freshTokenExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Deep clone line items
    const clonedItems = (targetQuote.items || []).map((item) => ({
      salesgroup: item.salesgroup?._id || item.salesgroup,
      componentId: item.componentId,
      isManual: item.isManual,
      manualOverride: item.manualOverride,
      manualReason: item.manualReason,
      description: item.description,
      quantity: item.quantity,
      price: item.price,
      btw: item.btw,
    }));

    // Clone jobinput if present
    const clonedJobinput = targetQuote.jobinput ? JSON.parse(JSON.stringify(targetQuote.jobinput)) : {};

    const revisionDoc = new Finance({
      index: newIndex,
      customer: targetQuote.customer,
      contactPerson: targetQuote.contactPerson,
      package: targetQuote.package,
      financialTemplate: targetQuote.financialTemplate,
      job: targetQuote.job,
      btw: targetQuote.btw,
      reference: targetQuote.reference,
      discount: targetQuote.discount || 0,
      discountedPrice: targetQuote.discountedPrice || 0,
      discount_description: targetQuote.discount_description,
      year: new Date().getFullYear(),
      Status: 'Draft',
      note: targetQuote.note,
      ignoreRules: targetQuote.ignoreRules,
      jobinput: clonedJobinput,
      items: clonedItems,
      paid: 0,
      payment: 'Unpaid',
      vat: targetQuote.vat,
      subTotal: targetQuote.subTotal,
      total: targetQuote.total,
      date: new Date(),
      expire_date: freshTokenExpiry,
      version: newVersion,
      isSuperseded: false,
      supersededBy: null,
      parentQuote: targetQuote._id,
      rootQuote: targetQuote.rootQuote || targetQuote._id,
      capabilityToken: freshCapabilityToken,
      tokenExpiresAt: freshTokenExpiry,
      acceptance: {
        isAccepted: false,
        acceptedAt: null,
        acceptedVersion: newVersion,
        method: 'PUBLIC_LINK',
      },
    });

    const savedRevision = await revisionDoc.save();

    // Mark predecessor as superseded
    targetQuote.isSuperseded = true;
    targetQuote.supersededBy = savedRevision._id;
    if ((targetQuote.Status || '').toLowerCase() !== 'accepted') {
      targetQuote.Status = 'Superseded';
    }
    await targetQuote.save();

    // Log activity
    const staffName = req.user?.username || req.user?.name || 'Staff';
    try {
      const Activity = require('../models/activityModel');
      await Activity.create({
        type: 'offer',
        title: `Quotation #${targetQuote.index} revised to v${newVersion} (#${savedRevision.index})`,
        offer: savedRevision._id,
        reference: staffName,
        actor: 'Staff',
        actorName: staffName,
        status: 'success',
        description: `Revision created from predecessor quotation #${targetQuote.index} (v${currentVersion}) by ${staffName}`,
      });
    } catch (actErr) {
      console.error('Error logging revision activity:', actErr);
    }

    return res.status(201).json({
      success: true,
      message: `Quotation #${targetQuote.index} successfully revised to v${newVersion}`,
      newQuote: savedRevision,
      predecessorId: targetQuote._id,
    });
  } catch (error) {
    console.error('Error in reviseQuotation:', error);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to create quotation revision',
      details: error.message,
    });
  }
};

/**
 * EXEC-28: Rejection / Decline transition
 * Records customer or staff rejection with reason and timestamp.
 */
exports.rejectQuotation = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body || {};

  try {
    const isObjectId = mongoose.Types.ObjectId.isValid(id);
    const query = isObjectId ? { $or: [{ _id: id }, { capabilityToken: id }] } : { capabilityToken: id };

    const quote = await Finance.findOne(query);
    if (!quote) {
      return res.status(404).json({
        error: 'QUOTE_NOT_FOUND',
        message: 'Quotation not found.',
      });
    }

    if (quote.acceptance?.isAccepted || (quote.Status && quote.Status.toLowerCase() === 'accepted')) {
      return res.status(422).json({
        error: 'CANNOT_REJECT_ACCEPTED_QUOTE',
        message: 'An accepted quotation agreement cannot be rejected.',
      });
    }

    if (quote.isSuperseded) {
      return res.status(409).json({
        error: 'QUOTE_SUPERSEDED',
        message: 'Cannot reject a superseded quotation.',
      });
    }

    quote.Status = 'Rejected';
    quote.rejectedAt = new Date();
    quote.rejectionReason = reason || 'Quotation declined';
    quote.rejectedBy = req.user ? 'STAFF' : 'CUSTOMER';
    await quote.save();

    const actor = req.user ? 'Staff' : 'Customer';
    const actorName = req.user?.username || req.user?.name || quote.customer?.firstName || 'Customer';
    try {
      const Activity = require('../models/activityModel');
      await Activity.create({
        type: 'offer',
        title: `Quotation #${quote.index} declined by ${actorName}`,
        offer: quote._id,
        reference: actorName,
        actor: actor,
        actorName: actorName,
        status: 'warning',
        description: `Quotation rejected. Reason: ${quote.rejectionReason}`,
      });
    } catch (actErr) {
      console.error('Error logging rejection activity:', actErr);
    }

    return res.status(200).json({
      success: true,
      message: `Quotation #${quote.index} marked as rejected.`,
      quote,
    });
  } catch (error) {
    console.error('Error in rejectQuotation:', error);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to record rejection',
      details: error.message,
    });
  }
};

/**
 * EXEC-28: Revoke quotation (Staff only)
 */
exports.revokeQuotation = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body || {};

  try {
    const isObjectId = mongoose.Types.ObjectId.isValid(id);
    const query = isObjectId ? { $or: [{ _id: id }, { capabilityToken: id }] } : { capabilityToken: id };

    const quote = await Finance.findOne(query);
    if (!quote) {
      return res.status(404).json({
        error: 'QUOTE_NOT_FOUND',
        message: 'Quotation not found.',
      });
    }

    if (quote.acceptance?.isAccepted || (quote.Status && quote.Status.toLowerCase() === 'accepted')) {
      return res.status(422).json({
        error: 'CANNOT_REVOKE_ACCEPTED_QUOTE',
        message: 'An accepted quotation agreement cannot be revoked directly.',
      });
    }

    if (quote.isSuperseded) {
      return res.status(409).json({
        error: 'QUOTE_SUPERSEDED',
        message: 'Cannot revoke a superseded quotation.',
      });
    }

    quote.Status = 'Revoked';
    quote.revokedAt = new Date();
    quote.revokedReason = reason || 'Revoked by staff';
    await quote.save();

    const staffName = req.user?.username || req.user?.name || 'Staff';
    try {
      const Activity = require('../models/activityModel');
      await Activity.create({
        type: 'offer',
        title: `Quotation #${quote.index} revoked by ${staffName}`,
        offer: quote._id,
        reference: staffName,
        actor: 'Staff',
        actorName: staffName,
        status: 'warning',
        description: `Quotation revoked. Reason: ${quote.revokedReason}`,
      });
    } catch (actErr) {}

    return res.status(200).json({
      success: true,
      message: `Quotation #${quote.index} has been revoked.`,
      quote,
    });
  } catch (error) {
    console.error('Error in revokeQuotation:', error);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to revoke quotation',
      details: error.message,
    });
  }
};

