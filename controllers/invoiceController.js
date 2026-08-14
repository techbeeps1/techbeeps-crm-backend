const Invoice = require("../models/invoice");
const CompanyDetails = require("../models/companyModel");
const { ObjectId } = require("mongodb");
const EmailTemplate = require('../models/reporting');
const nodemailer = require('nodemailer');
// const puppeteer = require('puppeteer');
// const chromium = require('chrome-aws-lambda');
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const Email = require('../models/Email/email');

exports.invoice = async (req, res) => {
  try {
    const newInvoice = new Invoice(req.body);
    const savedInvoice = await newInvoice.save();
    res.status(201).json(savedInvoice);
  } catch (error) {
    res.status(500).json({
      message: 'Failed to save the invoice',
      error: error.message
    });
  }
};

exports.updateInvoice = async (req, res) => {
  const { id } = req.params; // Get the invoice ID from request parameters
  const updatedData = req.body; // Get the updated data from request body
  try {
    const updatedInvoice = await Invoice.findByIdAndUpdate(id, updatedData, {
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
    const invoiceList = await Invoice.find(filter).populate('customer','firstName lastName').populate('contactPerson', 'username').sort({ createdAt: -1 })
    res.json({
      invoiceData: invoiceList,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.invoiceDetail = async (req, res) => {
  const { Id } = req.params;
  try {
    const invoice = await Invoice.findById(Id).populate({
      path: 'customer',
      populate: {
        path: 'address',
        match: { addressType: 'head' },
      },
    }).populate('contactPerson', 'username').populate('package', 'name').populate('financialTemplate', 'name').populate('items.salesgroup', 'name').populate('job');
    res.json({ invoice });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
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
    const invoice = await Invoice.findById(Id)
      .populate('customer')
      .populate('financialTemplate', 'htmlContent');
    if (!invoice) {
      return res.status(404).send('Invoice not found');
    }
    const company = await CompanyDetails.findOne();
    const data = {
      company: company,
      customer: invoice.customer,
      invoice: invoice,
    };
    let html = invoice.financialTemplate.htmlContent;
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

async function generatePdf(htmlContent, data) {
  const itemsHtml = data.invoice.items.map(item => `
    <tr >
      <td style='padding:15px 0'>${item.description}</td>
      <td style='padding:15px 0'>${item.quantity}</td>
      <td style='padding:15px 0'>${item.price}</td>
      <td style='padding:15px 0'>${item.quantity * item.price}</td>
      <td style="padding: 15px 0;">${(item.btw)}%</td>
    </tr>
    
  `).join('');

  const populatedHtml = htmlContent.replace(/{{\s*(\w+(\.\w+)*)\s*}}/g, (match, key) => {
    if (key === 'items') {
      return itemsHtml;
    }
    return key.split('.').reduce((obj, prop) => obj && obj[prop], data) || '';
  });

  // const browser = await puppeteer.launch({
  //   executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  //   headless: true
  // });

  const browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    args: chromium.args,
    headless: chromium.headless,
  });

  const page = await browser.newPage();
  await page.setContent(populatedHtml, { waitUntil: 'networkidle0' });

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: {
      top: '15mm',     // Top padding
      right: '15mm',   // Right padding
      bottom: '15mm',  // Bottom padding
      left: '15mm',    // Left padding
    },
  });
  await browser.close();
  return pdfBuffer;
}

exports.createInvoicePDF = async (req, res) => {
  const { Id, emailTemplateId, content } = req.body;
  if (!ObjectId.isValid(Id)) {
    return res.status(400).send('Invalid Invoice ID');
  }
  try {
    const invoice = await Invoice.findById(Id)
      .populate('customer')
      .populate('financialTemplate', 'htmlContent');
    if (!invoice) {
      return res.status(404).send('Invoice not found');
    }
    const company = await CompanyDetails.findOne();
    if (!company) {
      return res.status(404).send('Company details not found');
    }
    const emailTemplate = await EmailTemplate.findById(emailTemplateId);
    if (!emailTemplate) {
      return res.status(404).send('Email template not found');
    }
    let emailHtml = emailTemplate.htmlContent;

    const data = {
      company: company,
      customer: invoice.customer,
      invoice: invoice,
      code: `/${invoice._id}`,
    };
    let html = invoice.financialTemplate.htmlContent;

    const pdfBuffer = !content && await generatePdf(html, data) || null;

    emailHtml = emailHtml.replace(/{{\s*(\w+(\.\w+)*)\s*}}/g, (match, key) => {
      return key.split('.').reduce((obj, prop) => obj && obj[prop], data) || '';
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
      subject: `Invoice # ${invoice.index} from ${company.companyName}`,
      html: emailHtml,
      attachments: !content && [{
        filename: 'Invoice.pdf',
        content: pdfBuffer,
        contentType: 'application/pdf'
      }] || null,
    };
    const newEmail = new Email({
      from: process.env.SMTP_USER,
      recipient: data.customer.email,
      subject: mailOptions.subject,
      htmlContent: mailOptions.html,
      offer: invoice._id,
      customer: data.customer._id
    });
    const savedEmail = await newEmail.save();
    await transporter.sendMail(mailOptions);
    res.status(200).send(savedEmail._id);
  } catch (error) {
    console.error("Error generating or sending PDF:", error);
    res.status(500).send("Error generating or sending PDF");
  }
};




