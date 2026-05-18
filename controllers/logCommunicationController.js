const LogCommunication = require("../models/logCommunication");
const { ObjectId } = require("mongodb");

exports.logCommunication = async (req, res) => {
  try {
    let logCommunication = new LogCommunication();
    if(req.body && req.body.logCommunicationFormData && req.body.logCommunicationFormData.customerId){
      (logCommunication.communicationType = req.body.logCommunicationFormData.communicationType),
      (logCommunication.sender = req.body.logCommunicationFormData.sender),
      (logCommunication.date = req.body.logCommunicationFormData.date),
      (logCommunication.message = req.body.logCommunicationFormData.message);
      (logCommunication.customerId = new ObjectId(req.body.logCommunicationFormData.customerId));
    }else{
      (logCommunication.communicationType = req.body.communicationType),
      (logCommunication.sender = req.body.sender),
      (logCommunication.date = req.body.date),
      (logCommunication.message = req.body.message);
      (req.body.financeId ? logCommunication.financeId = new ObjectId(req.body.financeId): logCommunication.invoiceId = new ObjectId(req.body.invoiceId));
    }

    logCommunication.save().then((result) => {
      res.status(200).json({
        msg: "Send Successfully",
        data: result,
      });
    });
  } catch (err) {
    console.log(err);
  }
};


exports.logCommunicationList = async (req, res) => {
  try {
    const customerId = new ObjectId(req.query.customerId)
    const financeId = new ObjectId(req.query.financeId)
    const invoiceId = new ObjectId(req.query.invoiceId)
    const page = parseInt(req.query.page) || 1;
    const logPageSize = parseInt(req.query.logPageSize) || 5;
    const sortField = 'sender';
    const pipeline = [
      {
       $match: {
        $or: [
          {customerId: customerId},
          {financeId: financeId},
          {invoiceId: invoiceId}
        ]
      }
      },
      {
        $sort: { [sortField]: 1 },
      },
      {
        $skip: (page - 1) * logPageSize,
      },
      {
        $limit: logPageSize,
      },
    ];

    const logCommunicationList = await LogCommunication.aggregate(pipeline);

    // Count total documents
    const totalLog = await LogCommunication.countDocuments();

    res.json({
      totalLog,
      currentCommunicationPage: page,
      totalPages: Math.ceil(totalLog / logPageSize),
      logList: logCommunicationList,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};


exports.logCommunicationCount = async (req, res) => {
  const customerId = new ObjectId(req.query.customerId);
  const financeId = new ObjectId(req.query.financeId);
  const invoiceId = new ObjectId(req.query.invoiceId);
  try {
    // Use aggregation to count total log communications
    const pipeline = [
      {
        $match: {
          $or: [
            {customerId: customerId},
            {financeId: financeId},
            {invoiceId: invoiceId}
          ]
        }
       },
      {
        $group: {
          _id: null,
          totalLog: { $sum: 1 },
        },
      },
    ];

    const result = await LogCommunication.aggregate(pipeline);

    // Extract the total count
    const totalLog = result.length > 0 ? result[0].totalLog : 0;

    res.json({ totalLog });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};
