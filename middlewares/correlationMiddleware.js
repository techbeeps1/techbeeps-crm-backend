const crypto = require('crypto');

/**
 * Correlation ID & Sanitized Request Logger Middleware
 * Implements EXEC-02 requirements:
 * 1. Attaches a unique high-entropy x-correlation-id to every HTTP request/response.
 * 2. Allows tracing requests across frontend and backend.
 * 3. Sanitizes and redacts sensitive data (passwords, JWT bearer tokens, OTPs) from logs.
 */

function sanitizeHeaders(headers) {
  if (!headers) return {};
  const sanitized = { ...headers };
  if (sanitized.authorization) {
    sanitized.authorization = sanitized.authorization.startsWith('Bearer ')
      ? 'Bearer [REDACTED_TOKEN]'
      : '[REDACTED_AUTH]';
  }
  if (sanitized.cookie) {
    sanitized.cookie = '[REDACTED_COOKIE]';
  }
  return sanitized;
}

function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return body;
  const sanitized = Array.isArray(body) ? [...body] : { ...body };
  const sensitiveKeys = ['password', 'confirmPassword', 'token', 'jwt', 'otp', 'secret', 'creditCard'];

  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeBody(sanitized[key]);
    }
  }
  return sanitized;
}

const correlationMiddleware = (req, res, next) => {
  // 1. Assign or reuse correlation ID from header
  const correlationId = req.headers['x-correlation-id'] || crypto.randomUUID();
  req.correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);

  const start = Date.now();

  // 2. Log safe completion on response finish
  res.on('finish', () => {
    const duration = Date.now() - start;
    const isError = res.statusCode >= 400;
    const logPrefix = `[CID: ${correlationId}]`;

    if (isError) {
      console.warn(`${logPrefix} ${req.method} ${req.originalUrl || req.url} -> ${res.statusCode} (${duration}ms)`);
    } else {
      console.log(`${logPrefix} ${req.method} ${req.originalUrl || req.url} -> ${res.statusCode} (${duration}ms)`);
    }
  });

  next();
};

module.exports = {
  correlationMiddleware,
  sanitizeHeaders,
  sanitizeBody
};
