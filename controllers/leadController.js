const Lead = require("../models/lead");

exports.createLead = async (req, res) => {
  let lead = new Lead(req.body);
  if (lead.selectedFile) {
    if (typeof req.body.selectedFile === "string") {
      lead.selectedFile = req.body.selectedFile;
    } else {
      if (typeof req.body.selectedFile !== "string") {
        const filePath =
          "C:UsersPcPicturesSaved Pictures" + req.body.selectedFile.name;
        lead.selectedFile = filePath;
      } else {
        lead.selectedFile = null;
      }
    }
  }
  const doc = await lead.save();

  console.log("Lead data", doc);
  res.json(doc);
};

exports.leadList = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1; 
    const pageSize = parseInt(req.query.pageSize) || 5; 
    const sortField = 'firstName';
    const pipeline = [
      {
        $sort: { [sortField]: 1 },
      },
      {
        $skip: (page - 1) * pageSize,
      },
      { 
        $limit: pageSize,
      },
    ];
    const leadList = await Lead.aggregate(pipeline);
    const totalLeads = await Lead.countDocuments();
  res.json({
    totalLeads:totalLeads,
    currentPage: page,
    totalPages: Math.ceil(totalLeads / pageSize),
    leads: leadList,
  });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.leadCount = async (req, res) => {
  try {
    const totalLeads = await Lead.countDocuments();
    res.json({ totalLeads });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.searchedLead = async (req, res) => {
  const searchTerm = req.query.searchTerm.toLowerCase();
  const leadList = await Lead.find();

  const searchedLead = leadList.filter((leadData) => {
    const firstName = leadData.firstName.toLowerCase();
    const lastName = leadData.lastName.toLowerCase();

    return firstName.includes(searchTerm) || lastName.includes(searchTerm) ;
  });
  res.json(searchedLead); 
};
