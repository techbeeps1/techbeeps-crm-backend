const Invoice = require("../models/invoice");
const mongoose = require("mongoose");
const Customer = require("../models/customer");
const Address = require("../models/addressModel");
const User = require("../models/user");
const Package = require("../models/PackageModel");
const DocumentTemplate = require("../models/documentTemplateModel");
const JobSchedule = require("../models/jobSchedule");
const CompanyDetails = require("../models/companyModel");
const { ObjectId } = require("mongodb");
const EmailTemplate = require('../models/reporting');
const nodemailer = require('nodemailer');
// const puppeteer = require('puppeteer');
// const chromium = require('chrome-aws-lambda');
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const Email = require('../models/Email/email');
const AppSettings = require('../models/appSettingModel');
const SalesGroup = require('../models/salesgroupModel');
const { renderEmailTemplate } = require('../utils/emailTemplateUtil');
const { calculateCommercialTotals, roundToCents } = require('../utils/moneyCalculator');
const { resolveTaxRate } = require('../utils/taxCatalog');
const { dispatchOutboxEmail, EMAIL_EVENTS } = require('../utils/emailOutboxService');

const sanitizeInvoicePayload = async (data) => {
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

  // EXEC-23: Statutory Snapshot Immutability (Freeze approved data at issuance)
  const {
    APPROVED_COMPANY_DETAILS,
    formatDutchDate,
    formatCustomerAddress,
    computeStatutoryTaxBreakdown
  } = require('../utils/statutoryInvoice');

  if (!payload.companySnapshot) {
    try {
      const dbComp = await CompanyDetails.findOne();
      payload.companySnapshot = {
        ...APPROVED_COMPANY_DETAILS,
        ...(dbComp ? (dbComp.toObject ? dbComp.toObject() : dbComp) : {}),
      };
      payload.companySnapshot.kvkNumber = payload.companySnapshot.kvkNumber || payload.companySnapshot.companyRegNumber || APPROVED_COMPANY_DETAILS.kvkNumber;
      payload.companySnapshot.btwNumber = payload.companySnapshot.btwNumber || payload.companySnapshot.companyVatNumber || payload.companySnapshot.companyTaxNumber || APPROVED_COMPANY_DETAILS.btwNumber;
      payload.companySnapshot.bankName = payload.companySnapshot.bankName || APPROVED_COMPANY_DETAILS.bankName;
      payload.companySnapshot.iban = payload.companySnapshot.iban || APPROVED_COMPANY_DETAILS.iban;
      payload.companySnapshot.bic = payload.companySnapshot.bic || APPROVED_COMPANY_DETAILS.bic;
    } catch (cErr) {
      payload.companySnapshot = { ...APPROVED_COMPANY_DETAILS };
    }
  }

  if (!payload.customerSnapshot && payload.customer) {
    try {
      const custDoc = await Customer.findById(payload.customer).populate('address');
      if (custDoc) {
        payload.customerSnapshot = {
          _id: custDoc._id,
          name: `${custDoc.firstName || ''} ${custDoc.lastName || ''}`.trim() || custDoc.companyName || 'Valued Customer',
          firstName: custDoc.firstName || '',
          lastName: custDoc.lastName || '',
          companyName: custDoc.companyName || '',
          email: custDoc.email || '',
          phone: custDoc.phone || custDoc.mobile || '',
          address: formatCustomerAddress(custDoc.address?.[0] || custDoc.address || custDoc.billingAddress || ''),
          vatNumber: custDoc.vatNumber || custDoc.btwNumber || custDoc.taxNumber || '',
        };
      }
    } catch (cErr) {
      console.warn('Customer snapshot populate warning:', cErr.message);
    }
  }

  if (!payload.statutorySnapshot && payload.items) {
    const taxBreakdown = computeStatutoryTaxBreakdown(payload.items, payload.subTotal, payload.discountedPrice);
    payload.statutorySnapshot = {
      issueDateFormatted: formatDutchDate(payload.date || new Date()),
      dueDateFormatted: formatDutchDate(payload.dueDate || new Date(Date.now() + 14 * 86400000)),
      deliveryDateFormatted: formatDutchDate(payload.deliveryDate || payload.date || new Date()),
      currency: 'EUR',
      currencySymbol: '€',
      taxBreakdown,
      subTotal: payload.subTotal,
      discount: payload.discount,
      discountedPrice: payload.discountedPrice,
      btw: payload.btw,
      total: payload.total,
      isImmutableFrozen: true,
    };
  }

  if (!payload.financialTemplate) {
    try {
      const defTpl = await DocumentTemplate.findOne({
        $or: [
          { type: 'invoice' },
          { name: /standard moving invoice/i },
          { name: /invoice/i }
        ]
      });
      if (defTpl) {
        payload.financialTemplate = defTpl._id;
      }
    } catch (tErr) {
      console.warn('Template auto-assign warning:', tErr);
    }
  }

  return payload;
};

exports.invoice = async (req, res) => {
  try {
    const sanitizedBody = await sanitizeInvoicePayload(req.body);

    // 1. EXEC-21 Idempotency Key Guard
    const idempotencyKey = req.headers['x-idempotency-key'] || req.body.idempotencyKey;
    if (idempotencyKey) {
      const existingByKey = await Invoice.findOne({ idempotencyKey });
      if (existingByKey) {
        console.log(`[Idempotency] Returning existing invoice ${existingByKey.index} for key ${idempotencyKey}`);
        return res.status(200).json(existingByKey);
      }
      sanitizedBody.idempotencyKey = idempotencyKey;
    }

    // 2. EXEC-21 Double-Billing Window Guard (5-second debounce)
    if (sanitizedBody.customer && !req.headers['x-allow-duplicate']) {
      const fiveSecondsAgo = new Date(Date.now() - 5000);
      const recentQuery = {
        customer: sanitizedBody.customer,
        total: sanitizedBody.total,
        createdAt: { $gte: fiveSecondsAgo }
      };
      if (sanitizedBody.job) {
        recentQuery.job = sanitizedBody.job;
      }
      const duplicateInvoice = await Invoice.findOne(recentQuery);
      if (duplicateInvoice) {
        console.log(`[DoubleBillingBlock] Blocked duplicate creation within 5s window. Returning invoice ${duplicateInvoice.index}`);
        return res.status(200).json(duplicateInvoice);
      }
    }

    const newInvoice = new Invoice(sanitizedBody);
    const savedInvoice = await newInvoice.save();

    if (req.body.job) {
      try {
        const JobSchedule = require('../models/jobSchedule');
        await JobSchedule.findByIdAndUpdate(req.body.job, {
          $addToSet: { invoice: savedInvoice._id }
        });
      } catch (jobErr) {
        console.warn('Failed to auto-link invoice to job schedule:', jobErr);
      }
    }

    res.status(201).json(savedInvoice);
  } catch (error) {
    // If MongoDB duplicate key error (E11000) on index, retry once or return graceful conflict
    if (error.code === 11000 && error.keyPattern && error.keyPattern.index) {
      console.warn('[SequenceCollision] Retrying atomic index allocation after E11000');
      try {
        const sanitizedBody = await sanitizeInvoicePayload(req.body);
        sanitizedBody.index = undefined;
        const retryInvoice = new Invoice(sanitizedBody);
        const savedRetry = await retryInvoice.save();
        return res.status(201).json(savedRetry);
      } catch (retryErr) {
        return res.status(409).json({
          message: 'Concurrent invoice sequence collision. Please retry.',
          error: retryErr.message
        });
      }
    }

    res.status(500).json({
      message: 'Failed to save the invoice',
      error: error.message
    });
  }
};

exports.updateInvoice = async (req, res) => {
  const { id } = req.params; // Get the invoice ID from request parameters
  try {
    const sanitizedData = await sanitizeInvoicePayload(req.body);
    const updatedInvoice = await Invoice.findByIdAndUpdate(id, sanitizedData, {
      new: true, // Return the updated document
    });
    if (!updatedInvoice) {
      return res.status(404).json({
        message: 'Invoice not found'
      });
    }
    res.status(200).json(updatedInvoice);
  } catch (error) {
    res.status(500).json({
      message: 'Failed to update the invoice',
      error: error.message
    });
  }
};

exports.invoiceList = async (req, res) => {
  const { type, customer } = req.query;  // Destructure type and customer from query
  const filter = {};
  if (type) {
    filter.Type = type;
  }
  if (customer) {
    filter.customer = customer;
  }
  try {
    const invoiceList = await Invoice.find(filter).populate('customer','firstName lastName').populate('contactPerson', 'username').sort({ createdAt: -1 });
    const { roundToCents } = require('../utils/financialLedger');
    const enrichedList = invoiceList.map(inv => {
      const invObj = inv.toObject ? inv.toObject() : { ...inv };
      const paid = roundToCents(Number(invObj.paid) || 0);
      const credited = roundToCents(Number(invObj.credited) || 0);
      const total = roundToCents(Number(invObj.total) || 0);
      invObj.balanceDue = (invObj.balanceDue !== undefined && !isNaN(invObj.balanceDue))
        ? roundToCents(invObj.balanceDue)
        : Math.max(0, roundToCents(total - paid - credited));
      return invObj;
    });
    res.json({
      invoiceData: enrichedList,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.invoiceDetail = async (req, res) => {
  const { Id } = req.params;
  try {
    const isObjectId = mongoose.Types.ObjectId.isValid(Id);
    const query = isObjectId ? { $or: [{ _id: Id }, { capabilityToken: Id }] } : { capabilityToken: Id };
    const invoice = await Invoice.findOne(query).populate({
      path: 'customer',
      populate: {
        path: 'address',
        match: { addressType: 'head' },
      },
    }).populate('contactPerson', 'username').populate('package', 'name').populate('financialTemplate', 'name').populate('items.salesgroup', 'name').populate('job');
        if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    // EXEC-20: Authoritative Recalculation (Eliminate stale memoization/cached totals)
    const calc = calculateCommercialTotals(invoice);
    const invoiceObj = invoice.toObject ? invoice.toObject() : { ...invoice };
    invoiceObj.subTotal = calc.subTotal;
    invoiceObj.discount = calc.discount;
    invoiceObj.discountedPrice = calc.discountedPrice;
    invoiceObj.btw = calc.btw;
    invoiceObj.total = calc.total;
    invoiceObj.net = calc.net;
    invoiceObj.totalVat = calc.totalVat;

    // EXEC-22: Authoritative Financial Ledger Balance Projection
    const { calculateInvoiceBalance } = require('../utils/financialLedger');
    const balanceInfo = await calculateInvoiceBalance(invoiceObj);
    invoiceObj.paid = balanceInfo.totalPaid;
    invoiceObj.credited = balanceInfo.totalCredited;
    invoiceObj.balanceDue = balanceInfo.balanceDue;
    invoiceObj.payment = balanceInfo.paymentStatus;

    res.json({ invoice: invoiceObj });
  } catch (err) {
    console.error('invoiceDetail error:', err);
    res.status(500).json({ message: "Server error", error: err.message, stack: err.stack });
  }
};

exports.invoiceCount = async (req, res) => {
  try {
    const totalInvoice = await Invoice.countDocuments();
    res.json({ totalInvoice });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.searchedInvoice = async (req, res) => {
  if (req.query && req.query.searchTerm) {
    const searchTerm = req.query.searchTerm.toLowerCase();
    const invoiceList = await Invoice.find();

    const searchedInvoice = invoiceList.filter((invoiceData) => {
      const customer = invoiceData.customer.toLowerCase();
      return customer.includes(searchTerm);
    });
    res.json(searchedInvoice);
  } else {
    const invoiceList = await Invoice.find();
    res.json(invoiceList);
  }
};

exports.deleteInvoice = async (req, res) => {
  try {
    const invoiceId = req.params.invoiceId;
    const dataCheck = await Invoice.findById(invoiceId);
    if (dataCheck) {
      const DeleteData = await Invoice.findOneAndDelete(
        { _id: dataCheck._id },
        req.body
      );
      res.status(200).send({
        status: true,
        msg: "DATA is successfully deleted",
        data: DeleteData,
      });
    } else {
      return res
        .status(404)
        .send({ status: false, msg: "Invoice is not found", data: null });
    }
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .send({ status: false, msg: "Internal server error", data: null });
  }
};

exports.invoiceListByCustomerId = async (req, res) => {
  try {
    const customerId = new ObjectId(req.query.customerId)
    const invoiceListByCustomerId = await Invoice.find({ customer: customerId });
    res.json({
      invoiceListByCustomerId: invoiceListByCustomerId,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};


exports.DownloadInvoicePDF = async (req, res) => {
  const { Id } = req.body;
  try {
    const isObjectId = mongoose.Types.ObjectId.isValid(Id);
    const query = isObjectId ? { $or: [{ _id: Id }, { capabilityToken: Id }] } : { capabilityToken: Id };
    const invoice = await Invoice.findOne(query)
      .populate('customer')
      .populate('financialTemplate', 'htmlContent');
    if (!invoice) {
      return res.status(404).send('Invoice not found');
    }

    const {
      APPROVED_COMPANY_DETAILS,
      formatDutchDate,
      formatCustomerAddress,
      computeStatutoryTaxBreakdown,
    } = require('../utils/statutoryInvoice');

    // IMMUTABLE SNAPSHOT PRESERVATION:
    // If invoice has companySnapshot, strictly use it so subsequent company settings changes never alter already issued document!
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
      phone: customerObj.phone || customerObj.mobile || '',
      vatNumber: customerObj.vatNumber || customerObj.btwNumber || '',
    };

    const appSettings = await AppSettings.findOne();

    // EXEC-20 & EXEC-23: Authoritative Commercial Recalculation & Statutory Breakdown
    const calc = calculateCommercialTotals(invoice);
    const taxBreakdown = computeStatutoryTaxBreakdown(calc.items, calc.subTotal, calc.discountedPrice);

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
      dueDate: formatDutchDate(invoice.dueDate || (invoice.date ? new Date(new Date(invoice.date).getTime() + 14 * 86400000) : new Date(Date.now() + 14 * 86400000))),
      deliveryDate: formatDutchDate(invoice.deliveryDate || invoice.date || invoice.createdAt || new Date()),
      taxBreakdown,
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
          { type: 'invoice' },
          { name: /standard moving invoice/i },
          { name: /invoice/i }
        ]
      });
      html = defaultTemplate?.htmlContent || '<html><body><h1>Invoice</h1>{{items}}</body></html>';
    }

    const pdfBuffer = await generatePdf(html, data);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="invoice.pdf"',
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Error generating PDF:", error);
    res.status(500).send("Error generating PDF");
  }
};

const fs = require('fs');

const resolveChromePath = () => {
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

async function generatePdf(htmlContent, data) {
  const sym = data.currencySymbol || '€';
  const pos = data.currencyPosition || 'before';
  const dec = data.currencyDecimals !== undefined ? data.currencyDecimals : 2;
  const fmt = (num) => {
    const val = Number(num || 0).toFixed(dec);
    return pos === 'after' ? `${val} ${sym}` : `${sym} ${val}`;
  };

  const { generateBtwSpecificationHtml, generatePaymentInstructionsHtml, generateTotalsBreakdownHtml } = require('../utils/statutoryInvoice');

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

  const taxBreakdownHtml = generateBtwSpecificationHtml(data.invoice?.taxBreakdown, sym, fmt);
  const paymentInstructionsHtml = generatePaymentInstructionsHtml(data.company, sym);
  const totalsBreakdownHtml = generateTotalsBreakdownHtml(data.invoice, sym, fmt);

  let populatedHtml = (htmlContent || '')
    .replace(/\$\{[^}]*\}/g, '')
    .replace(/{{\s*(\w+(\.\w+)*)\s*}}/g, (match, key) => {
      if (key === 'items') {
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
      const val = key.split('.').reduce((obj, prop) => obj && obj[prop], data);
      return (val !== undefined && val !== null) ? val : '';
    });

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

  // If template does not explicitly contain {{taxBreakdown}} or {{paymentInstructions}},
  // append them cleanly before </body> to ensure 100% statutory Belastingdienst compliance
  if (!htmlContent.includes('taxBreakdown') && !htmlContent.includes('btwSpecification')) {
    const statutorySection = `
      <div style="page-break-inside: avoid; margin-top: 20px; font-family: sans-serif;">
        ${taxBreakdownHtml}
        ${paymentInstructionsHtml}
      </div>
    `;
    if (populatedHtml.includes('</body>')) {
      populatedHtml = populatedHtml.replace('</body>', `${statutorySection}</body>`);
    } else {
      populatedHtml += statutorySection;
    }
  }

  const isLocal = process.env.NODE_ENV === "development" || process.platform === "win32";

  let launchOptions;
  if (isLocal) {
    launchOptions = {
      executablePath: resolveChromePath(),
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    };
  } else {
    launchOptions = {
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: "shell",
    };
  }

  let browser;
  try {
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    await page.setContent(populatedHtml, { waitUntil: 'domcontentloaded', timeout: 30000 });

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
      await browser.close().catch(() => {});
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
    const invoice = await Invoice.findById(Id)
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

    // EXEC-20: Authoritative Recalculation
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
    };

    let attachments = [];
    if (!content) {
      const data = {
        company: company,
        customer: invoice.customer,
        invoice: freshInvoice,
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
            { type: 'invoice' },
            { name: /standard moving invoice/i },
            { name: /invoice/i }
          ]
        });
        html = defaultTemplate?.htmlContent || '<html><body><h1>Invoice</h1>{{items}}</body></html>';
      }
      try {
        const pdfBuffer = await generatePdf(html, data);
        if (pdfBuffer) {
          attachments.push({
            filename: `Invoice_${invoice.index || invoice._id}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf'
          });
        }
      } catch (pdfErr) {
        console.error("PDF generation skipped in invoice createInvoicePDF:", pdfErr.message);
      }
    }

    const eventType = reqEventType || EMAIL_EVENTS.INVOICE_ISSUED;
    const recipient = invoice.customer?.email;

    const dispatchResult = await dispatchOutboxEmail({
      eventType,
      recipient,
      emailTemplateId,
      context: {
        company,
        customer: invoice.customer || {},
        invoice: freshInvoice,
        code: `/${invoice._id}`,
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
    return res.status(500).send(error.message || "Error generating or sending PDF");
  }
};




