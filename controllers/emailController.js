const nodemailer = require('nodemailer');
const crypto = require('crypto');
const Otp = require('../models/otpModel');
const CompanyDetails = require("../models/companyModel");
const EmailTemplate = require('../models/reporting');
const jobSchedule = require('../models/jobSchedule');
const Email = require('../models/Email/email');
const User = require('../models/user');



const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});


exports.sendOtp = async (req, res) => {
    const { email } = req.body;
    const otp = crypto.randomInt(100000, 999999).toString();
    let user = await User.findOne({ email });
    // if (!user) {
    //     return res.status(400).json({ msg: 'User not exists' });
    // }
    if (!email) {
        return res.status(400).json({ message: 'Email is required' });
    }
    try {
        await Otp.findOneAndUpdate({ email }, { otp }, { upsert: true });
        const mailOptions = {
            from: process.env.SMTP_USER,
            to: email,
            subject: 'Your OTP Code',
            text: `Your OTP code is: ${otp}`,
        };
        await transporter.sendMail(mailOptions);
        res.status(200).json({ message: 'OTP sent to your email' });
    } catch (error) {
        res.status(500).json({ message: 'Error sending OTP', error });
    }
};

exports.verifyOtp = async (req, res) => {
    const { email, otp } = req.body;
    try {
        const record = await Otp.findOne({ email, otp });
        if (record) {
            await Otp.deleteOne({ email }); // OTP can only be used once
            return res.status(200).json({ message: 'OTP verified successfully' });
        } else {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error verifying OTP', error });
    }
};


exports.sendEmail = async (req, res) => {
    const { emailTemplateId, extraData, job, subject } = req.body;
    try {
        const company = await CompanyDetails.findOne();
        if (!company) {
            return res.status(404).send('Company details not found');
        }
        const emailTemplate = await EmailTemplate.findById(emailTemplateId);
        if (!emailTemplate) {
            return res.status(404).send('Email template not found');
        }

        const jobDetail = await jobSchedule.findById(job).populate('customer');
        if(job){
            if (!jobDetail) {
                return res.status(404).send('jobDetail not found');
            }
        }

        let emailHtml = emailTemplate.htmlContent;
        const data = {
            company: company,
            customer: job ? jobDetail.customer : extraData || null,
            job: job ? jobDetail : null,
            data: extraData,
        };
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
            to: job ? jobDetail?.customer?.email : extraData.email,
            subject: subject,
            html: emailHtml,
        };
        const newEmail = new Email({
            from: process.env.SMTP_USER,
            recipient: mailOptions.to,
            subject: mailOptions.subject,
            htmlContent: mailOptions.html,
            customer: job ? jobDetail.customer?._id : null
        });
        if (job) {
            await jobSchedule.findByIdAndUpdate(
                job, { status: 'Processing' },
            );
        }
        const savedEmail = await newEmail.save();
        await transporter.sendMail(mailOptions);
        res.status(200).send(savedEmail._id);
    } catch (error) {
        console.error("Error in sending mail:", error);
        res.status(500).send("Error in sending mail");
    }
};