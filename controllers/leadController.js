const mongoose = require('mongoose');
const Lead = require("../models/lead");
const Customer = require("../models/customer");
const Address = require('../models/addressModel')

exports.createLead = async (req, res) => {
  try {
    const { _id, ...leadData } = req.body;

    // Only update if a valid ObjectId is explicitly provided
    if (_id && mongoose.Types.ObjectId.isValid(_id)) {
      const updatedLead = await Lead.findByIdAndUpdate(_id, leadData, { new: true });
      if (updatedLead) {
        return res.json({
          success: true,
          message: "Lead updated successfully",
          data: updatedLead,
        });
      }
    }

    // Always create a new lead record
    const lead = new Lead(leadData);
    if (lead.firstName && lead.lastName && lead.email) {
      const doc = await lead.save();
      return res.json({
        success: true,
        message: "Lead created successfully",
        data: doc,
      });
    } else {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }
  } catch (error) {
    console.error("Error creating lead:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to create lead" });
  }
};

exports.leadList = async (req, res) => {
  try {
    const totalLeads = await Lead.countDocuments();

    // If pagination is explicitly requested
    if (req.query.page || req.query.pageSize) {
      const page = parseInt(req.query.page) || 1;
      const pageSize = parseInt(req.query.pageSize) || 10;
      const sortField = req.query.sortField || 'leadIndex';
      const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

      const leadList = await Lead.find()
        .sort({ [sortField]: sortOrder })
        .skip((page - 1) * pageSize)
        .limit(pageSize);

      return res.json({
        success: true,
        totalLeads: totalLeads,
        currentPage: page,
        totalPages: Math.ceil(totalLeads / pageSize),
        leads: leadList,
      });
    }

    // Default: return all leads sorted newest first (for frontend client-side pagination/search/stats)
    const leadList = await Lead.find().sort({ leadIndex: -1 });

    return res.json({
      success: true,
      totalLeads: totalLeads,
      currentPage: 1,
      totalPages: 1,
      leads: leadList,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.deleteLead = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedLead = await Lead.findByIdAndDelete(id);

    if (!deletedLead) {
      return res.status(404).json({
        success: false,
        message: "Lead not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Lead deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "something went wrong",
    });
  }
};

// exports.leadCount = async (req, res) => {
//   try {
//     const totalLeads = await Lead.countDocuments();
//     res.json({ totalLeads });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: "Server error" });
//   }
// };

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

exports.getLeadById = async (req, res) => {
  try {
    const { id } = req.params;

    const lead = await Lead.findById(id);

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: "Lead not found",
      });
    }

    res.status(200).json({
      success: true,
      data: lead,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "something went wrong",
    });
  }
};

exports.convertAsCustomer = async (req, res) => {
  try {
    const { _id, __v, type,status, ...data  } = req.body;
   
    const lead = await Lead.findById(_id);
    if (!lead) {
      return res.status(404).json({
        success: false,
        message: "Lead not found",
      });
    }
   const updatedLead = await Lead.findByIdAndUpdate(_id, { status: "Converted" }, { new: true,runValidators: true } );
   if (!updatedLead) {
    return res.status(404).json({
      success: false,
      message: "Failed to update lead status",
    });
  }

    const existingCustomer = await Customer.findOne({ email: data.email });
    if (existingCustomer) {
      return res.status(400).json({ error: 'Customer with this email already exists' });
    }else {
   
      const addressData = {...data,addressType:"head"} 
    const newAddress = new Address(addressData);
    const savedAddress = await newAddress.save();
    const customerData = { ...data, address: savedAddress._id,type:"Customer" }; // Add the address ID to the customer data
    const newCustomer = new Customer(customerData);
    await newCustomer.save();
    
    res.status(200).json({ success: true, message: 'customer converted', customerID: newCustomer._id });
    }
   

  } catch (error) {
    res.status(500).json({
      success: false,
      error:error,
      message: "something went wrong",
    });
  }
}


