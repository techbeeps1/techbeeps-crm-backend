const Document = require("../models/document");
const fs = require('fs');  // For local file system storage
const path = require('path');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const stream = require('stream');
const util = require('util');
const s3Client = new S3Client({ region: 'eu-north-1' }); // your region
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');


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
    document.customer = req.body.customer;
    document.path = req.file.path;
    document.name = req.file.filename;
    document.fileName = req.body.fileName;
    document.documentType = req.body.documentType;

    const data = await document.save();
    return res.status(200).json({
      status: true,
      msg: "File uploaded successfully",
      data: data,
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

exports.documentList = async (req, res) => {
  try {
    const { customer , email, isEmployee } = req.query; // Get the customer from the query parameters
    const filter = customer ? { customer : customer } : { email: email, isEmployee: isEmployee};
    const documentList = await Document.find(filter);
    res.json({
      documentList: documentList,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};


// exports.downloadFile = (req, res) => {
//   const { filename } = req.params; // Get filename from URL parameter
//   const filePath = path.join(__dirname, '..', 'uploads', filename); // Resolve file path
//   fs.exists(filePath, (exists) => {
//     if (!exists) {
//       return res.status(404).json({ message: 'File not found' }); // Return 404 if file does not exist
//     }
//     res.download(filePath, filename, (err) => {
//       if (err) {
//         console.error('Error sending file:', err); // Log any error
//         return res.status(500).json({ message: 'Error sending file' });
//       }
//     });
//   });
// };


exports.downloadFile = async (req, res) => {
  const { filename } = req.params;

  try {
    const command = new GetObjectCommand({
      Bucket: 'osnl-videos',
      Key: filename,
    });

    // Signed URL expires in 60 seconds
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });

    // Redirect user to S3 URL
    return res.redirect(signedUrl);

  } catch (error) {
    console.error('Error generating signed URL:', error);
    return res.status(500).json({ message: 'Error downloading file' });
  }
};

//  exports.downloadFile = async (req, res) => {
//   const { filename } = req.params;

//   try {
//     const getObjectParams = {
//       Bucket: 'osnl-videos',  // your bucket name
//       Key: filename,          // file key in S3
//     };

//     const command = new GetObjectCommand(getObjectParams);
//     const data = await s3Client.send(command);

//     // data.Body is a readable stream. We pipe it to the response.
//     res.attachment(filename);  // sets Content-Disposition header

//     // Pipe the S3 stream to response
//     data.Body.pipe(res).on('error', (err) => {
//       console.error('Error streaming file from S3:', err);
//       res.status(500).json({ message: 'Error downloading file' });
//     });

//   } catch (error) {
//     if (error.name === 'NoSuchKey') {
//       return res.status(404).json({ message: 'File not found' });
//     }
//     console.error('Error fetching file from S3:', error);
//     res.status(500).json({ message: 'Error downloading file' });
//   }
// };


exports.deleteDocument = async (req, res) => {
  const documentId = req.params.id;  // The ID of the document to be deleted

  try {
    const document = await Document.findById(documentId);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }
    if (document.path) {
      const filePath = path.join(__dirname, '..', 'uploads', document.name);  // Use document.path if it's storing the file path
      fs.access(filePath, fs.constants.F_OK, async (err) => {
        if (err) {
          console.log('File not found, skipping deletion');
        } else {
          try {
            await new Promise((resolve, reject) => {
              fs.unlink(filePath, (err) => {
                if (err) {
                  console.error('Error deleting file:', err);
                  return reject(new Error('Error deleting file'));
                }
                resolve();
              });
            });
          } catch (error) {
            console.error('Error during file deletion:', error);
          }
        }
        await Document.findByIdAndDelete(documentId);
        res.status(200).json({ message: 'Document deleted successfully' });
      });
    } else {
      await Document.findByIdAndDelete(documentId);
      res.status(200).json({ message: 'Document deleted successfully' });
    }
  } catch (err) {
    console.error('Error deleting document:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

