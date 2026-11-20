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
    if (!email || typeof email !== 'string') {
        return res.status(400).json({ message: 'A valid email string is required' });
    }
    const safeEmail = String(email).trim().toLowerCase();
    const otp = crypto.randomInt(100000, 999999).toString();
    let user = await User.findOne({ email: safeEmail });
    const emailDomain = (safeEmail || '').split('@')[1]?.toLowerCase();
    const DISPOSABLE_EMAIL_DOMAINS = ['mailinator.com', 'tempmail.com', 'guerrillamail.com', 'yopmail.com', 'trashmail.com'];
    if (DISPOSABLE_EMAIL_DOMAINS.includes(emailDomain)) {
        return res.status(403).json({ message: 'Password recovery is disabled for public disposable mailbox domains.' });
    }
    if (user && (user.isRestricted || user.isActive === false)) {
        return res.status(403).json({ message: 'Password recovery is disabled for restricted accounts.' });
    }
    try {
        await Otp.findOneAndUpdate({ email: safeEmail }, { otp }, { upsert: true });
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
            from: `"${company?.companyName || 'Universal Movers'}" <${process.env.SMTP_USER}>`,
            replyTo: company?.companyEmail || 'info@universal-movers.nl',
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
    if (!email || !otp) {
        return res.status(400).json({ message: 'Email and OTP are required' });
    }
    if (typeof email !== 'string' || (typeof otp !== 'string' && typeof otp !== 'number')) {
        return res.status(400).json({ message: 'Invalid email or OTP format' });
    }
    const safeEmail = String(email).trim().toLowerCase();
    const safeOtp = String(otp).trim();
    if (!/^\d{6}$/.test(safeOtp)) {
        return res.status(400).json({ message: 'OTP must be a valid 6-digit number' });
    }
    try {
        const record = await Otp.findOne({ email: safeEmail, otp: safeOtp });
        if (record) {
            await Otp.deleteOne({ email: safeEmail }); // OTP can only be used once
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

    // Defense-in-depth: Never allow plaintext passwords in email payloads or outbox records
    if (extraData && typeof extraData === 'object') {
        delete extraData.password;
    }
    if (req.body && req.body.password) {
        delete req.body.password;
    }
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

        let recipient = null;
        if (jobDetail) {
            recipient = jobDetail?.customer?.email;
            if (!recipient) {
                return res.status(400).json({ msg: 'The customer linked to this job does not have a valid email address.' });
            }
        } else {
            const rawRecipient = extraData?.email || req.body.recipient;
            if (!rawRecipient || typeof rawRecipient !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawRecipient.trim())) {
                return res.status(400).json({ msg: 'A valid recipient email address is required.' });
            }
            recipient = rawRecipient.trim().toLowerCase();
        }

        const cleanSubject = typeof subject === 'string'
            ? subject.replace(/[\r\n]+/g, ' ').trim()
            : subject;

        const dispatchResult = await dispatchOutboxEmail({
            eventType,
            recipient,
            subject: cleanSubject,
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

        if (!dispatchResult.success) {
            const statusCode = dispatchResult.statusCode || (dispatchResult.blocked ? 422 : 500);
            const errorReason = dispatchResult.message || dispatchResult.deliveryResult?.response || dispatchResult.errorCode || 'Email dispatch failed';
            return res.status(statusCode).json({
                success: false,
                error: dispatchResult.errorCode || 'EMAIL_DISPATCH_FAILED',
                message: errorReason,
                missing: dispatchResult.missing,
                emailId: dispatchResult.emailId,
            });
        }

        return res.status(200).json({
            success: true,
            emailId: dispatchResult.emailId,
            message: 'Email dispatched successfully.',
            deliveryResult: dispatchResult.deliveryResult,
        });
    } catch (error) {
        console.error("Error in sending mail:", error);
        res.status(500).json({ success: false, message: "Error in sending mail: " + error.message });
    }
};

exports.getEmailLogs = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            status,
            eventType,
            recipient,
            job,
            offer,
        } = req.query;

        const query = {};
        if (status) query.status = status;
        if (eventType) query.eventType = eventType;
        if (recipient) query.recipient = { $regex: recipient.trim(), $options: 'i' };
        if (job) query.job = job;
        if (offer) query.offer = offer;

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
        const skip = (pageNum - 1) * limitNum;

        const [logs, total] = await Promise.all([
            Email.find(query)
                .sort({ sentAt: -1, createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Email.countDocuments(query),
        ]);

        res.json({
            success: true,
            total,
            page: pageNum,
            pages: Math.ceil(total / limitNum),
            limit: limitNum,
            logs,
        });
    } catch (error) {
        console.error('Error fetching email logs:', error);
        res.status(500).json({ success: false, message: 'Server error fetching email logs' });
    }
};
