const Email = require('../models/Email/email')
const mongoose = require('mongoose');
// CREATE: Send a new email
const sendEmail = async (req, res) => {
  try {
    const { subject, body, sender, recipient } = req.body;
    const newEmail = new Email({
      subject,
      body,
      sender,
      recipient,
    });
    const savedEmail = await newEmail.save();
    res.status(201).json(savedEmail);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error sending email', error });
  }
};


const getEmailById = async (req, res) => {
  try {
    const email = await Email.findById(req.params.id);
    if (!email) {
      return res.status(404).json({ message: 'Email not found' });
    }
    res.status(200).json(email);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching email', error });
  }
};

// UPDATE: Update an email by ID
const updateEmail = async (req, res) => {
  try {
    const updatedEmail = await Email.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!updatedEmail) {
      return res.status(404).json({ message: 'Email not found' });
    }
    res.status(200).json(updatedEmail);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error updating email', error });
  }
};

// DELETE: Delete an email by ID
const deleteEmail = async (req, res) => {
  try {
    const deletedEmail = await Email.findByIdAndDelete(req.params.id);
    if (!deletedEmail) {
      return res.status(404).json({ message: 'Email not found' });
    }
    res.status(200).json({ message: 'Email deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error deleting email', error });
  }
};

// LIST: Get paginated emails with filters for customer/job/offer
const getEmails = async (req, res) => {
  try {
    const { page = 1, rowsPerPage = 10, search = '', customerId, offerId, jobId } = req.query;
    const filter = {};

    if (customerId) {
      filter.$or = [
        { customer: String(customerId) },
        { customer: customerId },
      ];
    } else if (jobId) {
      filter.job = jobId;
    } else if (offerId) {
      filter.offer = offerId;
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [
          { subject: searchRegex },
          { recipient: searchRegex },
          { from: searchRegex },
        ],
      });
    }

    const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(rowsPerPage);
    const limit = parseInt(rowsPerPage);

    const [emails, totalEmails] = await Promise.all([
      Email.find(filter).sort({ sentAt: -1, createdAt: -1 }).skip(skip).limit(limit),
      Email.countDocuments(filter),
    ]);

    res.status(200).json({ emails, totalEmails });
  } catch (error) {
    console.error('Error fetching emails:', error);
    res.status(500).json({ message: 'Error fetching emails', error: error.message });
  }
};

module.exports = {
  sendEmail,
  getEmailById,
  getEmails,
  updateEmail,
  deleteEmail,
};
