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


const multer = require('multer');
const AWS = require('aws-sdk');
const multerS3 = require('multer-s3');

// Set up AWS S3 configuration
const s3 = new AWS.S3({
  accessKeyId: 'AKIAQXUIXOEJW7GZNDWK', // Ensure these are set in your environment or config
  secretAccessKey: 'xnxiywexRkCoGTtyqGF8bmYCkSDmlOiK8nqu6Xa/',
  region: 'eu-north-1', // e.g. 'us-east-1'
});

// Set up multer to use S3 storage
const storage = multerS3({
  s3: s3,
  bucket: 'osnl-videos', // Replace with your actual S3 bucket name
  acl: 'public-read', // This can be adjusted to your needs (e.g., private, public-read)
  metadata: function (req, file, cb) {
    cb(null, { fieldName: file.fieldname });
  },
  key: function (req, file, cb) {
    // Generate a unique file name based on the current timestamp
    cb(null, Date.now() + '-' + file.originalname);
  }
});

// Create multer upload instance with the S3 storage
const upload = multer({ storage: storage });

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
