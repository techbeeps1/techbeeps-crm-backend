const express = require('express');
const router = express.Router();
const AppSettings = require('../models/appSettingModel');

router.get('/available-settings', async (req, res) => {
    try {
        let appSettings = await AppSettings.findOne();
        if (!appSettings) {
            const defaultSettings = {
                language: 'en', // default language
                currency: 'USD', // default currency
                emailTemplates: {
                        quote: '',
                        quoteReminders: '',
                        appointment: '',
                        rescheduleAppointment:'',
                        invoice: '',
                        confirmation: '',
                        invoiceReminder:'',
                        cancellation: '',
                        paymentReminder: '',
                        paymentReminder2: '',
                        thankyou: '',
                        storageInovice:''
                    }
            };
            return res.json(defaultSettings); // Send default settings as a response
        }
        res.json(appSettings);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching available settings' });
    }
});


router.post('/save-settings', async (req, res) => {
    try {
        const { language, currency, emailTemplates,standardPrice} = req.body;
        let appSettings = await AppSettings.findOne();
        if (appSettings) {
            appSettings.language = language || appSettings.language;
            appSettings.currency = currency || appSettings.currency;
            appSettings.emailTemplates = emailTemplates || appSettings.emailTemplates;
            appSettings.standardPrice = standardPrice || appSettings.standardPrice;
        } else {
            appSettings = new AppSettings({
                language,
                currency,
                emailTemplates,
            });
        }
        await appSettings.save();
        res.status(200).json({ message: 'Settings saved/updated successfully' });
    } catch (error) {
        console.error('Error saving settings:', error);
        res.status(500).json({ error: 'Error saving settings' });
    }
});


module.exports = router;
