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


const getAllEmails = async (req, res) => {
  try {
    const { page, rowsPerPage = 10, search = '', customerId ,offerId} = req.query;
    const pageNumber = parseInt(page, 10) || 1;
    const limit = parseInt(rowsPerPage, 10) || 10;
    const searchFilter = search
      ? {
          $or: [
            { from: { $regex: search, $options: 'i' } },
            { to: { $regex: search, $options: 'i' } },
            { subject: { $regex: search, $options: 'i' } },
          ],
        }
      : {};
    const customerFilter = customerId ? { customer: customerId } : {};
    const offerFilter = offerId ? { offer: offerId } : {};
    const filter = { ...searchFilter, ...customerFilter ,...offerFilter};
    const sortBy = { _id: -1 };
    const totalEmails = await Email.countDocuments(filter);
    const emails = await Email.find(filter)
      .sort(sortBy)
      .skip((pageNumber - 1) * limit)
      .limit(limit);
    res.status(200).json({
      emails,
      totalEmails,
      totalPages: Math.ceil(totalEmails / limit),
      currentPage: pageNumber,
    });
  } catch (error) {
    console.error('Error in getAllEmails:', error.message);
    res.status(500).json({ message: 'Error fetching emails', error });
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

module.exports = {
  sendEmail,
  getAllEmails,
  getEmailById,
  updateEmail,
  deleteEmail,
};
