const nodemailer = require('nodemailer');
const crypto = require('crypto');
const Otp = require('../models/otpModel');
const CompanyDetails = require("../models/companyModel");
const EmailTemplate = require('../models/reporting');
const jobSchedule = require('../models/jobSchedule');
const Email = require('../models/Email/email');
const User = require('../models/user');
const { renderEmailTemplate } = require('../utils/emailTemplateUtil');
const { dispatchOutboxEmail, EMAIL_EVENTS } = require('../utils/emailOutboxService');

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
    if (!email) {
        return res.status(400).json({ message: 'Email is required' });
    }
    const emailDomain = (email || '').split('@')[1]?.toLowerCase();
    const DISPOSABLE_EMAIL_DOMAINS = ['mailinator.com', 'tempmail.com', 'guerrillamail.com', 'yopmail.com', 'trashmail.com'];
    if (DISPOSABLE_EMAIL_DOMAINS.includes(emailDomain)) {
        return res.status(403).json({ message: 'Password recovery is disabled for public disposable mailbox domains.' });
    }
    if (user && (user.isRestricted || user.isActive === false)) {
        return res.status(403).json({ message: 'Password recovery is disabled for restricted accounts.' });
    }
    try {
        await Otp.findOneAndUpdate({ email }, { otp }, { upsert: true });
        const company = await CompanyDetails.findOne();
        const emailTemplate = await EmailTemplate.findOne({
            $or: [
                { name: /OTP/i },
                { _id: '6a10498d6560cd48279e6846' }
            ]
        });

        let emailHtml = '';
        if (emailTemplate) {
            emailHtml = renderEmailTemplate(emailTemplate.htmlContent, {
                company,
                customer: user || { firstName: email.split('@')[0], name: user?.username || email.split('@')[0] },
                user: user || { username: email.split('@')[0], email },
                otp,
                data: { otp },
                extraData: { otp }
            });
        } else {
            emailHtml = `
              <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 500px; margin: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
                <h2 style="color: #0f172a; text-align: center;">Verification Code (OTP)</h2>
                <p>Hello,</p>
                <p>Your one-time verification code is:</p>
                <div style="text-align: center; margin: 24px 0;">
                  <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #3c50e0; background: #f1f5f9; padding: 12px 24px; border-radius: 6px;">${otp}</span>
                </div>
                <p style="font-size: 12px; color: #64748b;">This code expires in 10 minutes. If you did not request this, please ignore this email.</p>
              </div>
            `;
        }

        const mailOptions = {
            from: process.env.SMTP_USER,
            to: email,
            subject: 'Your Verification Code (OTP)',
            html: emailHtml,
            text: `Your OTP verification code is: ${otp}`,
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
    const { emailTemplateId, extraData = {}, job, subject, eventType: reqEventType } = req.body;
    const idempotencyKey = req.headers['x-idempotency-key'] || req.body.idempotencyKey;
    try {
        const company = await CompanyDetails.findOne();
        if (!company) {
            return res.status(404).send('Company details not found');
        }

        let jobDetail = null;
        if (job) {
            jobDetail = await jobSchedule.findById(job).populate('customer');
            if (!jobDetail) {
                return res.status(404).send('jobDetail not found');
            }
        }

        // Determine canonical event type
        let eventType = reqEventType;
        if (!eventType) {
            const subj = subject || '';
            if (/survey/i.test(subj) || extraData?.appointmentType === 'Survey') {
                if (/reschedule/i.test(subj)) eventType = EMAIL_EVENTS.SURVEY_RESCHEDULED;
                else if (/cancel/i.test(subj)) eventType = EMAIL_EVENTS.SURVEY_CANCELLED;
                else eventType = EMAIL_EVENTS.SURVEY_SCHEDULED;
            } else if (/move|relocation/i.test(subj) || jobDetail) {
                if (/reschedule/i.test(subj)) eventType = EMAIL_EVENTS.MOVE_RESCHEDULED;
                else if (/cancel/i.test(subj)) eventType = EMAIL_EVENTS.MOVE_CANCELLED;
                else eventType = EMAIL_EVENTS.MOVE_SCHEDULED;
            } else if (/quote|proposal/i.test(subj)) {
                eventType = EMAIL_EVENTS.QUOTE_SENT;
            } else if (/invoice|bill/i.test(subj)) {
                eventType = EMAIL_EVENTS.INVOICE_ISSUED;
            } else if (/thank\s*you/i.test(subj)) {
                eventType = EMAIL_EVENTS.POST_MOVE_THANKYOU;
            } else if (/appointment|planning/i.test(subj)) {
                eventType = /reschedule/i.test(subj) ? EMAIL_EVENTS.SURVEY_RESCHEDULED : EMAIL_EVENTS.SURVEY_SCHEDULED;
            } else {
                eventType = EMAIL_EVENTS.SURVEY_SCHEDULED;
            }
        }

        const recipient = jobDetail ? jobDetail?.customer?.email : (extraData?.email || req.body.recipient);

        const dispatchResult = await dispatchOutboxEmail({
            eventType,
            recipient,
            subject,
            emailTemplateId,
            context: {
                company,
                customer: jobDetail ? jobDetail.customer : extraData,
                job: jobDetail,
                appointment: extraData?.appointment || extraData,
                extraData,
                data: extraData,
            },
            idempotencyKey,
        });

        if (!dispatchResult.success && dispatchResult.blocked) {
            return res.status(dispatchResult.statusCode || 422).json({
                error: dispatchResult.errorCode,
                message: dispatchResult.message,
                missing: dispatchResult.missing,
            });
        }

        if (job) {
            await jobSchedule.findByIdAndUpdate(job, { status: 'Processing' });
        }

        return res.status(200).send(dispatchResult.emailId);
    } catch (error) {
        console.error("Error in sending mail:", error);
        res.status(500).send("Error in sending mail: " + error.message);
    }
};
