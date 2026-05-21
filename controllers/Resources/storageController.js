const Storage = require('../../models/Resources/storageModel');
const CompanyDetails = require("../../models/companyModel");
const EmailTemplate = require('../../models/reporting');
const financial = require('../../models/documentTemplateModel');
const chromium = require('@sparticuz/chromium');
// const chromium = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');
const nodemailer = require('nodemailer');

exports.createStorage = async (req, res) => {
    try {
        const storage = new Storage(req.body);
        await storage.save();
        res.status(201).json(storage);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

exports.getAllStorages = async (req, res) => {
    try {
        const { customer } = req.query;
        let filter = {}
        if (customer) {
            filter.customer = customer;
        }
        const storages = await Storage.find(filter).populate('warehouse').populate('storageLocation').populate({
            path: 'customer',
            populate: {
                path: 'address',
                match: { addressType: 'head' },
            },
        }).populate({
            path: 'events',
            populate: [
                { path: 'storageLocation', select: 'name' },
                { path: 'loadedByEmployee', select: '-contract -drivingLicense -password -skills' },
                { path: 'ReleasedByEmployee', select: '-contract -drivingLicense -password -skills' },
            ],
        });
        res.status(200).json(storages);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
exports.getStorageById = async (req, res) => {
    try {
        const { id } = req.params;
        const storage = await Storage.findById(id);

        if (!storage) {
            return res.status(404).json({
                success: false,
                message: 'Storage not found',
            });
        }

        res.status(200).json(storage);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch storage',
            error: error.message,
        });
    }
};

exports.emptyStorage = async (req, res) => {
    try {
        const { storageId } = req.params;
        const storage = await Storage.findById(storageId);
        if (!storage) {
            return res.status(404).json({ success: false, message: 'Storage not found' });
        }
        const retainedFields = {
            storageCode: storage.storageCode,
            storageType: storage.storageType,
            selfOwned: storage.selfOwned,
            cubicMeter: storage.cubicMeter,
            warehouse: storage.warehouse,
            storageLocation: storage.storageLocation,
        };
        const resetFields = {
            storageStatus: 'free',
            percentageFill: 0,
            customer: null,
            storedForProject: null,
            salesGroup: null,
            notes: null,
            invoicingPeriod: null,
            costAction: [],
            price: null,
            invoicingStartDate: null,
            lastInvoicedDate: null,
            includingVat: null,
            billStorageInAdvance: null,
            invoiceReference: null,
            volumeType: null,
            totalVolume: 0,
            invoicePerVolume: false,
            setVolumeToQuantity: false,
            volumeChanges: [],
            invoicedPeriods: [],
            events: [],
            photos: [],
            vatPercentage: null,
            loadedOn: null,
            deleted: false,
        };
        Object.assign(storage, retainedFields, resetFields);
        await storage.save();
        res.status(200).json({ success: true, message: 'Storage emptied successfully', storage });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Failed to empty storage', error: error.message });
    }
};

exports.updateStorage = async (req, res) => {
    try {
        const { id } = req.params;

        const filteredBody = Object.fromEntries(
            Object.entries(req.body).filter(([_, value]) => {
                if (value === "" || value === null) return false; // Exclude blank string or null
                if (Array.isArray(value)) {
                    return value.length > 0 && value.some((item) => item !== null);
                }
                return true; // Keep other valid values
            })
        );
        const updatedStorage = await Storage.findByIdAndUpdate(id, filteredBody, { new: true });
        if (!updatedStorage) {
            return res.status(404).json({
                success: false,
                message: 'Storage not found',
            });
        }
        res.status(200).json({
            success: true,
            message: 'Storage updated successfully',
            updatedStorage,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to update storage',
            error: error.message,
        });
    }
};

exports.loadingUnloading = async (req, res) => {
    try {
        const { id } = req.params;
        const { costAction, events, percentageFill, notes, totalVolume } = req.body; // Destructure fields from the request body
        const storage = await Storage.findById(id);
        if (!storage) {
            return res.status(404).json({
                success: false,
                message: 'Storage not found',
            });
        }
        if (costAction) {
            storage.costAction.push(costAction);
        }
        if (Array.isArray(events)) {
            storage.events = events;
        }
        if (percentageFill !== undefined) {
            storage.percentageFill = percentageFill;
        }
        if (notes !== undefined) {
            storage.notes = notes;
        }
        if (totalVolume !== undefined) {
            storage.totalVolume = totalVolume;
        }
        await storage.save();
        res.status(200).json({
            success: true,
            message: 'Storage updated successfully',
        });
    } catch (error) {
        console.error('Error updating storage:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update storage',
            error: error.message,
        });
    }
};


exports.deleteStorage = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedStorage = await Storage.findByIdAndDelete(id);

        if (!deletedStorage) {
            return res.status(404).json({
                success: false,
                message: 'Storage not found',
            });
        }

        res.status(200).json({
            success: true,
            message: 'Storage deleted successfully',
        });
    } catch (error) {
        console.error('Error deleting storage:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete storage',
            error: error.message,
        });
    }
};


exports.DownloadInvoicePDF = async (req, res) => {
    const { Id, financialTemplate, lastInvoiceDate } = req.body;

    try {
        const storage = await Storage.findById(Id)
            .populate('warehouse')
            .populate('storageLocation')
            .populate('customer')
            .populate({
                path: 'events',
                options: {
                    sort: { createdAt: -1 } // latest first
                    // sort: { eventDate: 1 } // use your field name
                },
                populate: [
                    { path: 'storageLocation', select: 'name' },
                    {
                        path: 'loadedByEmployee',
                        select: '-contract -drivingLicense -password -skills'
                    },
                    {
                        path: 'ReleasedByEmployee',
                        select: '-contract -drivingLicense -password -skills'
                    }
                ]
            });

        if (!storage) {
            return res.status(404).send('storage not found');
        }

        const company = await CompanyDetails.findOne();
        const emailTemplate = await financial.findById(financialTemplate);

        const data = {
            company,
            customer: storage.customer,
            storage,
            lastInvoiceDate,
            startDate: storage.invoicingStartDate?.toLocaleString(),
            endDate: new Date(lastInvoiceDate)?.toLocaleString()
        };

        let html = emailTemplate.htmlContent;

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

exports.sendInvoicePDF = async (req, res) => {
    const { Id, financialTemplate, lastInvoiceDate, emailTemplateId } = req.body;
    try {
        const storage = await Storage.findById(Id).populate('warehouse').populate('storageLocation').populate('customer').populate({
            path: 'events',
            populate: [
                { path: 'storageLocation', select: 'name' },
                { path: 'loadedByEmployee', select: '-contract -drivingLicense -password -skills' },
                { path: 'ReleasedByEmployee', select: '-contract -drivingLicense -password -skills' },
            ],
        });
        if (!storage) {
            return res.status(404).send('storage not found');
        }
        const company = await CompanyDetails.findOne();
        if (!company) {
            return res.status(404).send('Company details not found');
        }
        const pdfTemplate = await financial.findById(financialTemplate);

        const emailTemplate = await EmailTemplate.findById(emailTemplateId);

        if (!emailTemplate) {
            return res.status(404).send('Email template not found');
        }

        let emailHtml = emailTemplate.htmlContent;

        const data = {
            company: company,
            customer: storage.customer,
            storage: storage,
            lastInvoiceDate: lastInvoiceDate
        };

        let html = pdfTemplate.htmlContent;

        const pdfBuffer = await generatePdf(html, data)

        emailHtml = emailHtml.replace(/{{\s*(\w+(\.\w+)*)\s*}}/g, (match, key) => {
            return key.split('.').reduce((obj, prop) => obj && obj[prop], data) || '';
        });

        const transporter = nodemailer.createTransport({
            service: 'Gmail',
            auth: {
                user: process.env.GMAIL_USER,
                pass: process.env.GMAIL_PASS,
            },
        });
        const mailOptions = {
            from: process.env.GMAIL_USER,
            to: storage.customer?.email,
            subject: `Invoice from ${company.companyName} for warehouse Charges`,
            html: emailHtml,
            attachments: [{
                filename: 'Invoice.pdf',
                content: pdfBuffer,
                contentType: 'application/pdf'
            }]
        };
        await transporter.sendMail(mailOptions);
        res.status(200).send('Invoice send successfully');
    } catch (error) {
        console.error("Error generating or sending PDF:", error);
        res.status(500).send("Error generating or sending PDF");
    }
};

const pdf = require("html-pdf");

async function generatePdf(htmlContent, data) {

    const itemsHtml = `
    <div>
        <table style="width:100%; border-collapse: collapse;">
            <thead>
                <tr>
                    <th>Description</th>
                    <th>Item Code</th>
                    <th>Contents</th>
                    <th>Loaded On</th>
                    <th>Employee</th>
                    <th>Customer</th>
                </tr>
            </thead>
            <tbody>
                ${data.storage?.events.map(item => `
                    <tr>
                        <td>${item.description}</td>
                        <td>${item.itemCode}</td>
                        <td>${item.contents}m³</td>
                        <td>${new Date(item.loadedOn).toLocaleDateString()}</td>
                        <td>${item.loadedByEmployee?.username || ''}</td>
                        <td>${item.loadedByCustomer ? 'Yes' : 'No'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>
    `;

    const actionHtml = `
    <div>
        <table style="width:100%; border-collapse: collapse;">
            <thead>
                <tr>
                    <th>Description</th>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Quantity</th>
                </tr>
            </thead>
            <tbody>
                ${data.storage?.costAction.map(item => `
                    <tr>
                        <td>${item?.description}</td>
                        <td>${new Date(item?.actionDate).toLocaleDateString()}</td>
                        <td>${item?.price} $</td>
                        <td>${item?.quantity}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>
    `;

    const populatedHtml = htmlContent.replace(
        /{{\s*(\w+(\.\w+)*)\s*}}/g,
        (match, key) => {

            if (key === "items") return itemsHtml;
            if (key === "actions") return actionHtml;

            return key
                .split(".")
                .reduce((obj, prop) => obj && obj[prop], data) || "";
        }
    );

    const options = {
        format: "A4",
        border: {
            top: "15mm",
            right: "15mm",
            bottom: "15mm",
            left: "15mm",
        },
    };

    return new Promise((resolve, reject) => {
        pdf.create(populatedHtml, options).toBuffer((err, buffer) => {
            if (err) {
                reject(err);
            } else {
                resolve(buffer);
            }
        });
    });
}