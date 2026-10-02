const Finance = require('../models/finance');
const JobSchedule = require('../models/jobSchedule');
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

exports.updateInvoice = async (req, res) => {
  const { id } = req.params;
  const updatedData = req.body;

  const isAcceptingQuote = updatedData.Status && updatedData.Status.toLowerCase() === 'accepted';
  const allowedPublicFields = ['Status', 'customerSignature', 'acceptedAt'];
  const payloadKeys = Object.keys(updatedData);
  const isPublicAcceptanceOnly = isAcceptingQuote && payloadKeys.every(k => allowedPublicFields.includes(k));

  if (!isPublicAcceptanceOnly) {
    // Modifications other than customer quote acceptance require Admin authentication
    const authHeader = req.header('Authorization');
    const token = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.replace('Bearer ', '').trim() : null;
    if (!token || token === 'null' || token === 'undefined') {
      return res.status(401).json({ msg: 'Authentication token required for invoice modification' });
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded && decoded.role !== 'Admin') {
        return res.status(403).json({ msg: 'Access denied: Staff and Agents cannot edit quotes' });
      }
    } catch (tokenErr) {
      return res.status(401).json({ msg: 'Invalid authentication token' });
    }
  }

  try {
    const updatedInvoice = await Finance.findByIdAndUpdate(
      id,
      updatedData,
      {
        returnDocument: "after",
        runValidators: true
      }
    );
    if (!updatedInvoice) {
      return res.status(404).json({
        message: 'Invoice not found'
      });
    }

    // If quotation status is updated to Accepted, update linked job from Pending to Processing
    if (updatedData.Status && updatedData.Status.toLowerCase() === 'accepted') {
      try {
        const queryConditions = [{ offer: id }];
        if (mongoose.Types.ObjectId.isValid(id)) {
          queryConditions.push({ offer: new mongoose.Types.ObjectId(id) });
        }
        if (updatedInvoice.job) {
          queryConditions.push({ _id: updatedInvoice.job });
        }

        const linkedJobs = await JobSchedule.find({ $or: queryConditions });
        for (const job of linkedJobs) {
          const currentJobStatus = (job.status || '').toLowerCase();
          if (currentJobStatus === 'pending') {
            job.status = 'Processing';
            await job.save();
          }
        }
      } catch (jobErr) {
        console.error('Error updating linked job status on quote acceptance:', jobErr);
      }
    }

    res.status(200).json(updatedInvoice);
  } catch (error) {
    res.status(500).json({
      message: 'Failed to update the invoice',
      error: error.message
    });
  }
};

exports.financeDetail = async (req, res) => {
  const { Id } = req.params;
  const { template } = req.query;
  const token = req.header('Authorization')?.replace('Bearer ', '');

  try {
    const finance = await Finance.findById(Id).populate({
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

    // If request is from an unauthenticated public recipient, sanitize DTO
    if (!token) {
      const pubFinance = {
        _id: finance._id,
        index: finance.index,
        Status: finance.Status,
        date: finance.date,
        createdAt: finance.createdAt,
        total: finance.total,
        subtotal: finance.subtotal,
        tax: finance.tax,
        discount: finance.discount,
        paymentOption: finance.paymentOption,
        items: (finance.items || []).map(item => ({
          description: item.description,
          price: item.price,
          quantity: item.quantity,
          total: item.total,
          tax: item.tax,
          unit: item.unit
        })),
        customer: finance.customer ? {
          firstName: finance.customer.firstName,
          lastName: finance.customer.lastName,
          companyName: finance.customer.companyName,
          email: finance.customer.email,
          telephone: finance.customer.telephone,
          address: finance.customer.address,
        } : null,
        financialTemplate: finance.financialTemplate,
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

    const invoice = await Finance.findById(Id)
      .populate("customer")
      .populate("financialTemplate", "htmlContent");

    if (!invoice) {
      return res.status(404).send("Invoice not found");
    }

    if (!invoice.financialTemplate?.htmlContent) {
      return res.status(404).send("Financial Template not found");
    }

    const company = await CompanyDetails.findOne();
    const fallbackCompany = {
      companyName: 'Universal Movers B.V.',
      companyAddress: 'Starterspand, H.J.E. Wenckebachweg 53-M',
      companyState: 'Amsterdam',
      companyCountry: 'Netherlands',
      companyEmail: 'info@universalmovers.nl',
      companyPhone: '+31 20 123 4567',
      companyWebsite: 'https://universalmovers.nl',
      companyTaxNumber: 'NL861234567B01',
      companyVatNumber: 'NL861234567B01',
      companyRegNumber: '81234567',
    };

    const appSettings = await AppSettings.findOne();
    const data = {
      company: company || fallbackCompany,
      customer: invoice.customer,
      invoice,
      currency: appSettings?.currency || 'EUR',
      currencySymbol: appSettings?.currencySymbol || '€',
      currencyPosition: appSettings?.currencyPosition || 'before',
      currencyDecimals: appSettings?.currencyDecimals !== undefined ? appSettings.currencyDecimals : 2,
    };

    const html = invoice.financialTemplate.htmlContent;

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

  const itemsHtml = `
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr>
          <th style="padding: 15px 0; width: 60%;">Description</th>
          <th style="padding: 15px 0; width: 10%;">Quantity</th>
          <th style="padding: 15px 0; width: 10%;">Price</th>
          <th style="padding: 15px 0; width: 10%;">Total</th>
          <th style="padding: 15px 0; width: 10%;">BTW (%)</th>
        </tr>
      </thead>
      <tbody>
        ${data.invoice.items
      .map(
        (item) => `
          <tr>
            <td style="padding:15px 0">
              ${item.description}
            </td>

            <td style="padding:15px 0">
              ${item.quantity}
            </td>

            <td style="padding:15px 0">
              ${fmt(item.price)}
            </td>

            <td style="padding:15px 0">
              ${fmt(item.quantity * item.price)}
            </td>

            <td style="padding:15px 0">
              ${item.btw}%
            </td>
          </tr>
        `
      )
      .join("")}
      </tbody>
    </table>
  `;

  const populatedHtml = (htmlContent || '')
    .replace(/\$\{[^}]*\}/g, '')
    .replace(
      /{{\s*(\w+(\.\w+)*)\s*}}/g,
      (match, key) => {
      if (key === "items") {
        return itemsHtml;
      }

      return (
        key
          .split(".")
          .reduce((obj, prop) => obj && obj[prop], data) || ""
      );
    }
  );

  let browser;

  try {
    const isLocal = process.env.NODE_ENV === "development";


    let launchOptions;

    if (isLocal) {
      // Windows local Chrome
      launchOptions = {
        executablePath:
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        headless: true,
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

    await page.setContent(populatedHtml, {
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

    emailHtml = renderEmailTemplate(emailHtml || '', {
      company,
      customer: invoice.customer || {},
      invoice,
      code: `/${invoice._id}`,
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

