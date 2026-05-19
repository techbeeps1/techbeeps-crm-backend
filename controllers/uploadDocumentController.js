const Document = require("../models/document");
const { S3Client, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// Cloudflare R2 Client
const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID.trim(),
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY.trim(),
  },
});


// Upload Document
exports.uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: false,
        msg: "No file uploaded",
        data: null,
      });
    }

    let document = new Document();

    if (req.body.customer) {
      document.customer = req.body.customer;
    }

    if (req.body.email && req.body.isEmployee) {
      document.email = req.body.email;
      document.isEmployee = req.body.isEmployee;
    }

    // Public file path from R2
    document.path = `${process.env.R2_PUBLIC_URL}/${req.file.key}`;

    // File key stored in DB
    document.name = req.file.key;

    document.fileName = req.body.fileName;
    document.documentType = req.body.documentType;

    const data = await document.save();

    return res.status(200).json({
      status: true,
      msg: "File uploaded successfully",
      data,
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      status: false,
      msg: "An error occurred while uploading the file",
      data: null,
    });
  }
};


// Document List
exports.documentList = async (req, res) => {
  try {
    const { customer, email, isEmployee } = req.query;

    const filter = customer
      ? { customer }
      : { email, isEmployee };

    const documentList = await Document.find(filter);

    res.json({
      documentList,
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Server error",
    });
  }
};


// Download File
exports.downloadFile = async (req, res) => {
  const { filename } = req.params;

  try {
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: filename,
    });

    // Signed URL valid for 60 seconds
    const signedUrl = await getSignedUrl(
      s3Client,
      command,
      { expiresIn: 60 }
    );

    return res.redirect(signedUrl);

  } catch (error) {
    console.error("Error generating signed URL:", error);

    return res.status(500).json({
      message: "Error downloading file",
      error: error.message,
    });
  }
};


// Delete Document
exports.deleteDocument = async (req, res) => {
  const documentId = req.params.id;

  try {
    const document = await Document.findById(documentId);

    if (!document) {
      return res.status(404).json({
        message: "Document not found",
      });
    }

    // Delete file from Cloudflare R2
    if (document.name) {
      const command = new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: document.name,
      });

      await s3Client.send(command);
    }

    // Delete MongoDB record
    await Document.findByIdAndDelete(documentId);

    return res.status(200).json({
      message: "Document deleted successfully",
    });

  } catch (err) {
    console.error("Error deleting document:", err);

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};