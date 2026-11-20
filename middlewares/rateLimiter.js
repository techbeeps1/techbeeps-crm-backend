const rateLimit = require('express-rate-limit');

/**
 * Helper to determine if rate limiting should be skipped (e.g. during test runs)
 */
const shouldSkip = (req) => {
  return process.env.NODE_ENV === 'test' || Boolean(req.headers['x-test-bypass']);
};

/**
 * Rate limiter for authentication endpoints (login, register, password reset).
 * Restricts brute force credential attacks.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 25, // limit each IP to 25 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkip,
  handler: (req, res) => {
    return res.status(429).json({
      error: 'TOO_MANY_REQUESTS',
      msg: 'Too many authentication attempts from this IP, please try again after 15 minutes.',
      retryAfter: Math.ceil(15 * 60),
    });
  },
});

/**
 * Strict rate limiter for OTP generation and verification endpoints.
 * Protects against OTP enumeration and SMS/email spam abuse.
 */
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 OTP requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkip,
  handler: (req, res) => {
    return res.status(429).json({
      error: 'TOO_MANY_REQUESTS',
      msg: 'Too many OTP requests from this IP, please try again after 15 minutes.',
      retryAfter: Math.ceil(15 * 60),
    });
  },
});

module.exports = {
  authLimiter,
  otpLimiter,
};
