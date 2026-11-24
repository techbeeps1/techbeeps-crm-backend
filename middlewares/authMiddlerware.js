const jwt = require('jsonwebtoken');
require('dotenv').config();

const User = require('../models/user');

const authMiddleware = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');  // Retrieve token from Authorization header
  if (!token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('[authMiddleware] FATAL: JWT_SECRET environment variable is missing.');
      return res.status(500).json({ msg: 'Server authentication configuration error' });
    }
    const decoded = jwt.verify(token, jwtSecret);
    const innerUser = (decoded && typeof decoded.user === 'object' && decoded.user !== null) ? decoded.user : {};

    const targetUserId = innerUser.id || innerUser.userId || innerUser._id || decoded.id || decoded.userId || decoded._id;

    let userDoc = null;
    if (targetUserId) {
      try {
        userDoc = await User.findById(targetUserId).select('isActive isRestricted outofservice role');
        if (!userDoc) {
          return res.status(401).json({ msg: 'User account not found or removed.' });
        }
        if (userDoc.isActive === false || userDoc.isRestricted === true) {
          return res.status(403).json({ msg: 'This account has been deactivated or restricted by administrator.' });
        }
        if (userDoc.outofservice && new Date(userDoc.outofservice) <= new Date()) {
          return res.status(403).json({ msg: 'This employee account is out of service.' });
        }
      } catch (err) {
        if (err.name === 'CastError') {
          return res.status(401).json({ msg: 'Invalid user identifier in token' });
        }
      }
    } else {
      return res.status(401).json({ msg: 'Token does not contain valid user information' });
    }

    req.user = {
      ...decoded,
      ...innerUser,
      id: targetUserId,
      userId: targetUserId,
      _id: targetUserId,
      role: (userDoc && userDoc.role) ? userDoc.role : (innerUser.role || decoded.role || 'Staff'),
      access: innerUser.access || decoded.access || [],
      username: innerUser.username || decoded.username || '',
    };
    next();
  } catch (err) {
    return res.status(401).json({ msg: 'Token is not valid' });
  }
};

const optionalAuthMiddleware = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return next();
  }
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('[authMiddleware] FATAL: JWT_SECRET environment variable is missing.');
      return res.status(500).json({ msg: 'Server authentication configuration error' });
    }
    const decoded = jwt.verify(token, jwtSecret);
    const innerUser = (decoded && typeof decoded.user === 'object' && decoded.user !== null) ? decoded.user : {};
    const targetUserId = innerUser.id || innerUser.userId || innerUser._id || decoded.id || decoded.userId || decoded._id;

    let userDoc = null;
    if (targetUserId) {
      try {
        userDoc = await User.findById(targetUserId).select('isActive isRestricted outofservice role');
        if (!userDoc) {
          return res.status(401).json({ msg: 'User account not found or removed.' });
        }
        if (userDoc.isActive === false || userDoc.isRestricted === true) {
          return res.status(403).json({ msg: 'This account has been deactivated or restricted by administrator.' });
        }
        if (userDoc.outofservice && new Date(userDoc.outofservice) <= new Date()) {
          return res.status(403).json({ msg: 'This employee account is out of service.' });
        }
      } catch (err) {
        if (err.name === 'CastError') {
          return res.status(401).json({ msg: 'Invalid user identifier in token' });
        }
      }
    } else {
      return res.status(401).json({ msg: 'Token does not contain valid user information' });
    }

    req.user = {
      ...decoded,
      ...innerUser,
      id: targetUserId,
      userId: targetUserId,
      _id: targetUserId,
      role: (userDoc && userDoc.role) ? userDoc.role : (innerUser.role || decoded.role || 'Staff'),
      access: innerUser.access || decoded.access || [],
      username: innerUser.username || decoded.username || '',
    };
    next();
  } catch (err) {
    next();
  }
};

authMiddleware.optionalAuthMiddleware = optionalAuthMiddleware;
module.exports = authMiddleware;
module.exports.optionalAuthMiddleware = optionalAuthMiddleware;
