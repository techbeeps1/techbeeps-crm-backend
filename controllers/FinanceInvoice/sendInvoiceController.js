const nodemailer = require("nodemailer");
const Email = require("../../models/Email/email");


exports.sendInvoice = async (req, res) => {
  const { from, recipient, bcc, subject, htmlContent } = req.body;

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

  let mailOptions = {
    from: from,
    to: recipient,
    bcc: bcc,
    subject: subject,
    html: htmlContent,
  };

  try {
    const emailRecord = new Email({
      from,
      recipient,
      bcc,
      subject,
      htmlContent,
    });
    await emailRecord.save();

    // Send email
    let info = await transporter.sendMail(mailOptions);
    console.log("Invoice sent: " + info.response);
    res.status(200).json({ message: "Invoice sent successfully!" });
  } catch (error) {
    console.error("Error sending invoice or saving to DB:", error);
    res.status(500).json({ error: "Failed to send Invoice or save to DB" });
  }
};
