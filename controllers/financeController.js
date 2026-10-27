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
    });

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
        paymentOption: finance.paymentOption,
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
  const { Id, emailTemplateId, content } = req.body;
  if (!ObjectId.isValid(Id)) {
    return res.status(400).send('Invalid Invoice ID');
  }
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
        companyName: 'Universal Movers',
        email: process.env.SMTP_USER || 'info@universalmovers.nl',
      };
    }

    const appSettings = await AppSettings.findOne();

    let emailTemplate = null;
    if (emailTemplateId && ObjectId.isValid(emailTemplateId)) {
      emailTemplate = await EmailTemplate.findById(emailTemplateId);
    }
    if (!emailTemplate && appSettings?.emailTemplates?.thankyou && ObjectId.isValid(appSettings.emailTemplates.thankyou)) {
      emailTemplate = await EmailTemplate.findById(appSettings.emailTemplates.thankyou);
    }
    if (!emailTemplate && appSettings?.emailTemplates?.quote && ObjectId.isValid(appSettings.emailTemplates.quote)) {
      emailTemplate = await EmailTemplate.findById(appSettings.emailTemplates.quote);
    }
    if (!emailTemplate) {
      emailTemplate = await EmailTemplate.findOne({
        $or: [
          { name: { $regex: /thank|quote|accept|offer/i } },
          { documentType: { $regex: /thank|quote|accept|offer/i } },
        ]
      }) || await EmailTemplate.findOne();
    }

    let emailHtml = emailTemplate?.htmlContent || `
      <p>Dear {{customer.firstName}},</p>
      <p>Thank you for accepting Quotation # {{invoice.index}} from {{company.companyName}}.</p>
      <p>We have successfully received your confirmation and will be in touch shortly.</p>
      <p>Best regards,<br>{{company.companyName}}</p>
    `;

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
    let pdfBuffer = null;
    if (!content && html) {
      try {
        pdfBuffer = await generatePdf(html, data);
      } catch (pdfErr) {
        console.error("PDF generation skipped in createInvoicePDF:", pdfErr.message);
      }
    }

    const quoteCode = invoice.capabilityToken ? `/${invoice.capabilityToken}` : `/${invoice._id}`;
    emailHtml = renderEmailTemplate(emailHtml || '', {
      company,
      customer: invoice.customer || {},
      invoice,
      code: quoteCode,
      capabilityToken: invoice.capabilityToken,
      currency: appSettings?.currency || 'EUR',
      currencySymbol: appSettings?.currencySymbol || '€',
    });

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const mailOptions = {
      from: process.env.SMTP_USER,
      to: invoice.customer?.email,
      subject: `Quotation # ${invoice.index} from ${company.companyName}`,
      html: emailHtml,
      attachments: (!content && pdfBuffer) ? [{
        filename: `Quotation_${invoice.index || invoice._id}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }] : undefined,
    };

    const newEmail = new Email({
      from: process.env.SMTP_USER,
      recipient: invoice.customer?.email,
      subject: mailOptions.subject,
      htmlContent: mailOptions.html,
      offer: invoice._id,
      customer: invoice.customer?._id
    });
    const savedEmail = await newEmail.save();

    if (invoice.customer?.email) {
      try {
        await transporter.sendMail(mailOptions);
      } catch (smtpErr) {
        console.error("SMTP delivery warning:", smtpErr.message);
      }
    }

    return res.status(200).send(savedEmail._id);
  } catch (error) {
    console.error("Error generating or sending PDF:", error);
    return res.status(500).send("Error generating or sending PDF");
  }
};

