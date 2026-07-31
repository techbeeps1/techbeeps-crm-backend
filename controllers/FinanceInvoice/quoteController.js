const { ObjectId } = require("mongodb");
const moment = require('moment');
const SendQuote = require('../../models/FinanceInvoice/sendQuote');
//const AcceptQuote = require('../../models/FinanceInvoice/acceptQuote');
//const RejectQuote = require('../../models/FinanceInvoice/rejectQuote');
const Finance = require('../../models/finance');
//const InvoiceQuote = require("../../models/FinanceInvoice/invoiceQuote");
//const CancelQuote = require("../../models/FinanceInvoice/cancelQuote");
//const JobLinkedQuote = require("../../models/FinanceInvoice/linkToJob");

// exports.sendQuote = async (req, res) => {
//     try {
//         let sendQuote = new SendQuote();
//         sendQuote.financeId = new ObjectId(req.body.financeId);
//         sendQuote.expirationDate = req.body.expirationDate;
//         sendQuote.additionalEmail = req.body.additionalEmail;

//         const currentYear = moment().format('YYYY');
//         const lastQuote = await Finance.aggregate([
//           {
//             $match: {
//               quotationNumber: { $exists: true, $ne: null }
//             }
//           },
//           {
//             $group: {
//               _id: null,
//               maxNumber: {
//                 $max: {
//                   $toInt: {
//                     $substr: ["$quotationNumber", 5, -1] // Extract numeric part of the quotationNumber
//                   }
//                 }
//               }
//             }
//           }
//         ]);
        
//         const lastNumber = (lastQuote.length > 0) ? lastQuote[0].maxNumber : 0;
//         const nextNumber = lastNumber + 1;
//         const quotationNumber = `${currentYear}-${nextNumber.toString().padStart(5, '0')}`;
        
//         await Finance.findByIdAndUpdate(sendQuote.financeId, {
//           $set: {
//             quoteStatus: 'sent',
//             date: req.body.expirationDate,
//             quotationNumber: quotationNumber,
//           }
//         });
        
//         await sendQuote.save().then((result) => {
//           res.status(200).json({
//             msg: "Save Successfully",
//             data: result,
//           });
//         });
//       } catch (err) {
//         console.log(err);
//       }
// };

// exports.acceptQuote = async (req, res) => {
//   try {
//       let acceptQuote = new AcceptQuote();
//       console.log("REQ.BODY",req.body)
//       acceptQuote.financeId = new ObjectId(req.body.financeId);
//       await Finance.findByIdAndUpdate(acceptQuote.financeId, {
//         $set: {
//           quoteStatus: 'accepted',
//         }
//       });
      
//       await acceptQuote.save().then((result) => {
//         res.status(200).json({
//           msg: "Save Successfully",
//           data: result,
//         });
//       });
//     } catch (err) {
//       console.log(err);
//     }
// };

// exports.rejectQuote = async (req, res) => {
//   try {
//       let rejectQuote = new RejectQuote();
//       rejectQuote.financeId = new ObjectId(req.body.financeId);
//       rejectQuote.reason = req.body.reason;
//       rejectQuote.cancelProject = req.body.cancelProject;
//       await Finance.findByIdAndUpdate(rejectQuote.financeId, {
//         $set: {
//           quoteStatus: 'declined',
//         }
//       });
      
//       await rejectQuote.save().then((result) => {
//         res.status(200).json({
//           msg: "Save Successfully",
//           data: result,
//         });
//       });
//     } catch (err) {
//       console.log(err);
//     }
// };

// exports.invoiceQuote = async (req, res) => {
//   try {
//     console.log("hello",req.body)
//       let invoiceQuote = new InvoiceQuote();
//       invoiceQuote.financeId = new ObjectId(req.body && req.body.financeId);
//       invoiceQuote.financialTemplate = req.body.financialTemplate;
//       await Finance.findByIdAndUpdate(invoiceQuote.financeId, {
//         $set: {
//           quoteStatus: 'Invoiced',
//         }
//       });
      
//       await invoiceQuote.save().then((result) => {
//         res.status(200).json({
//           msg: "Save Successfully",
//           data: result,
//         });
//       });
//     } catch (err) {
//       console.log(err);
//     }
// };

// exports.cancelQuote = async (req, res) => {
//   try {
//       let cancelQuote = new CancelQuote();
//       cancelQuote.financeId = new ObjectId(req.body.financeId);
//       await Finance.findByIdAndUpdate(cancelQuote.financeId, {
//         $set: {
//           quoteStatus: 'Cancelled',
//         }
//       });
      
//       await cancelQuote.save().then((result) => {
//         res.status(200).json({
//           msg: "Save Successfully",
//           data: result,
//         });
//       });
//     } catch (err) {
//       console.log(err);
//     }
// };

// exports.linkToJob = async (req, res) => {
//   try {
//       let jobLinkedQuote = new JobLinkedQuote();
//       jobLinkedQuote.financeId = new ObjectId(req.body.financeId);
//       jobLinkedQuote.movingJob = req.body.movingJob;
//       await Finance.findByIdAndUpdate(jobLinkedQuote.financeId, {
//         $set: {
//           movingJob: req.body.movingJob,
//         }
//       });
      
//       await jobLinkedQuote.save().then((result) => {
//         res.status(200).json({
//           msg: "Save Successfully",
//           data: result,
//         });
//       });
//     } catch (err) {
//       console.log(err);
//     }
// };

// exports.rejectAndCreateNewVersionOfQuote = async (req, res) => {
//   try {
//     const checkId = await Finance.findById({ _id: req.body._id });
//     if (checkId) {
//       const editdata = await Finance.findByIdAndUpdate(
//         req.body._id,
//         req.body,
//         { new: true },
//         {$set: {
//           quoteStatus: 'declined',
//         }}
//       );
//       if (editdata) {
//         res.status(200).send({
//           msg: "edit data is Successfully",
//           data: editdata,
//         });
//       }
//     }
//   } catch (err) {
//     console.log(err);
//   }
// };