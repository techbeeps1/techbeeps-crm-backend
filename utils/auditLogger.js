const FinancialAuditLog = require('../models/financialAuditModel');

/**
 * Log an immutable financial audit event.
 * Non-blocking: failures to log will not crash the primary transaction, but will output to server logs.
 */
async function logFinancialEvent({
  entityType,
  entityId,
  action,
  amount,
  currency = 'EUR',
  req,
  actor,
  reason,
  before,
  after,
  metadata = {},
}) {
  try {
    const actorData = actor || {
      id: req?.user?._id || req?.user?.id,
      username: req?.user?.username,
      email: req?.user?.email,
      role: req?.user?.role,
    };

    const ipAddress = req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress;

    const logEntry = new FinancialAuditLog({
      entityType,
      entityId: String(entityId),
      action,
      amount,
      currency,
      actor: actorData,
      reason,
      before,
      after,
      metadata,
      ipAddress,
    });

    await logEntry.save();
    return logEntry;
  } catch (err) {
    console.error('[FinancialAuditLog] Failed to record audit log:', err.message);
    return null;
  }
}

module.exports = {
  logFinancialEvent,
};
