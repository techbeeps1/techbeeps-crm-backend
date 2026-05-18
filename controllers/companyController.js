const multer = require("multer");
const path = require("path");
const fs = require("fs");
const CompanyDetails = require("../models/companyModel");
const { Blob } = require("@vercel/blob");
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, "uploads/");
//   },
//   filename: (req, file, cb) => {
//     cb(null, "logo.png");
//   },
// });
// const upload = multer({
//   storage: storage,
//   fileFilter: (req, file, cb) => {
//     if (file.mimetype !== "image/png") {
//       return cb(new Error("Only png files are allowed!"));
//     }
//     cb(null, true);
//   },
// });

// exports.uploadLogo = (req, res) => {
//     upload.single('logo')(req, res, (err) => {
//         if (err) {
//             return res.status(400).json({ error: err.message });
//         }
//         res.status(200).json({ message: 'Logo uploaded successfully!', logoUrl: `/uploads/logo.png` });
//     });
// };

// Configure AWS S3
const s3Client = new S3Client({
  region: "eu-north-1", 
  credentials: {
    accessKeyId: "AKIAQXUIXOEJW7GZNDWK",
    secretAccessKey: "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",
  },
});

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

//vercel-upload
// exports.uploadLogo = async(req, res) => {
//   // Use the Multer upload middleware to handle the file upload
//   upload.single('logo')(req, res, async (err) => {
//     if (err) {
//       return res.status(500).json({ message: 'Error processing the file' });
//     }

//     if (!req.file) {
//       return res.status(400).json({ message: 'No file uploaded' });
//     }

//     // Ensure the uploaded file is a PNG
//     if (req.file.mimetype !== 'image/png') {
//       return res.status(400).json({ message: 'Please upload a PNG file' });
//     }

//     try {
//       // Create a Vercel Blob from the uploaded file buffer
//       const blob = await Blob.create(req.file.buffer);

//       // Get the public URL of the uploaded file
//       const fileUrl = blob.url();

//       // Respond with the URL of the uploaded file
//       return res.status(200).json({ message: 'File uploaded successfully', fileUrl });
//     } catch (error) {
//       console.error(error);
//       return res.status(500).json({ message: 'Error uploading file' });
//     }
//   });
// };

exports.uploadLogo = async (req, res) => {
  upload.single("logo")(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    try {
      const uploadParams = {
        Bucket: 'osnl-videos', 
        Key: `logos/${Date.now().toString()}_${req.file.originalname}`,
        Body: req.file.buffer,
        ContentType: req.file.mimetype, 
        // ACL: 'public-read', 
      };
      const command = new PutObjectCommand(uploadParams);
      const data = await s3Client.send(command);
      console.log("data",data);
      const fileUrl = `https://${'osnl-videos'}.s3.${'eu-north-1'}.amazonaws.com/${uploadParams.Key}`;
      return res.status(200).json({ message: 'File uploaded successfully', fileUrl });
  
    } catch (error) {
      console.error('Error uploading file to S3', error);
      return res.status(500).json({ message: 'Error uploading file to S3', error: error.message });
    }
  });
};

// Get Company Details
exports.getCompanyDetails = async (req, res) => {
  try {
    const company = await CompanyDetails.findOne();
    res.status(200).json(company);
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
      });
    }
    await company.save();
    res.status(200).json({ message: "Company details saved successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};
