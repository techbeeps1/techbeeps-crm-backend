/**
 * EXEC-09: Unified Validation & Safe Error Response Utility
 *
 * Implements authoritative validation rules and sanitizes error responses:
 * - Bounded discount validation (0% to 100%)
 * - Floor semantics preservation (supports negative floor integers for basements/souterrains)
 * - Safe error response formatter (shields internal stack traces while logging correlation IDs)
 */

/**
 * Validates discount percentage.
 * Enforces business rule: discount must be between 0 and 100.
 *
 * @param {any} val - The input discount value
 * @returns {{ isValid: boolean, value?: number, error?: string }}
 */
function validateDiscount(val) {
  if (val === undefined || val === null || val === '') {
    return { isValid: true, value: 0 };
  }
  const num = Number(val);
  if (isNaN(num)) {
    return { isValid: false, error: 'Discount must be a valid number' };
  }
  if (num < 0 || num > 100) {
    return { isValid: false, error: 'Discount percentage must be between 0 and 100' };
  }
  return { isValid: true, value: num };
}

/**
 * Validates moving location floor.
 * Dutch moving semantics:
 * - Floor 0 = Begane grond (Ground floor)
 * - Floor > 0 = Upper floors (1, 2, 3...)
 * - Floor < 0 = Basement / Souterrain / Kelder (-1, -2...) - FULLY LEGITIMATE
 *
 * @param {any} val - The input floor value
 * @returns {{ isValid: boolean, value?: number, error?: string }}
 */
function validateFloor(val) {
  if (val === undefined || val === null || val === '') {
    return { isValid: true, value: 0 };
  }
  const num = Number(val);
  if (isNaN(num) || !Number.isInteger(num)) {
    return { isValid: false, error: 'Floor must be a valid integer (e.g., 0 for ground, -1 for basement)' };
  }
  return { isValid: true, value: num };
}

/**
 * Sends a sanitized, safe JSON error response to client.
 * Ensures no internal database schema details or stack traces are leaked.
 *
 * @param {object} res - Express response object
 * @param {Error|object|string} err - The error object
 * @param {string} [fallbackMessage] - Friendly user message
 * @param {string} [correlationId] - Tracing ID
 */
function sendSafeError(res, err, fallbackMessage = 'An unexpected error occurred', correlationId = null) {
  const corrId = correlationId || res.req?.correlationId || res.req?.headers?.['x-correlation-id'] || null;

  // Log full error details securely on server
  console.error(`[EXEC-09 SafeError] [CorrelationId: ${corrId}]`, err);

  const statusCode = (err && (err.statusCode || err.status)) ||
    (err && err.name === 'ValidationError' ? 400 : 500);

  const isClientSafe = statusCode < 500 || (err && err.name === 'ValidationError');
  const message = isClientSafe ? (err.message || fallbackMessage) : fallbackMessage;

  return res.status(statusCode).json({
    error: (err && err.name) || 'INTERNAL_ERROR',
    message,
    correlationId: corrId,
  });
}

module.exports = {
  validateDiscount,
  validateFloor,
  sendSafeError,
};
