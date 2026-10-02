const jwt = require('jsonwebtoken');
require('dotenv').config();

const User = require('../models/user');

const authMiddleware = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');  // Retrieve token from Authorization header
  if (!token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const innerUser = (decoded && typeof decoded.user === 'object' && decoded.user !== null) ? decoded.user : {};

    const targetUserId = innerUser.id || innerUser.userId || innerUser._id || decoded.id || decoded.userId || decoded._id;

    if (targetUserId) {
      try {
        const userDoc = await User.findById(targetUserId).select('isActive isRestricted');
        if (userDoc && (userDoc.isActive === false || userDoc.isRestricted === true)) {
          return res.status(403).json({ msg: 'This account has been deactivated or restricted by administrator.' });
        }
      } catch (err) {
        // Gracefully ignore transient DB lookup errors
      }
    }

    req.user = {
      ...decoded,
      ...innerUser,
      id: targetUserId,
      userId: targetUserId,
      _id: targetUserId,
      role: innerUser.role || decoded.role || 'Staff',
      access: innerUser.access || decoded.access || [],
      username: innerUser.username || decoded.username || '',
    };
    next();
  } catch (err) {
    return res.status(401).json({ msg: 'Token is not valid' });
  }
};

module.exports = authMiddleware;

