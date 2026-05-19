// const multer = require('multer');         // existing

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, 'uploads');
//   },
//   filename: (req, file, cb) => {
//     cb(null, Date.now() + '-' + file.originalname);
//   }
// });

// const upload = multer({
//   storage: storage,
//   limits: { fileSize: 10 * 1024 * 1024 }  // 10 MB in bytes
// });
// // const upload  = multer({ storage: storage });

// module.exports = upload;


const multer = require("multer");
const multerS3 = require("multer-s3");
const { S3Client } = require("@aws-sdk/client-s3");

// Cloudflare R2 client
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID.trim(),
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY.trim(),
  },
});

// Multer + Cloudflare R2 storage
const storage = multerS3({
  s3,
  bucket: process.env.R2_BUCKET_NAME,

  contentType: multerS3.AUTO_CONTENT_TYPE,

  metadata: function (req, file, cb) {
    cb(null, {
      fieldName: file.fieldname,
    });
  },

  key: function (req, file, cb) {
    const fileName = `uploads/${Date.now()}-${file.originalname}`;
    cb(null, fileName);
  },
});

// Upload instance
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

module.exports = upload;

//another updated code 

// const multer = require('multer');
// const path = require('path');

// // Configure multer to use disk storage with more control over filename and destination
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, 'uploads/');  // Use the 'uploads' folder in your root directory
//   },
//   filename: (req, file, cb) => {
//     cb(null, Date.now() + path.extname(file.originalname));  // Ensures the original file extension is kept
//   }
// });

// const upload = multer({
//   storage: storage,  // Use custom storage configuration
//   fileFilter: (req, file, cb) => {
//     if (file.mimetype === 'image/svg+xml') {
//       cb(null, true);  // Accept SVG files
//     } else {
//       cb(new Error('Only SVG files are allowed!'));  // Reject non-SVG files
//     }
//   }
// });

// module.exports = upload;
