const mongoose = require('mongoose');
const Lead = require("../models/lead");
const Customer = require("../models/customer");
const Address = require('../models/addressModel');
const { validatePhoneNumber, normalizePhoneNumber, parseDutchName } = require('../utils/phoneValidator');

function formatDutchPostcode(pc) {
  if (!pc) return '';
  const clean = String(pc).trim().toUpperCase();
  const m = clean.match(/^(\d{4})\s*([A-Z]{2})$/);
  if (m) {
    return `${m[1]} ${m[2]}`;
  }
  return clean;
}

// Helper to find matching active leads for deduplication
async function findExistingLead({ email, contact, mobile, excludeId }) {
  const normEmail = (email || '').trim().toLowerCase();
  const cleanContact = (contact ? String(contact).replace(/[\s\-\(\)\.]+/g, '') : '');
  const cleanMobile = (mobile ? String(mobile).replace(/[\s\-\(\)\.]+/g, '') : '');

  const orConditions = [];
  if (normEmail && normEmail.length > 3) {
    orConditions.push({ email: new RegExp(`^${normEmail}$`, 'i') });
  }
  if (cleanContact && cleanContact.length >= 8) {
    const suffix = cleanContact.slice(-8);
    orConditions.push({ contact: new RegExp(suffix) });
    orConditions.push({ mobile: new RegExp(suffix) });
  }
  if (cleanMobile && cleanMobile.length >= 8) {
    const suffix = cleanMobile.slice(-8);
    orConditions.push({ contact: new RegExp(suffix) });
    orConditions.push({ mobile: new RegExp(suffix) });
  }

  if (orConditions.length === 0) return null;

  const query = {
    status: { $nin: ['Converted', 'Not Interested'] },
    $or: orConditions,
  };

  if (excludeId && mongoose.Types.ObjectId.isValid(excludeId)) {
    query._id = { $ne: excludeId };
  }

  return await Lead.findOne(query).sort({ createdAt: -1 });
}

// Real-time pre-flight duplicate check endpoint for UI live feedback
exports.checkDuplicate = async (req, res) => {
  try {
    const { email, contact, mobile, excludeId } = req.query;
    const existing = await findExistingLead({ email, contact, mobile, excludeId });

    if (existing) {
      return res.status(200).json({
        exists: true,
        lead: {
          id: existing._id,
          leadIndex: existing.leadIndex,
          name: `${existing.firstName} ${existing.lastName}`.trim(),
          email: existing.email,
          contact: existing.contact || existing.mobile,
          status: existing.status,
          createdAt: existing.createdAt,
        },
        message: `Lead #${existing.leadIndex || ''} (${existing.firstName} ${existing.lastName}) already exists with matching details.`,
      });
    }

    return res.status(200).json({ exists: false, lead: null });
  } catch (err) {
    console.error('[checkDuplicate error]', err);
    return res.status(500).json({ exists: false, error: err.message });
  }
};

exports.createLead = async (req, res) => {
  try {
    const { _id, allowDuplicate, ...rawLeadData } = req.body;
    const leadData = { ...rawLeadData };

    // Parse Dutch composite names if fullName provided
    if (leadData.fullName && (!leadData.firstName || !leadData.lastName)) {
      const parsed = parseDutchName(leadData.fullName);
      if (!leadData.firstName) leadData.firstName = parsed.firstName;
      if (!leadData.lastName) leadData.lastName = parsed.surname;
    }

    if (leadData.email) {
      leadData.email = String(leadData.email).trim().toLowerCase();
    }

    if (leadData.contact) {
      leadData.contact = normalizePhoneNumber(leadData.contact);
    }
    if (leadData.mobile) {
      leadData.mobile = normalizePhoneNumber(leadData.mobile);
    }

    if (leadData.postcode) {
      leadData.postcode = formatDutchPostcode(leadData.postcode);
    }

    // Only update if a valid ObjectId is explicitly provided
    if (_id && mongoose.Types.ObjectId.isValid(_id)) {
      const updatedLead = await Lead.findByIdAndUpdate(_id, leadData, { new: true, runValidators: true });
      if (updatedLead) {
        return res.json({
          success: true,
          message: "Lead updated successfully",
          data: updatedLead,
        });
      }
    }

    // Validation for new lead creation
    if (!leadData.firstName || !leadData.lastName || !leadData.email) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields (First Name, Last Name, and Email are required)",
        error: "Missing required fields (First Name, Last Name, and Email are required)",
      });
    }

    // Deduplication gate: check if matching active lead already exists
    const overrideDuplicate = Boolean(
      allowDuplicate === true ||
      req.headers['x-allow-duplicate'] === 'true' ||
      req.headers['x-allow-duplicate'] === true
    );

    const existingLead = await findExistingLead({
      email: leadData.email,
      contact: leadData.contact,
      mobile: leadData.mobile,
    });

    if (existingLead && !overrideDuplicate) {
      const matchType = (existingLead.email && existingLead.email.toLowerCase() === leadData.email.toLowerCase())
        ? 'email'
        : 'contact number';

      return res.status(409).json({
        success: false,
        code: 'DUPLICATE_LEAD_DETECTED',
        message: `A lead already exists with this ${matchType}: #${existingLead.leadIndex || ''} ${existingLead.firstName} ${existingLead.lastName} (${existingLead.status}).`,
        error: `A lead already exists with this ${matchType}: #${existingLead.leadIndex || ''} ${existingLead.firstName} ${existingLead.lastName} (${existingLead.status}).`,
        existingLead: {
          id: existingLead._id,
          leadIndex: existingLead.leadIndex,
          name: `${existingLead.firstName} ${existingLead.lastName}`.trim(),
          email: existingLead.email,
          contact: existingLead.contact || existingLead.mobile,
          status: existingLead.status,
          createdAt: existingLead.createdAt,
        },
      });
    }

    // If duplicate override is allowed, track lineage
    if (existingLead && overrideDuplicate) {
      leadData.duplicateOf = existingLead._id;
      try {
        await Lead.findByIdAndUpdate(existingLead._id, {
          $inc: { inquiryCount: 1 },
          $push: {
            duplicateInquiries: {
              receivedAt: new Date(),
              email: leadData.email,
              contact: leadData.contact || leadData.mobile,
              notes: leadData.notes || 'Additional inquiry submitted',
            },
          },
        });
      } catch (e) {
        // Non-blocking inquiry log update
      }
    }

    leadData.source = leadData.source || 'Manual';

    // Create and save new lead
    const lead = new Lead(leadData);
    const doc = await lead.save();

    return res.status(201).json({
      success: true,
      message: "Lead created successfully",
      data: doc,
      lead: doc,
    });
  } catch (error) {
    console.error("Error creating lead:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create lead",
      error: error.message || "Failed to create lead",
    });
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

    // Default: return all leads sorted newest first
    const leadList = await Lead.find().sort({ leadIndex: -1, createdAt: -1 });

    return res.json({
      success: true,
      totalLeads: totalLeads,
      currentPage: 1,
      totalPages: 1,
      leads: leadList,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error', error: 'Server error' });
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
        error: "Lead not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Lead deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

exports.searchedLead = async (req, res) => {
  try {
    const rawTerm = req.query.searchTerm || req.query.q || '';
    const searchTerm = String(rawTerm).trim().toLowerCase();
    const cleanSearchNoSpace = searchTerm.replace(/[\s\-\(\)\.]+/g, '');
    const leadList = await Lead.find().sort({ leadIndex: -1, createdAt: -1 });

    if (!searchTerm) {
      return res.json(leadList);
    }

    const searchedLead = leadList.filter((leadData) => {
      const firstName = (leadData.firstName || '').toLowerCase();
      const lastName = (leadData.lastName || '').toLowerCase();
      const fullName = `${firstName} ${lastName}`.trim();
      const email = (leadData.email || '').toLowerCase();
      const city = (leadData.city || '').toLowerCase();
      const postcode = (leadData.postcode || '').toLowerCase().replace(/\s+/g, '');
      const leadIndexStr = String(leadData.leadIndex || '');
      const contact = (leadData.contact ? String(leadData.contact) : '').replace(/[\s\-\(\)\.]+/g, '');
      const mobile = (leadData.mobile ? String(leadData.mobile) : '').replace(/[\s\-\(\)\.]+/g, '');

      return (
        firstName.includes(searchTerm) ||
        lastName.includes(searchTerm) ||
        fullName.includes(searchTerm) ||
        email.includes(searchTerm) ||
        city.includes(searchTerm) ||
        postcode.includes(cleanSearchNoSpace.toLowerCase()) ||
        leadIndexStr === searchTerm ||
        (cleanSearchNoSpace.length > 0 && contact.includes(cleanSearchNoSpace)) ||
        (cleanSearchNoSpace.length > 0 && mobile.includes(cleanSearchNoSpace))
      );
    });
    return res.json(searchedLead);
  } catch (error) {
    console.error('Error in searchedLead:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.getLeadById = async (req, res) => {
  try {
    const { id } = req.params;
    const lead = await Lead.findById(id);

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: "Lead not found",
        error: "Lead not found",
      });
    }

    // Check if matching customer already exists by email or contact number
    let existingCustomer = null;
    const leadEmail = (lead.email || '').trim().toLowerCase();
    if (leadEmail && leadEmail.length > 3) {
      existingCustomer = await Customer.findOne({ email: new RegExp(`^${leadEmail}$`, 'i') });
    }
    if (!existingCustomer && (lead.contact || lead.mobile)) {
      const cleanContact = String(lead.contact || lead.mobile).replace(/[\s\-\(\)\.]+/g, '');
      if (cleanContact.length >= 8) {
        const suffix = cleanContact.slice(-8);
        existingCustomer = await Customer.findOne({
          $or: [{ contact: new RegExp(suffix) }, { mobile: new RegExp(suffix) }]
        });
      }
    }

    const leadObj = lead.toObject();
    if (existingCustomer) {
      leadObj.existingCustomer = {
        _id: existingCustomer._id,
        id: existingCustomer._id,
        customerIndex: existingCustomer.customerIndex,
        name: `${existingCustomer.firstName || ''} ${existingCustomer.lastName || ''}`.trim(),
        email: existingCustomer.email,
        contact: existingCustomer.contact || existingCustomer.mobile,
      };
    } else {
      leadObj.existingCustomer = null;
    }

    return res.status(200).json({
      success: true,
      data: leadObj,
      lead: leadObj,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

exports.linkLeadToCustomer = async (req, res) => {
  try {
    const { leadId, customerId } = req.body;
    const lead = await Lead.findById(leadId);
    if (!lead) {
      return res.status(404).json({ success: false, message: "Lead not found", error: "Lead not found" });
    }

    let customer = null;
    if (customerId) {
      customer = await Customer.findById(customerId);
    } else if (lead.email) {
      customer = await Customer.findOne({ email: new RegExp(`^${lead.email.trim()}$`, 'i') });
    }

    if (!customer) {
      return res.status(404).json({ success: false, message: "Matching customer not found", error: "Matching customer not found" });
    }

    lead.status = "Converted";
    lead.convertedCustomer = customer._id;
    await lead.save();

    return res.status(200).json({
      success: true,
      message: `Lead linked to Customer #${customer.customerIndex || ''} (${customer.firstName} ${customer.lastName})`,
      lead,
      customer,
    });
  } catch (err) {
    console.error('[linkLeadToCustomer error]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

exports.convertAsCustomer = async (req, res) => {
  try {
    const { _id, __v, type, status, ...data } = req.body;

    const lead = await Lead.findById(_id);
    if (!lead) {
      return res.status(404).json({
        success: false,
        message: "Lead not found",
        error: "Lead not found",
      });
    }

    // Atomic Guard: Check if Customer with this email already exists BEFORE updating lead
    const targetEmail = (data.email || lead.email || '').trim().toLowerCase();
    const existingCustomer = await Customer.findOne({ email: targetEmail });
    if (existingCustomer) {
      return res.status(400).json({
        success: false,
        error: 'Customer with this email already exists',
        message: 'Customer with this email already exists',
        existingCustomerId: existingCustomer._id,
      });
    }

    // Create Head Address record
    const addressData = {
      ...data,
      addressType: "head",
      city: data.city || lead.city,
      postcode: data.postcode || lead.postcode,
      street: data.street || lead.street,
      houseNumber: data.houseNumber || lead.houseNumber,
    };
    const newAddress = new Address(addressData);
    const savedAddress = await newAddress.save();

    // Create Customer record
    const customerData = {
      ...data,
      firstName: data.firstName || lead.firstName,
      lastName: data.lastName || lead.lastName,
      email: targetEmail,
      address: savedAddress._id,
      type: "Customer",
    };

    if (customerData.contact || lead.contact) {
      customerData.contact = normalizePhoneNumber(customerData.contact || lead.contact);
    }
    if (customerData.mobile || lead.mobile) {
      customerData.mobile = normalizePhoneNumber(customerData.mobile || lead.mobile);
    }

    const newCustomer = new Customer(customerData);
    await newCustomer.save();

    // Now safely transition lead status to Converted
    const updatedLead = await Lead.findByIdAndUpdate(
      _id,
      {
        status: "Converted",
        convertedCustomer: newCustomer._id,
      },
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: 'Customer converted successfully',
      customerID: newCustomer._id,
      customer: newCustomer,
      lead: updatedLead,
    });
  } catch (error) {
    console.error('[convertAsCustomer error]', error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to convert lead to customer",
      message: error.message || "Failed to convert lead to customer",
    });
  }
};
