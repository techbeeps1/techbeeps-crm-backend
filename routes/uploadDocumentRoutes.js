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

// Multer memory storage to access file.buffer
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

router.post("/uploadDocument", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ msg: "No file uploaded" });
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
    document.path = result.Location || `s3://${result.Bucket}/${result.Key}`; // URL or S3 URI
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
