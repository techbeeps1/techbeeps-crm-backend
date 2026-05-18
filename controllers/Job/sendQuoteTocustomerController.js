const SendQuote = require("../../models/job/sendQuoteToCustomer");
const nodemailer = require("nodemailer");
const EmailTemplate = require("../../models/emailTemplate");
const { ObjectId } = require("mongodb");
const Email = require("../../models/Email/email");

const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

function convertDesignToHTML(design) {
  let html = "";

  design.body.rows.forEach((row) => {
    html += `<div style="background-color: ${row.values.backgroundColor}; padding: ${row.values.padding};">`;

    row.columns.forEach((column) => {
      column.contents.forEach((content) => {
        if (content.type === "text") {
          html += `<p style="font-size: ${content.values.fontSize}; color: ${content.values.color};">${content.values.text}</p>`;
        } else if (content.type === "image") {
          html += `<img src="${content.values.src}" alt="${content.values.alt}" />`;
        }
        // Add more cases for different content types (buttons, etc.)
      });
    });

    html += "</div>";
  });

  return html;
}

exports.sendQuoteToCustomer = async (req, res) => {
  try {
    let sendQuote = new SendQuote();
    
    sendQuote.jobId = req.body.jobId;
    sendQuote.address = req.body.address;
    sendQuote.contactPerson = req.body.contactPerson;
    sendQuote.discount = req.body.discount;
    sendQuote.employeeId = req.body.employeeId;
    sendQuote.expiresAt = req.body.expiresAt;
    // sendQuote.finishQuote = req.body.finishQuote;
    sendQuote.movingHours = req.body.movingHours;
    sendQuote.isVatIncluded = req.body.isVatIncluded;
    sendQuote.IgnoreZeroQuantityLines = req.body.IgnoreZeroQuantityLines;
    sendQuote.templateId = req.body.templateId;
    sendQuote.totalIncludingVat = req.body.totalIncludingVat;
    sendQuote.relationId = req.body.relationId;

    sendQuote.save().then((result) => {
      res.status(200).json({
        msg: "successfully sent quote to customer",
        data: result,
      });
    });

    if(sendQuote){
    const customerEmail = sendQuote.contactPerson.email;
    const emailTemplate = await EmailTemplate.findOne({
      _id: new ObjectId("65141ea7b96fbbdf489b2bad"),
    });
    const htmlContent = convertDesignToHTML(emailTemplate.design);
    const personalizedHtml = htmlContent.replace(
      /{{customer\.name}}/g,
      sendQuote.contactPerson.firstName
    );
    const mailOptions = {
      from: "no-reply@gmail.com",
      to: customerEmail,
      subject: "Successfully sent quote to customer",
      text: "View your quote",
      html: personalizedHtml,
    };
    const emailRecord = new Email({
      from: mailOptions.from,
      recipient: mailOptions.to,
      subject:mailOptions.subject,
      htmlContent:mailOptions.html,
      jobId:sendQuote.jobId
    });
    await emailRecord.save();
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        return console.log(`Error: ${error}`);
      }
      console.log(`Message Sent: ${info.response}`);
    });
  }
  } catch (err) {
    console.log(err);
  }
};
