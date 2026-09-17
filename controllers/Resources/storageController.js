const Storage = require('../../models/Resources/storageModel');
const CompanyDetails = require("../../models/companyModel");
const EmailTemplate = require('../../models/reporting');
const financial = require('../../models/documentTemplateModel');
const AppSettings = require('../../models/appSettingModel');

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
        const emailTemplate = await financial.findById(financialTemplate);
        const appSettings = await AppSettings.findOne();

        const data = {
            company,
            customer: storage.customer,
            storage,
            lastInvoiceDate,
            startDate: storage.invoicingStartDate?.toLocaleString(),
            endDate: new Date(lastInvoiceDate)?.toLocaleString(),
            currency: appSettings?.currency || 'USD',
            currencySymbol: appSettings?.currencySymbol || '$',
            currencyPosition: appSettings?.currencyPosition || 'before',
            currencyDecimals: appSettings?.currencyDecimals !== undefined ? appSettings.currencyDecimals : 2,
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

        const appSettings = await AppSettings.findOne();
        const data = {
            company: company,
            customer: storage.customer,
            storage: storage,
            lastInvoiceDate: lastInvoiceDate,
            currency: appSettings?.currency || 'USD',
            currencySymbol: appSettings?.currencySymbol || '$',
            currencyPosition: appSettings?.currencyPosition || 'before',
            currencyDecimals: appSettings?.currencyDecimals !== undefined ? appSettings.currencyDecimals : 2,
        };

        let html = pdfTemplate ? pdfTemplate.htmlContent : (emailTemplate.htmlContent || '<div>Invoice</div>');

        const pdfBuffer = await generatePdf(html, data);

        emailHtml = emailHtml.replace(/{{\s*(\w+(\.\w+)*)\s*}}/g, (match, key) => {
            return key.split('.').reduce((obj, prop) => obj && obj[prop], data) || '';
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
  const sym = data.currencySymbol || '$';
  const pos = data.currencyPosition || 'before';
  const dec = data.currencyDecimals !== undefined ? data.currencyDecimals : 2;
  const fmt = (num) => {
    const val = Number(num || 0).toFixed(dec);
    return pos === 'after' ? `${val} ${sym}` : `${sym} ${val}`;
  };

  const items = (data.invoice && data.invoice.items) || [];
  const itemsHtml = `
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr>
          <th style="padding: 15px 0; width: 60%;">Description</th>
          <th style="padding: 15px 0; width: 10%;">Quantity</th>
          <th style="padding: 15px 0; width: 10%;">Price</th>
          <th style="padding: 15px 0; width: 10%;">Total</th>
          <th style="padding: 15px 0; width: 10%;">BTW (%)</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (item) => `
          <tr>
            <td style="padding:15px 0">
              ${item.description}
            </td>

            <td style="padding:15px 0">
              ${item.quantity}
            </td>

            <td style="padding:15px 0">
              ${fmt(item.price)}
            </td>

            <td style="padding:15px 0">
              ${fmt(item.quantity * item.price)}
            </td>

            <td style="padding:15px 0">
              ${item.btw}%
            </td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;

  const populatedHtml = (htmlContent || "").replace(
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

    if (isLocal) {
      // Windows local Chrome
      launchOptions = {
        executablePath:
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
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