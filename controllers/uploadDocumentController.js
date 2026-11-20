const Document = require("../models/document");
const { S3Client, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// Cloudflare R2 Client (Private Bucket configuration)
const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined,
  forcePathStyle: true,
  credentials: {
    accessKeyId: (process.env.R2_ACCESS_KEY_ID || '').trim(),
    secretAccessKey: (process.env.R2_SECRET_ACCESS_KEY || '').trim(),
  },
});

// Upload Document (Store private key rather than leaking raw public URLs)
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

    // UM3-037: Store private object key, avoiding raw public bucket exposure
    document.path = req.file.key;
    document.name = req.file.key;

    document.fileName = req.body.fileName;
    document.documentType = req.body.documentType;

    const data = await document.save();

    return res.status(200).json({
      status: true,
      msg: "File uploaded successfully (secured private storage)",
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


// Document List with Presigned URLs for authenticated private access (UM3-037)
exports.documentList = async (req, res) => {
  try {
    const { customer, email, isEmployee } = req.query;

    const filter = customer
      ? { customer }
      : { email, isEmployee };

    const rawDocs = await Document.find(filter).lean();

    const expiresIn = parseInt(process.env.R2_PRESIGNED_EXPIRES_IN, 10) || 900; // 15 mins default
    const isR2Configured = Boolean(process.env.R2_BUCKET_NAME && process.env.R2_ACCESS_KEY_ID);

    const documentList = await Promise.all(
      rawDocs.map(async (doc) => {
        const key = doc.name || (doc.path && !doc.path.startsWith('http') ? doc.path : (doc.path ? doc.path.split('/').pop() : null));
        let presignedUrl = null;
        if (key && isR2Configured) {
          try {
            const command = new GetObjectCommand({
              Bucket: process.env.R2_BUCKET_NAME,
              Key: key,
            });
            presignedUrl = await getSignedUrl(s3Client, command, { expiresIn });
          } catch (e) {
            // Ignore signing error for individual document
          }
        }
        return {
          ...doc,
          presignedUrl: presignedUrl || doc.path,
          isPrivate: true,
        };
      })
    );

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

// Generates an on-demand presigned URL for an authenticated document request (UM3-037)
exports.getPresignedUrl = async (req, res) => {
  const { id } = req.params;
  try {
    const document = await Document.findById(id);
    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    const key = document.name || (document.path && !document.path.startsWith('http') ? document.path : (document.path ? document.path.split('/').pop() : null));
    if (!key) {
      return res.status(404).json({ message: "Document storage key not found" });
    }

    const expiresIn = parseInt(process.env.R2_PRESIGNED_EXPIRES_IN, 10) || 900;
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn });

    return res.status(200).json({
      status: true,
      presignedUrl,
      expiresIn,
      fileName: document.fileName,
      documentType: document.documentType,
    });
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    return res.status(500).json({
      message: "Error generating presigned URL",
      error: error.message,
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