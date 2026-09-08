const express = require('express');
const router = express.Router();
const AppSettings = require('../models/appSettingModel');
const nodemailer = require('nodemailer');

router.get('/available-settings', async (req, res) => {
    try {
        let appSettings = await AppSettings.findOne();
        if (!appSettings) {
            appSettings = new AppSettings({
                language: 'US English',
                country: 'IN India',
                adminNotificationEmail: 'mprofessionalwfh@gmail.com',
                timezone: 'UTC +05:30 (Asia/Kolkata)',
                timezoneName: 'Asia/Kolkata',
                currency: 'USD',
                currencySymbol: '$',
                currencyPosition: 'before',
                currencyDecimals: 2,
                emailTemplates: {
                    quote: '',
                    quoteReminders: '',
                    appointment: '',
                    rescheduleAppointment: '',
                    invoice: '',
                    confirmation: '',
                    invoiceReminder: '',
                    cancellation: '',
                    paymentReminder: '',
                    paymentReminder2: '',
                    thankyou: '',
                    storageInovice: ''
                },
                standardPrice: {
                    pricePerMeterCubic: 0,
                    pricePerHour: 0,
                    pricePerKilometer: 0,
                    cubicMeterPerHourPerEmployee: 0,
                    packingBoxPerHour: 0,
                    unPackagingBoxPerHour: 0,
                    assemblingTimePerfurniture: 0,
                    disassemblingTimePerfurniture: 0
                }
            });
            await appSettings.save();
        }
        res.json(appSettings);
    } catch (error) {
        console.error('Error fetching available settings:', error);
        res.status(500).json({ error: 'Error fetching available settings' });
    }
});

router.post('/save-settings', async (req, res) => {
    try {
        const {
            language,
            country,
            adminNotificationEmail,
            email,
            timezone,
            timezoneName,
            currency,
            currencySymbol,
            currencyPosition,
            currencyDecimals,
            emailTemplates,
            standardPrice
        } = req.body;

        let appSettings = await AppSettings.findOne();
        if (!appSettings) {
            appSettings = new AppSettings({});
        }

        if (language !== undefined) appSettings.language = language;
        if (country !== undefined) appSettings.country = country;
        if (adminNotificationEmail !== undefined || email !== undefined) {
            appSettings.adminNotificationEmail = adminNotificationEmail || email;
        }
        if (timezone !== undefined) appSettings.timezone = timezone;
        if (timezoneName !== undefined) appSettings.timezoneName = timezoneName;
        if (currency !== undefined) appSettings.currency = currency;
        if (currencySymbol !== undefined) appSettings.currencySymbol = currencySymbol;
        if (currencyPosition !== undefined) appSettings.currencyPosition = currencyPosition;
        if (currencyDecimals !== undefined) appSettings.currencyDecimals = Number(currencyDecimals);
        if (emailTemplates !== undefined) appSettings.emailTemplates = emailTemplates;
        if (standardPrice !== undefined) appSettings.standardPrice = standardPrice;

        await appSettings.save();
        res.status(200).json({ message: 'Settings saved/updated successfully', settings: appSettings });
    } catch (error) {
        console.error('Error saving settings:', error);
        res.status(500).json({ error: 'Error saving settings' });
    }
});

router.post('/send-admin-test-email', async (req, res) => {
    try {
        const { email } = req.body;
        let targetEmail = email;
        if (!targetEmail) {
            const appSettings = await AppSettings.findOne();
            targetEmail = appSettings?.adminNotificationEmail;
        }
        if (!targetEmail || !targetEmail.trim()) {
            return res.status(400).json({ error: 'Please enter a valid admin notification email.' });
        }

        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'mail.techbeeps.co.in',
            port: 587,
            secure: false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        const mailOptions = {
            from: `"Techbeeps CRM System" <${process.env.SMTP_USER}>`,
            to: targetEmail.trim(),
            subject: '🔔 Techbeeps CRM - Admin Notification Email Verified',
            html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <h2 style="color: #3b82f6; margin: 0; font-size: 22px;">Techbeeps CRM</h2>
                        <p style="color: #64748b; font-size: 13px; margin-top: 4px;">System Notification Service</p>
                    </div>
                    <div style="background: #f0fdf4; border-radius: 12px; padding: 18px; border: 1px solid #bbf7d0; margin-bottom: 20px;">
                        <p style="margin: 0 0 8px 0; font-size: 15px; color: #166534; font-weight: 700;">✅ Admin Notification Email Verified Successfully!</p>
                        <p style="margin: 0; font-size: 13px; color: #15803d; line-height: 1.5;">
                            This test email confirms that <strong>${targetEmail}</strong> is properly configured and actively receiving system alerts, leave requests, and operational notifications.
                        </p>
                    </div>
                    <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">
                        Dispatched: ${new Date().toISOString()} • Techbeeps CRM
                    </p>
                </div>
            `,
        };

        await transporter.sendMail(mailOptions);
        return res.status(200).json({ message: `Test notification sent successfully to ${targetEmail}` });
    } catch (error) {
        console.error('Error sending test admin email:', error);
        return res.status(500).json({ error: `Failed to send email: ${error.message}` });
    }
});

module.exports = router;
