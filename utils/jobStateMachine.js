/**
 * jobStateMachine.js - EXEC-32 Operational Acceptance Gate
 * 
 * Server-enforced state machine for Universal Movers job lifecycle:
 * - Canonical status normalization
 * - Transition rules & prerequisites validation
 * - Role-based authorization (Reopening, cancellation, worker journey)
 * - Complete audit trail logging (statusHistory)
 */

const mongoose = require('mongoose');

// Canonical Status Definitions
const CANONICAL_STATUSES = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  CONFIRMED: 'CONFIRMED',
  EXECUTION: 'EXECUTION',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

// Aliases for incoming legacy / mixed-case statuses
const STATUS_ALIASES = {
  'pending': 'PENDING',
  'first contact': 'PENDING',
  'draft': 'PENDING',
  'processing': 'PROCESSING',
  'quote sent': 'PROCESSING',
  'valuation': 'PROCESSING',
  'confirmed': 'CONFIRMED',
  'scheduled': 'CONFIRMED',
  'in progress': 'EXECUTION',
  'execution': 'EXECUTION',
  'moving': 'EXECUTION',
  'completed': 'COMPLETED',
  'closed': 'COMPLETED',
  'cancelled': 'CANCELLED',
  'canceled': 'CANCELLED',
};

/**
 * Normalize any input status string to its canonical uppercase equivalent
 */
function normalizeStatus(status) {
  if (!status) return null;
  const cleaned = String(status).trim().toLowerCase();
  if (STATUS_ALIASES[cleaned]) {
    return STATUS_ALIASES[cleaned];
  }
  const upper = String(status).trim().toUpperCase();
  if (Object.values(CANONICAL_STATUSES).includes(upper)) {
    return upper;
  }
  return null;
}

/**
 * State Transition Matrix
 * Defines allowed next states for each current state
 */
const ALLOWED_TRANSITIONS = {
  PENDING: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['CONFIRMED', 'EXECUTION', 'CANCELLED'],
  CONFIRMED: ['EXECUTION', 'CANCELLED'],
  EXECUTION: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['EXECUTION'], // Reopen workflow (Admin/Manager only)
  CANCELLED: ['PROCESSING', 'PENDING'], // Reopen workflow (Admin/Manager only)
};

/**
 * Validate State Transition and Prerequisites
 */
async function validateTransition({
  currentStatus,
  targetStatus,
  jobDoc,
  user,
  reason = '',
}) {
  const normCurrent = normalizeStatus(currentStatus) || 'PENDING';
  const normTarget = normalizeStatus(targetStatus);

  if (!normTarget) {
    return {
      allowed: false,
      statusCode: 400,
      code: 'INVALID_STATUS',
      message: `Invalid job status: '${targetStatus}'. Allowed: ${Object.values(CANONICAL_STATUSES).join(', ')}`,
    };
  }

  // Idempotent: same status transition is a no-op
  if (normCurrent === normTarget) {
    return { allowed: true, normCurrent, normTarget, isNoop: true };
  }

  const allowedNext = ALLOWED_TRANSITIONS[normCurrent] || [];
  if (!allowedNext.includes(normTarget)) {
    return {
      allowed: false,
      statusCode: 422,
      code: 'INVALID_STATUS_TRANSITION',
      message: `Illegal job transition from '${normCurrent}' to '${normTarget}'. Allowed transitions from '${normCurrent}': [${allowedNext.join(', ')}]`,
    };
  }

  const userRole = user?.role || 'Staff';
  const isAdminOrManager = ['Admin', 'Manager'].includes(userRole);

  // 1. Reopening Closed Jobs Check (COMPLETED / CANCELLED -> Active)
  if (normCurrent === 'COMPLETED' || normCurrent === 'CANCELLED') {
    if (!isAdminOrManager) {
      return {
        allowed: false,
        statusCode: 403,
        code: 'UNAUTHORIZED_REOPEN',
        message: `Only Admin or Manager roles are authorized to reopen a ${normCurrent} job. Your role: '${userRole}'.`,
      };
    }
    const cleanReason = String(reason || '').trim();
    if (cleanReason.length < 5) {
      return {
        allowed: false,
        statusCode: 400,
        code: 'REOPEN_REASON_REQUIRED',
        message: `An auditable reason of at least 5 characters is required to reopen a ${normCurrent} job.`,
      };
    }
  }

  // 2. Cancellation Check
  if (normTarget === 'CANCELLED') {
    const cleanReason = String(reason || '').trim();
    if (cleanReason.length < 5) {
      return {
        allowed: false,
        statusCode: 400,
        code: 'CANCELLATION_REASON_REQUIRED',
        message: 'A documented cancellation reason of at least 5 characters is required to cancel a job.',
      };
    }
    if (normCurrent === 'EXECUTION' && !isAdminOrManager) {
      return {
        allowed: false,
        statusCode: 403,
        code: 'UNAUTHORIZED_ABORT',
        message: 'Only Admin or Manager roles may cancel a job currently in active EXECUTION.',
      };
    }
  }

  // 3. Prerequisites for EXECUTION
  if (normTarget === 'EXECUTION') {
    // Check Quote acceptance or appointment assignment
    let hasAcceptedQuote = false;
    if (jobDoc?.offer && jobDoc.offer.length > 0) {
      try {
        const Finance = mongoose.model('Finance');
        const acceptedCount = await Finance.countDocuments({
          _id: { $in: jobDoc.offer },
          status: 'Accepted',
        });
        hasAcceptedQuote = acceptedCount > 0;
      } catch (err) {
        // Finance lookup fallback
      }
    }

    let hasScheduledAppt = false;
    try {
      const Appointment = mongoose.model('Appointment');
      const apptCount = await Appointment.countDocuments({
        jobId: jobDoc?._id,
        status: { $ne: 'Cancelled' },
      });
      hasScheduledAppt = apptCount > 0;
    } catch (err) {
      // Appointment lookup fallback
    }

    if (!hasAcceptedQuote && !hasScheduledAppt && !isAdminOrManager) {
      return {
        allowed: false,
        statusCode: 422,
        code: 'PREREQUISITE_NOT_MET',
        message: `Cannot transition Job #${jobDoc?.index || ''} to EXECUTION: Requires an accepted quotation or a scheduled resource appointment.`,
      };
    }
  }

  // 4. Prerequisites for COMPLETED
  if (normTarget === 'COMPLETED') {
    if (normCurrent !== 'EXECUTION' && !isAdminOrManager) {
      return {
        allowed: false,
        statusCode: 422,
        code: 'COMPLETION_PREREQUISITE_FAILED',
        message: `Job #${jobDoc?.index || ''} cannot be completed directly from '${normCurrent}'. Must be in 'EXECUTION' before completing.`,
      };
    }
  }

  return {
    allowed: true,
    normCurrent,
    normTarget,
  };
}

/**
 * Worker Authorization Check:
 * Verifies if the requesting worker is assigned to this job
 */
async function isWorkerAssignedToJob(jobId, userId, userRole) {
  if (['Admin', 'Manager', 'Planner', 'HR'].includes(userRole)) {
    return true; // Privileged roles have global operational access
  }
  if (!userId || !jobId) return false;

  try {
    const Appointment = mongoose.model('Appointment');
    const Employability = mongoose.model('Employability');

    const appts = await Appointment.find({
      jobId,
      status: { $ne: 'Cancelled' },
    }).select('assignedEmployees');

    const empIds = [];
    appts.forEach((a) => {
      if (Array.isArray(a.assignedEmployees)) {
        empIds.push(...a.assignedEmployees);
      }
    });

    if (empIds.length === 0) return false;

    const assignedCount = await Employability.countDocuments({
      _id: { $in: empIds },
      employeeId: userId,
    });

    return assignedCount > 0;
  } catch (err) {
    console.error('Error verifying worker assignment:', err.message);
    return false;
  }
}

module.exports = {
  CANONICAL_STATUSES,
  STATUS_ALIASES,
  ALLOWED_TRANSITIONS,
  normalizeStatus,
  validateTransition,
  isWorkerAssignedToJob,
};

