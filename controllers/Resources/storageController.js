const Storage = require('../../models/Resources/storageModel');
const mongoose = require('mongoose');
const CompanyDetails = require("../../models/companyModel");
const EmailTemplate = require('../../models/reporting');
const financial = require('../../models/documentTemplateModel');
const AppSettings = require('../../models/appSettingModel');
const { renderEmailTemplate } = require('../../utils/emailTemplateUtil');

const nodemailer = require('nodemailer');

const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");
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

        if (Array.isArray(filteredBody.events)) {
            filteredBody.events = filteredBody.events.map(event => ({
                ...event,
                storageLocation: event.storageLocation || null,
                loadedByEmployee: event.loadedByEmployee || null,
                ReleasedByEmployee: event.ReleasedByEmployee || null,
                loadedOn: event.loadedOn || null,
                ReleasedOn: event.ReleasedOn || null
            }));
        }

        if (Array.isArray(filteredBody.costAction)) {
            filteredBody.costAction = filteredBody.costAction.filter(
                (action) => action && typeof action === 'object' && !Array.isArray(action) && (action.description || action.price !== undefined || action.quantity !== undefined || action._id)
            );
        }

        const updatedStorage = await Storage.findByIdAndUpdate(
            id,
            filteredBody,
            {
                returnDocument: "after"
            }
        );
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

        // Clean up any corrupted costAction entries in existing storage document
        if (Array.isArray(storage.costAction)) {
            storage.costAction = storage.costAction.filter(
                (action) => action && typeof action === 'object' && !Array.isArray(action) && (action.description || action.price !== undefined || action.quantity !== undefined || action._id)
            );
        } else {
            storage.costAction = [];
        }

        // Add new valid costAction if provided
        if (costAction) {
            const actionsToAdd = Array.isArray(costAction) ? costAction : [costAction];
            actionsToAdd.forEach((action) => {
                if (action && typeof action === 'object' && !Array.isArray(action)) {
                    if (action.description || action.price !== undefined || action.quantity !== undefined || action.actionDate) {
                        storage.costAction.push(action);
                    }
                }
            });
        }

        if (Array.isArray(events)) {
            storage.events = events.map(event => ({
                ...event,
                storageLocation: event.storageLocation || null,
                loadedByEmployee: event.loadedByEmployee || null,
                ReleasedByEmployee: event.ReleasedByEmployee || null,
                loadedOn: event.loadedOn || null,
                ReleasedOn: event.ReleasedOn || null
            }));
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
        const fallbackCompany = {
            companyName: 'Universal Movers B.V.',
            companyAddress: 'Starterspand, H.J.E. Wenckebachweg 53-M',
            companyState: 'Amsterdam',
            companyCountry: 'Netherlands',
            companyEmail: 'info@universalmovers.nl',
            companyPhone: '+31 20 123 4567',
            companyWebsite: 'https://universalmovers.nl',
            companyTaxNumber: 'NL861234567B01',
            companyVatNumber: 'NL861234567B01',
            companyRegNumber: '81234567',
        };
        const appSettings = await AppSettings.findOne();

        const data = {
            company: company || fallbackCompany,
            customer: storage.customer,
            storage,
            lastInvoiceDate,
            startDate: storage.invoicingStartDate?.toLocaleString(),
            endDate: new Date(lastInvoiceDate)?.toLocaleString(),
            currency: appSettings?.currency || 'EUR',
            currencySymbol: appSettings?.currencySymbol || '€',
            currencyPosition: appSettings?.currencyPosition || 'before',
            currencyDecimals: appSettings?.currencyDecimals !== undefined ? appSettings.currencyDecimals : 2,
        };

        let html = null;
        if (financialTemplate && mongoose.Types.ObjectId.isValid(financialTemplate)) {
            const emailTemplate = await financial.findById(financialTemplate);
            html = emailTemplate?.htmlContent;
        }
        if (!html) {
            const defTpl = await financial.findOne({ name: /warehouse.*storage/i }) || await financial.findOne({ type: 'invoice' });
            html = defTpl?.htmlContent || '<html><body><h1>Storage Invoice</h1>{{items}}</body></html>';
        }

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

        const appSettings = await AppSettings.findOne();

        let emailTemplate = null;
        if (emailTemplateId && mongoose.Types.ObjectId.isValid(emailTemplateId)) {
            emailTemplate = await EmailTemplate.findById(emailTemplateId);
        }
        if (!emailTemplate && appSettings?.emailTemplates?.storageInovice && mongoose.Types.ObjectId.isValid(appSettings.emailTemplates.storageInovice)) {
            emailTemplate = await EmailTemplate.findById(appSettings.emailTemplates.storageInovice);
        }
        if (!emailTemplate) {
            emailTemplate = await EmailTemplate.findOne({
                $or: [
                    { name: /storage/i },
                    { _id: '67611dd3ca48493a174f71a9' }
                ]
            }) || await EmailTemplate.findOne();
        }

        let emailHtml = emailTemplate?.htmlContent || '<div>Invoice for storage rental</div>';

        const fallbackCompany = {
            companyName: 'Universal Movers B.V.',
            companyAddress: 'Starterspand, H.J.E. Wenckebachweg 53-M',
            companyState: 'Amsterdam',
            companyCountry: 'Netherlands',
            companyEmail: 'info@universalmovers.nl',
            companyPhone: '+31 20 123 4567',
            companyWebsite: 'https://universalmovers.nl',
            companyTaxNumber: 'NL861234567B01',
            companyVatNumber: 'NL861234567B01',
            companyRegNumber: '81234567',
        };
        const data = {
            company: company || fallbackCompany,
            customer: storage.customer,
            storage: storage,
            lastInvoiceDate: lastInvoiceDate,
            currency: appSettings?.currency || 'EUR',
            currencySymbol: appSettings?.currencySymbol || '€',
            currencyPosition: appSettings?.currencyPosition || 'before',
            currencyDecimals: appSettings?.currencyDecimals !== undefined ? appSettings.currencyDecimals : 2,
        };

        let html = pdfTemplate ? pdfTemplate.htmlContent : (emailTemplate?.htmlContent || '');
        if (!html) {
            const defTpl = await financial.findOne({ name: /warehouse.*storage/i }) || await financial.findOne({ type: 'invoice' });
            html = defTpl?.htmlContent || '<html><body><h1>Storage Invoice</h1>{{items}}</body></html>';
        }

        const pdfBuffer = await generatePdf(html, data);

        emailHtml = renderEmailTemplate(emailHtml || '', {
            company,
            customer: storage.customer || {},
            storage,
            invoice: {
                total: storage.total,
                date: new Date().toLocaleDateString(),
            },
            currency: appSettings?.currency || 'EUR',
            currencySymbol: appSettings?.currencySymbol || '€',
        });

        if (!storage.customer?.email) {
            return res.status(200).send('Invoice generated. (Storage has no customer email to send to).');
        }

        if (!process.env.SMTP_USER) {
            return res.status(200).send('Invoice generated. (SMTP is not configured).');
        }

        try {
            const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST || 'smtp.gmail.com',
                port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
                secure: false,
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS,
                },
            });

            const mailOptions = {
                from: process.env.SMTP_USER,
                to: storage.customer.email,
                subject: `Invoice from ${company.companyName || 'Warehouse'} for warehouse Charges`,
                html: emailHtml,
                attachments: [{
                    filename: 'Invoice.pdf',
                    content: pdfBuffer,
                    contentType: 'application/pdf'
                }]
            };
            await transporter.sendMail(mailOptions);
            res.status(200).send('Invoice sent successfully');
        } catch (mailErr) {
            console.warn("Mail sending warning:", mailErr.message);
            res.status(200).send(`Storage finalized. Email notice: ${mailErr.message}`);
        }
    } catch (error) {
        console.error("Error generating or sending PDF:", error);
        res.status(500).send(error?.message || "Error generating or sending PDF");
    }
};

async function generatePdf(htmlContent, data) {
  const sym = data.currencySymbol || '€';
  const pos = data.currencyPosition || 'before';
  const dec = data.currencyDecimals !== undefined ? data.currencyDecimals : 2;
  const fmt = (num) => {
    const val = Number(num || 0).toFixed(dec);
    return pos === 'after' ? `${val} ${sym}` : `${sym} ${val}`;
  };

  const items = (data.invoice && data.invoice.items) || [];
  const rows = items
    .map(
      (item, idx) => {
        const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
        const qty = Number(item.quantity) || 1;
        const price = Number(item.price) || 0;
        const lineTotal = qty * price;
        const btw = item.btw !== undefined && item.btw !== null ? item.btw : 21;
        return `
        <tr style="border-bottom: 1px solid #e2e8f0; background-color: ${bg};">
          <td style="padding: 10px 12px; color: #1e293b; font-weight: 500; font-size: 13px;">
            ${item.description || 'Storage Rental'}
          </td>
          <td style="padding: 10px 10px; text-align: center; color: #475569; font-size: 13px;">
            ${qty}
          </td>
          <td style="padding: 10px 12px; text-align: right; color: #475569; font-size: 13px;">
            ${fmt(price)}
          </td>
          <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: #0f172a; font-size: 13px;">
            ${fmt(lineTotal)}
          </td>
          <td style="padding: 10px 12px; text-align: right; color: #64748b; font-size: 13px;">
            ${btw}%
          </td>
        </tr>
      `;
      }
    )
    .join("");

  const fullTableHtml = `
    <table style="width: 100%; border-collapse: collapse; margin: 18px 0; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
      <thead>
        <tr style="background-color: #f1f5f9; border-bottom: 2px solid #3c50e0; color: #0f172a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
          <th style="padding: 10px 12px; text-align: left; font-weight: 700; width: 45%;">Description</th>
          <th style="padding: 10px 10px; text-align: center; font-weight: 700; width: 12%;">Qty</th>
          <th style="padding: 10px 12px; text-align: right; font-weight: 700; width: 15%;">Unit Price</th>
          <th style="padding: 10px 12px; text-align: right; font-weight: 700; width: 15%;">Total</th>
          <th style="padding: 10px 12px; text-align: right; font-weight: 700; width: 13%;">BTW (%)</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="5" style="padding: 14px; text-align: center; color: #64748b; font-style: italic;">No items specified</td></tr>'}
      </tbody>
    </table>
  `;

  const isInsideTable = (htmlContent || '').includes('<tbody') && (
    htmlContent.includes('<tbody>{{items}}') ||
    htmlContent.includes('<tbody>\n{{items}}') ||
    htmlContent.includes('<tbody>\r\n{{items}}')
  );
  const itemsHtml = isInsideTable ? rows : fullTableHtml;

  const populatedHtml = (htmlContent || '')
    .replace(/\$\{[^}]*\}/g, '')
    .replace(
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
    const isLocal = process.env.NODE_ENV === "development" || !process.env.NODE_ENV || process.platform === "win32";

    let launchOptions;

    const resolveChromePath = () => {
      const fs = require('fs');
      const candidatePaths = [
        process.env.CHROME_BIN,
        process.env.CHROME_PATH,
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : null,
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser'
      ].filter(Boolean);

      for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
          return p;
        }
      }
      return 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
    };

    if (isLocal) {
      // Windows local Chrome
      launchOptions = {
        executablePath: resolveChromePath(),
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
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
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    const pdfData = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "15mm",
        right: "7mm",
        bottom: "15mm",
        left: "7mm",
      },
    });

    return Buffer.from(pdfData);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}