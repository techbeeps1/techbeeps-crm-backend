
require('dotenv').config();
const User = require('../models/user');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Otp = require('../models/otpModel');
const registerUser = async (req, res) => {
  const { username, email, password, role } = req.body;  // Role can be passed in the request body
  try {
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ msg: 'User already exists' });
    }
    const bcryptSalt = bcrypt.genSaltSync(10);
    const hashedPassword = await bcrypt.hash(password, bcryptSalt);
    user = new User({
      ...req.body,
      password: hashedPassword,
    });
    await user.save();
    const token = jwt.sign({ userId: user._id, username: user.username, role: user.role }, process.env.JWT_SECRET);
    return res.status(201).json({ token, user: { id: user._id, username: user.username, email: user.email, role: user.role } });
  } catch (err) {
    return res.status(500).json({ msg: 'Server error' });
  }
};

const loginUser = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }
    const token = jwt.sign({ userId: user._id, username: user.username, role: user.role }, process.env.JWT_SECRET);
    return res.status(200).json({ token, user: { id: user._id, name: user.username, email: user.email } });
  } catch (err) {
    return res.status(500).json({ msg: 'Server error' });
  }
};

const ProfileUser = async (req, res) => {
  const { userId } = req.user; // Extract userId from the authenticated user
  try {
    const user = await User.findById(userId); // Use findById to get user by userId
    if (!user) {
      return res.status(404).json({ msg: 'User not found' }); // Use 404 for not found
    }
    return res.status(200).json({
      user: {
        userId: user._id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error(err); // Log the error for debugging
    return res.status(500).json({ msg: 'Server error' });
  }
};

const Allusers = async (req, res) => {
  try {
    const users = await User.find({});
    if (!users) {
      return res.status(404).json({ msg: 'Users not found' });
    }
    return res.status(200).json(users);
  } catch (err) {
    console.error(err); // Log the error for debugging
    return res.status(500).json({ msg: 'Server error' });
  }
};

const DeleteUser = async (req, res) => {
  const { id } = req.body; // Extract the user ID from the request body
  if (!id) {
    return res.status(400).json({ msg: 'User ID is required' }); // Handle missing ID
  }
  try {
    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    return res.status(200).json({ msg: 'User deleted successfully', user });
  } catch (err) {
    console.error(err); // Log the error for debugging
    return res.status(500).json({ msg: 'Server error' }); // Handle server errors
  }
};

const ResetPassword = async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    return res.status(400).json({ msg: 'Email, OTP, and new password are required' });
  }
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
      const record = await Otp.findOne({ email, otp });
        if (record) {
            await Otp.deleteOne({ email }); // OTP can only be used once
        } else {
            return res.status(400).json({ msg: 'Invalid or expired OTP' });
        }

    const salt = await bcrypt.genSalt(10);
    const hashedNewPassword = await bcrypt.hash(newPassword, salt);
    user.password = hashedNewPassword;
    await user.save();
    return res.status(200).json({ msg: 'Password updated successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: 'Server error' });
  }
};
const UpdateDetails = async (req, res) => {
  const { id } = req.body;
  try {
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { ...req.body },
      { new: true, runValidators: true } // Options to return the updated document and run validation
    );
    if (!updatedUser) {
      return res.status(404).json({ msg: 'User not found.' });
    }
    return res.status(200).json({ msg: 'Admin role assign successfully.', user: updatedUser });
  } catch (err) {
    console.error(err); // Log the error for debugging
    return res.status(500).json({ msg: 'Server error' });
  }
};
const MakeAdmin = async (req, res) => {
  const { id, role } = req.body;
  try {
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { role },
      { new: true, runValidators: true }
    );
    if (!updatedUser) {
      return res.status(404).json({ msg: 'User not found.' });
    }
    return res.status(200).json({ msg: 'Admin role assign successfully.', user: updatedUser });
  } catch (err) {
    console.error(err); // Log the error for debugging
    return res.status(500).json({ msg: 'Server error' });
  }
};

module.exports = { registerUser, loginUser, ProfileUser, Allusers, DeleteUser, ResetPassword, UpdateDetails, MakeAdmin };
