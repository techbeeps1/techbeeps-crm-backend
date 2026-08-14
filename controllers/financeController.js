const Finance = require('../models/finance');
const { ObjectId } = require("mongodb");
const CompanyDetails = require("../models/companyModel");
const nodemailer = require('nodemailer');
const EmailTemplate = require('../models/reporting');

const Email = require('../models/Email/email');

exports.finance = async (req, res) => {
  try {
    let finance = new Finance(req.body);
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
  const { id } = req.params; // Get the invoice ID from request parameters
  const updatedData = req.body; // Get the updated data from request body
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
  try {
    const finance = await Finance.findById(Id).populate({
      path: 'customer',
      populate: {
        path: 'address',
        match: { addressType: 'head' },
      },
    }).populate('contactPerson', 'username').populate('package', 'name').populate('financialTemplate', !template && 'name').populate('items.salesgroup', 'name').populate('job');
    res.json({ finance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.financeList = async (req, res) => {
  try {
    let { job, customer } = req.query;
    const page = parseInt(req.query.page) || 1;
    const filter = {};
    if (job) filter.job = job;
    if (customer) filter.customer = customer;
    const financeList = await Finance.find(filter).sort({ createdAt: -1 }).populate('customer', 'firstName lastName').populate('contactPerson', 'username');
    res.json({
      financeData: financeList,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
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
    const invoice = await Finance.findById(Id)
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
      'Content-Disposition': 'attachment; filename="quote.pdf"',
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Error generating PDF:", error);
    res.status(500).send("Error generating PDF");
  }
};


const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");
async function generatePdf(htmlContent, data) {
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
              ${(item.price).toFixed(2)} $
            </td>

            <td style="padding:15px 0">
              ${(item.quantity * item.price).toFixed(2)} $
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

  const populatedHtml = htmlContent.replace(
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
    //const isLocal = process.env.NODE_ENV === "development";
    const isLocal = "development" !== "development";

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
      waitUntil: "networkidle0",
    });

    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "15mm",
        right: "7mm",
        bottom: "15mm",
        left: "7mm",
      },
    });
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

    if (!html) {
      return res.status(404).send('Financial Template not found');
    }

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
      subject: `Quatation # ${invoice.index} from ${company.companyName}`,
      html: emailHtml,
      attachments: !content && [{
        filename: 'Quatation.pdf',
        content: pdfBuffer,
        contentType: 'application/pdf'
      }] || null,
    };
    const newEmail = new Email({
      from: process.env.SMTP_USER,
      recipient: data.customer?.email,
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

