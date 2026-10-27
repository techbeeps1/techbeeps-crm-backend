const multer = require("multer");
const path = require("path");
const fs = require("fs");
const CompanyDetails = require("../models/companyModel");
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

let s3Client = null;
if (process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY) {
  try {
    s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
  } catch (err) {
    console.error("Failed to initialize S3Client for R2:", err.message);
  }
}

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

exports.uploadLogo = async (req, res) => {
  upload.single("logo")(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    try {
      let fileUrl = '';
      const uploadsDir = path.join(__dirname, '../uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const ext = path.extname(req.file.originalname) || '.png';
      const localFileName = `logo_${Date.now()}${ext}`;
      fs.writeFileSync(path.join(uploadsDir, localFileName), req.file.buffer);
      fs.writeFileSync(path.join(uploadsDir, 'logo.png'), req.file.buffer);
      fileUrl = `/uploads/${localFileName}`;

      // If R2 credentials exist, upload to Cloudflare R2 cloud storage
      if (s3Client && process.env.R2_BUCKET_NAME) {
        try {
          const sanitizedOriginalName = (req.file.originalname || 'logo.png').replace(/[^a-zA-Z0-9._-]/g, '_');
          const r2FileName = `logos/${Date.now()}_${sanitizedOriginalName}`;
          const uploadParams = {
            Bucket: process.env.R2_BUCKET_NAME,
            Key: r2FileName,
            Body: req.file.buffer,
            ContentType: req.file.mimetype || 'image/png',
          };
          const command = new PutObjectCommand(uploadParams);
          await s3Client.send(command);
          if (process.env.R2_PUBLIC_URL) {
            fileUrl = `${process.env.R2_PUBLIC_URL}/${r2FileName}`;
          }
        } catch (r2Err) {
          console.warn("R2 upload skipped/failed, using local storage:", r2Err.message);
        }
      }

      // Save logoUrl in CompanyDetails database
      let company = await CompanyDetails.findOne();
      if (!company) {
        company = new CompanyDetails();
      }
      company.logoUrl = fileUrl;
      await company.save();

      return res.status(200).json({
        message: "Logo uploaded successfully",
        fileUrl,
        logoUrl: fileUrl,
      });
    } catch (error) {
      console.error("Error saving uploaded logo:", error);
      return res.status(500).json({
        message: "Error uploading logo",
        error: error.message,
      });
    }
  });
};

// Get Company Details
exports.getCompanyDetails = async (req, res) => {
  try {
    let company = await CompanyDetails.findOne();
    if (!company) {
      company = await CompanyDetails.create({
        companyName: 'Universal Movers B.V.',
        companyAddress: 'Starterspand, H.J.E. Wenckebachweg 53-M',
        companyState: 'Noord-Holland, Amsterdam',
        companyCountry: 'Netherlands',
        companyEmail: 'info@universalmovers.nl',
        companyPhone: '+31 20 123 4567',
        companyWebsite: 'https://universalmovers.nl',
        companyRegNumber: '81234567',
        companyVatNumber: 'NL861234567B01',
        companyTaxNumber: 'NL861234567B01',
        kvkNumber: '81234567',
        btwNumber: 'NL861234567B01',
        bankName: 'ABN AMRO Bank',
        iban: 'NL91 ABNA 0417 1643 00',
        bic: 'ABNANL2A',
        logoUrl: 'https://pub-5a1825f2dbec4d2eb0b6c533f4b0fa5f.r2.dev/logos/universal_movers_logo.png'
      });
    }
    const compObj = company.toObject ? company.toObject() : { ...company };
    compObj.kvkNumber = compObj.kvkNumber || compObj.companyRegNumber || '81234567';
    compObj.btwNumber = compObj.btwNumber || compObj.companyVatNumber || compObj.companyTaxNumber || 'NL861234567B01';
    compObj.companyRegNumber = compObj.kvkNumber;
    compObj.companyVatNumber = compObj.btwNumber;
    compObj.companyTaxNumber = compObj.btwNumber;
    compObj.bankName = compObj.bankName || 'ABN AMRO Bank';
    compObj.iban = compObj.iban || 'NL91 ABNA 0417 1643 00';
    compObj.bic = compObj.bic || 'ABNANL2A';
    res.status(200).json(compObj);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};

// Add or Update Company Details
exports.saveCompanyDetails = async (req, res) => {
  try {
    const {
      companyName,
      companyAddress,
      companyState,
      companyCountry,
      companyEmail,
      companyPhone,
      companyWebsite,
      companyTaxNumber,
      companyVatNumber,
      companyRegNumber,
      kvkNumber,
      btwNumber,
      bankName,
      iban,
      bic,
      logoUrl,
    } = req.body;

    const resolvedKvk = kvkNumber || companyRegNumber || '81234567';
    const resolvedBtw = btwNumber || companyVatNumber || companyTaxNumber || 'NL861234567B01';
    const resolvedBank = bankName || 'ABN AMRO Bank';
    const resolvedIban = iban || 'NL91 ABNA 0417 1643 00';
    const resolvedBic = bic || 'ABNANL2A';

    let company = await CompanyDetails.findOne();
    if (company) {
      company.companyName = companyName || company.companyName;
      company.companyAddress = companyAddress || company.companyAddress;
      company.companyState = companyState || company.companyState;
      company.companyCountry = companyCountry || company.companyCountry;
      company.companyEmail = companyEmail || company.companyEmail;
      company.companyPhone = companyPhone || company.companyPhone;
      company.companyWebsite = companyWebsite || company.companyWebsite;
      company.companyTaxNumber = resolvedBtw;
      company.companyVatNumber = resolvedBtw;
      company.companyRegNumber = resolvedKvk;
      company.kvkNumber = resolvedKvk;
      company.btwNumber = resolvedBtw;
      company.bankName = resolvedBank;
      company.iban = resolvedIban;
      company.bic = resolvedBic;
      if (logoUrl) company.logoUrl = logoUrl;
    } else {
      company = new CompanyDetails({
        companyName,
        companyAddress,
        companyState,
        companyCountry,
        companyEmail,
        companyPhone,
        companyWebsite,
        companyTaxNumber: resolvedBtw,
        companyVatNumber: resolvedBtw,
        companyRegNumber: resolvedKvk,
        kvkNumber: resolvedKvk,
        btwNumber: resolvedBtw,
        bankName: resolvedBank,
        iban: resolvedIban,
        bic: resolvedBic,
        logoUrl,
      });
    }
    await company.save();
    res.status(200).json({ message: "Company details saved successfully", company });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};
