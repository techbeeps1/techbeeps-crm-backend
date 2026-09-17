const jwt = require('jsonwebtoken');
require('dotenv').config();

const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');  // Retrieve token from Authorization header
  if (!token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const innerUser = (decoded && typeof decoded.user === 'object' && decoded.user !== null) ? decoded.user : {};

    req.user = {
      ...decoded,
      ...innerUser,
      id: innerUser.id || innerUser.userId || innerUser._id || decoded.id || decoded.userId || decoded._id,
      userId: innerUser.userId || innerUser.id || innerUser._id || decoded.userId || decoded.id || decoded._id,
      _id: innerUser._id || innerUser.id || innerUser.userId || decoded._id || decoded.id || decoded.userId,
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

