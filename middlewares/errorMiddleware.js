/**
 * Error Sanitization Middleware (Task 19 [UM3-076])
 * Prevents raw database errors (E11000, MongoServerError, collection internals, driver stack traces)
 * from leaking to client responses.
 */

function sanitizeDatabaseError(err) {
  if (!err) {
    return {
      statusCode: 500,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal server error occurred.',
    };
  }

  // 1. Mongo Duplicate Key Error (E11000)
  if (err.code === 11000 || (err.name === 'MongoServerError' && err.code === 11000)) {
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || 'record';
    return {
      statusCode: 409,
      error: 'DUPLICATE_ENTRY',
      message: `A unique ${field} with this identifier already exists. Please use a distinct value.`,
    };
  }

  // 2. Mongoose Cast Error (Invalid ObjectId / Type)
  if (err.name === 'CastError') {
    return {
      statusCode: 400,
      error: 'INVALID_IDENTIFIER',
      message: 'The requested resource identifier is invalid or malformed.',
    };
  }

  // 3. Mongoose Validation Error
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors || {}).map(e => ({
      field: e.path,
      message: e.message,
    }));
    return {
      statusCode: 400,
      error: 'VALIDATION_FAILED',
      message: 'One or more required fields failed validation.',
      errors: details,
    };
  }

  // 4. JWT Authentication / Token Errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return {
      statusCode: 401,
      error: 'AUTHENTICATION_REQUIRED',
      message: err.name === 'TokenExpiredError'
        ? 'Your session token has expired. Please log in again.'
        : 'Invalid session token provided.',
    };
  }

  // 5. Explicit Client Errors (400 - 499)
  const status = err.statusCode || err.status;
  if (status && status >= 400 && status < 500) {
    let cleanMsg = err.message || 'Client request error';
    if (/mongodb|collection|CRMatlas|index_1|topology/i.test(cleanMsg)) {
      cleanMsg = 'The request could not be processed due to a data constraint conflict.';
    }
    return {
      statusCode: status,
      error: err.name || 'CLIENT_ERROR',
      message: cleanMsg,
    };
  }

  // 6. Generic 500 Internal Server Error (Completely sanitized, zero driver/stack leakage)
  return {
    statusCode: 500,
    error: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected internal server error occurred. Please contact support with your correlation ID.',
  };
}

/**
 * Centralized Express error-handling middleware
 */
function errorMiddleware(err, req, res, next) {
  const correlationId = req.correlationId || req.headers['x-correlation-id'] || null;
  console.error(`[SafeError] [Correlation: ${correlationId}]`, err);

  const { statusCode, error, message, errors } = sanitizeDatabaseError(err);

  const responsePayload = {
    error,
    message,
    correlationId,
  };

  if (errors && errors.length > 0) {
    responsePayload.errors = errors;
  }

  return res.status(statusCode).json(responsePayload);
}

module.exports = {
  sanitizeDatabaseError,
  errorMiddleware,
};
