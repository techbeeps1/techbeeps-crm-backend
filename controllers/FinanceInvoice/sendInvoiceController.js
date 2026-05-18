const nodemailer = require("nodemailer");
const Email = require("../../models/Email/email");


exports.sendInvoice = async (req, res) => {
  const { from, recipient, bcc, subject, htmlContent } = req.body;

  let transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,
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
