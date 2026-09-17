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

      // If R2 credentials exist, also upload to Cloudflare R2
      if (s3Client && process.env.R2_BUCKET_NAME) {
        try {
          const r2FileName = `logos/${Date.now()}_${req.file.originalname}`;
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
    const company = await CompanyDetails.findOne();
    res.status(200).json(company || {});
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
      logoUrl,
    } = req.body;

    let company = await CompanyDetails.findOne();
    if (company) {
      company.companyName = companyName;
      company.companyAddress = companyAddress;
      company.companyState = companyState;
      company.companyCountry = companyCountry;
      company.companyEmail = companyEmail;
      company.companyPhone = companyPhone;
      company.companyWebsite = companyWebsite;
      company.companyTaxNumber = companyTaxNumber;
      company.companyVatNumber = companyVatNumber;
      company.companyRegNumber = companyRegNumber;
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
        companyTaxNumber,
        companyVatNumber,
        companyRegNumber,
        logoUrl,
      });
    }
    await company.save();
    res.status(200).json({ message: "Company details saved successfully", company });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};
