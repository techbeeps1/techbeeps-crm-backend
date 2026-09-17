const express = require("express");
const router = express.Router();
const uploadDocumentController = require("../controllers/uploadDocumentController");
const Document = require("../models/document");
// const upload = require ('../view/multerFileUpload');

// router.route('/uploadDocument').post(upload.single('file'), uploadDocumentController.uploadDocument)
const { Upload } = require("@aws-sdk/lib-storage");
const { S3Client } = require("@aws-sdk/client-s3");

// S3 v3 client
const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// Multer memory storage with 10MB file size limit
const multer = require("multer");
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024; // 10 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
  },
});

// Middleware wrapper to handle Multer errors (e.g. LIMIT_FILE_SIZE) cleanly
const handleMulterUpload = (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          status: false,
          msg: `File size exceeds the maximum allowed limit of ${MAX_FILE_SIZE_MB} MB. Please select a smaller file.`,
        });
      }
      return res.status(400).json({ status: false, msg: err.message });
    } else if (err) {
      return res.status(400).json({ status: false, msg: err.message });
    }
    next();
  });
};

router.post("/uploadDocument", handleMulterUpload, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: false, msg: "No file uploaded" });
    }

    if (req.file.size > MAX_FILE_SIZE_BYTES) {
      return res.status(400).json({
        status: false,
        msg: `File size exceeds the maximum allowed limit of ${MAX_FILE_SIZE_MB} MB`,
      });
    }

   const fileName = `documents/${Date.now()}-${req.file.originalname}`;

const uploadFile = new Upload({
  client: s3Client,
  params: {
    Bucket: process.env.R2_BUCKET_NAME,
    Key: fileName,
    Body: req.file.buffer,
    ContentType: req.file.mimetype,
  },
});

      const result = await uploadFile.done();

    let document = new Document();
    if (req.body.customer) {
      document.customer = req.body.customer; // Mongoose will cast it if it's a valid ID
    }
    if (req.body.email && req.body.isEmployee) {
      document.email = req.body.email; 
      document.isEmployee = req.body.isEmployee;
    }
    const fileUrl = `${process.env.R2_PUBLIC_URL}/${result.Key}`;

    document.path = fileUrl; // URL or S3 URI
    document.name = result.Key; // S3 object key (file name in bucket)
    document.fileName = req.body.fileName;
    document.documentType = req.body.documentType;

    const data = await document.save();
    // Save result.Location or result.Key to DB if needed
    return res.status(200).json({
      status: true,
      msg: "File uploaded to S3 successfully",
      data: result,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      status: false,
      msg: "Upload failed",
    });
  }
});

router.get("/documentList", uploadDocumentController.documentList);
router.delete("/documents/:id", uploadDocumentController.deleteDocument);
router.get("/document/:filename", uploadDocumentController.downloadFile);

module.exports = router;
