/**
 * resourceConflictEngine.js - EXEC-31 Operational Acceptance Gate
 * 
 * Comprehensive conflict detection engine for Universal Movers CRM:
 * 1. Crew Overlapping Shifts (Double-booking across appointments)
 * 2. Vehicle & Moving Lift Overlapping Assignments
 * 3. HRM Approved Leave & Sickness Integration
 * 4. Driver License Qualification Verification (B vs C/CE/C1)
 * 5. Minimum Crew / Lift Requirement Checks (Quotation vs Assigned)
 * 6. Survey vs Move Disambiguation
 */

const mongoose = require('mongoose');
const Appointment = require('../models/appointmentModel');
const Employability = require('../models/employabilityModel');
const LeaveRequest = require('../models/LeaveRequest');
const User = require('../models/user');
const Vehicle = require('../models/Resources/vehicle');
const JobSchedule = require('../models/jobSchedule');

/**
 * Helper to parse dates into consistent Date objects
 */
function toDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Format time to HH:mm string for clear conflict messages
 */
function formatTimeStr(val) {
  if (!val) return '--:--';
  if (typeof val === 'string' && /^\d{1,2}:\d{2}/.test(val)) {
    return val.length === 4 ? `0${val}` : val.slice(0, 5);
  }
  const d = toDate(val);
  if (!d) return String(val);
  return d.toISOString().slice(11, 16);
}

/**
 * Format date to YYYY-MM-DD
 */
function formatDateStr(val) {
  if (!val) return '---';
  const d = toDate(val);
  if (!d) return String(val);
  return d.toISOString().slice(0, 10);
}

/**
 * Check if two time intervals [s1, e1] and [s2, e2] overlap
 */
function intervalsOverlap(s1, e1, s2, e2) {
  if (!s1 || !e1 || !s2 || !e2) return true; // conservative fallback
  const start1 = s1.getTime();
  const end1 = e1.getTime();
  const start2 = s2.getTime();
  const end2 = e2.getTime();
  return start1 < end2 && end1 > start2;
}

/**
 * Driver license hierarchy / compatibility check
 * e.g., 'CE' qualifies for 'C' and 'BE' and 'B'; 'C' qualifies for 'C1' and 'B'; etc.
 */
function isLicenseSufficient(heldLicenses = [], requiredLicenses = []) {
  if (!requiredLicenses || requiredLicenses.length === 0) return true;
  if (!heldLicenses || heldLicenses.length === 0) return false;

  const normalizedHeld = heldLicenses.map((l) => String(l).trim().toUpperCase());
  const normalizedReq = requiredLicenses.map((l) => String(l).trim().toUpperCase());

  // Check each required license
  return normalizedReq.every((req) => {
    if (normalizedHeld.includes(req)) return true;
    // CE satisfies C, C1, BE, B
    if (normalizedHeld.includes('CE') && ['C', 'C1', 'BE', 'B'].includes(req)) return true;
    // C satisfies C1, B
    if (normalizedHeld.includes('C') && ['C1', 'B'].includes(req)) return true;
    // BE satisfies B
    if (normalizedHeld.includes('BE') && req === 'B') return true;
    return false;
  });
}

/**
 * Main Conflict Evaluation Function
 */
async function checkResourceConflicts({
  appointmentId = null,
  jobId = null,
  date = null,
  startTime = null,
  endTime = null,
  appointmentType = 'Move',
  assignedEmployees = [],
  vehicle = null,
  vehicleName = '',
  surveyDetails = null,
} = {}) {
  const conflicts = [];
  const warnings = [];

  const apptDate = toDate(date) || toDate(startTime) || new Date();
  const dayStart = new Date(apptDate);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(apptDate);
  dayEnd.setUTCHours(23, 59, 59, 999);

  const parsedStart = toDate(startTime) || toDate(date) || dayStart;
  const parsedEnd = toDate(endTime) || new Date(parsedStart.getTime() + 4 * 3600 * 1000);

  // Normalize incoming employee list
  const empList = Array.isArray(assignedEmployees) ? assignedEmployees : [];

  // Collect vehicle IDs to check
  const vehicleIdsToCheck = new Set();
  if (vehicle) {
    const vId = typeof vehicle === 'object' ? (vehicle._id || vehicle.id) : vehicle;
    if (vId) vehicleIdsToCheck.add(String(vId));
  }
  empList.forEach((emp) => {
    if (emp.vehicle) {
      const vId = typeof emp.vehicle === 'object' ? (emp.vehicle._id || emp.vehicle.id) : emp.vehicle;
      if (vId) vehicleIdsToCheck.add(String(vId));
    }
  });

  // -------------------------------------------------------------
  // 1. CHECK OVERLAPPING APPOINTMENTS (Crew & Vehicle Double-Booking)
  // -------------------------------------------------------------
  const queryFilter = {
    status: { $ne: 'Cancelled' },
    $or: [
      { date: { $gte: dayStart, $lte: dayEnd } },
      { startTime: { $gte: dayStart, $lte: dayEnd } },
    ],
  };

  if (appointmentId && mongoose.Types.ObjectId.isValid(appointmentId)) {
    queryFilter._id = { $ne: new mongoose.Types.ObjectId(appointmentId) };
  }

  const existingAppointments = await Appointment.find(queryFilter)
    .populate({
      path: 'assignedEmployees',
      populate: { path: 'vehicle', select: 'name licensePlate vehicleType requiredLicense' },
    })
    .populate('vehicle', 'name licensePlate vehicleType requiredLicense')
    .populate('jobId', 'index status');

  for (const other of existingAppointments) {
    const otherStart = toDate(other.startTime) || toDate(other.date) || dayStart;
    const otherEnd = toDate(other.endTime) || new Date(otherStart.getTime() + 4 * 3600 * 1000);

    // Only compare if the time windows overlap
    if (intervalsOverlap(parsedStart, parsedEnd, otherStart, otherEnd)) {
      const otherJobIndex = other.jobId?.index ? `#${other.jobId.index}` : `Appointment #${String(other._id).slice(-6)}`;
      const otherWindow = `${formatTimeStr(otherStart)} - ${formatTimeStr(otherEnd)}`;

      // A) Check Crew Member Overlaps
      if (Array.isArray(other.assignedEmployees)) {
        for (const otherEmp of other.assignedEmployees) {
          const otherEmpId = otherEmp.employeeId ? String(otherEmp.employeeId) : null;
          const otherEmpName = otherEmp.employeeName || 'Unknown Employee';

          for (const newEmp of empList) {
            const newEmpId = newEmp.employeeId ? String(newEmp.employeeId) : null;
            const newEmpName = newEmp.employeeName || 'Unknown Employee';

            const idMatch = newEmpId && otherEmpId && newEmpId === otherEmpId;
            const nameMatch = !idMatch && newEmpName.toLowerCase().trim() === otherEmpName.toLowerCase().trim();

            if (idMatch || nameMatch) {
              conflicts.push({
                conflictType: 'CREW_OVERLAP',
                severity: 'BLOCK',
                message: `Crew member "${newEmpName}" is already scheduled on Job ${otherJobIndex} (${other.appointmentType || 'Appointment'}) during ${otherWindow}.`,
                targetId: newEmpId || otherEmpId,
                targetName: newEmpName,
              });
            }
          }
        }
      }

      // B) Check Vehicle / Lift Overlaps
      const otherVehicleIds = new Set();
      if (other.vehicle) {
        const ovId = typeof other.vehicle === 'object' ? String(other.vehicle._id) : String(other.vehicle);
        if (ovId) otherVehicleIds.add(ovId);
      }
      if (Array.isArray(other.assignedEmployees)) {
        other.assignedEmployees.forEach((emp) => {
          if (emp.vehicle) {
            const ovId = typeof emp.vehicle === 'object' ? String(emp.vehicle._id) : String(emp.vehicle);
            if (ovId) otherVehicleIds.add(ovId);
          }
        });
      }

      for (const vId of vehicleIdsToCheck) {
        if (otherVehicleIds.has(vId)) {
          let vehNameDisplay = vehicleName;
          if (!vehNameDisplay && other.vehicle && String(other.vehicle._id) === vId) {
            vehNameDisplay = other.vehicle.name ? `${other.vehicle.name} (${other.vehicle.licensePlate || 'Vehicle'})` : 'Assigned Vehicle';
          }
          conflicts.push({
            conflictType: 'VEHICLE_OVERLAP',
            severity: 'BLOCK',
            message: `Vehicle / Lift "${vehNameDisplay || 'Equipment'}" is already assigned to Job ${otherJobIndex} during ${otherWindow}.`,
            targetId: vId,
            targetName: vehNameDisplay || 'Vehicle',
          });
        }
      }
    }
  }

  // -------------------------------------------------------------
  // 2. CHECK HRM LEAVE & SICKNESS AVAILABILITY
  // -------------------------------------------------------------
  for (const emp of empList) {
    if (emp.employeeId && mongoose.Types.ObjectId.isValid(emp.employeeId)) {
      const activeLeaves = await LeaveRequest.find({
        employeeId: emp.employeeId,
        status: 'Approved',
        startDate: { $lte: dayEnd },
        endDate: { $gte: dayStart },
      });

      for (const leave of activeLeaves) {
        const isSick = (leave.leaveType || '').toLowerCase().includes('sick');
        const startStr = formatDateStr(leave.startDate);
        const endStr = formatDateStr(leave.endDate);

        conflicts.push({
          conflictType: 'LEAVE_SICKNESS',
          severity: 'BLOCK',
          message: `Employee "${emp.employeeName}" is UNAVAILABLE due to approved ${leave.leaveType} (${startStr} to ${endStr}). Reason: "${leave.reason || 'None specified'}".`,
          targetId: String(emp.employeeId),
          targetName: emp.employeeName,
        });
      }
    }
  }

  // -------------------------------------------------------------
  // 3. CHECK DRIVER LICENSE ELIGIBILITY
  // -------------------------------------------------------------
  if (vehicleIdsToCheck.size > 0) {
    const vehiclesData = await Vehicle.find({
      _id: { $in: Array.from(vehicleIdsToCheck).filter((id) => mongoose.Types.ObjectId.isValid(id)) },
    });

    for (const veh of vehiclesData) {
      if (veh.requiredLicense && veh.requiredLicense.length > 0) {
        // Find drivers assigned to this vehicle or designated as 'Driver'
        const designatedDrivers = empList.filter((e) => {
          const isDriverRole = (e.workType || '').toLowerCase().includes('driver');
          const isAssignedToThisVeh = e.vehicle && String(typeof e.vehicle === 'object' ? e.vehicle._id : e.vehicle) === String(veh._id);
          return isDriverRole || isAssignedToThisVeh;
        });

        if (designatedDrivers.length === 0) {
          warnings.push({
            conflictType: 'INELIGIBLE_DRIVER',
            severity: 'WARNING',
            message: `Vehicle "${veh.name}" (${veh.vehicleType || 'Fleet'}) requires license (${veh.requiredLicense.join(', ')}), but no designated driver is assigned to it.`,
            targetId: String(veh._id),
            targetName: veh.name,
          });
        } else {
          for (const driver of designatedDrivers) {
            if (driver.employeeId && mongoose.Types.ObjectId.isValid(driver.employeeId)) {
              const userRecord = await User.findById(driver.employeeId).select('drivingLicense username');
              const held = userRecord?.drivingLicense || [];

              if (!isLicenseSufficient(held, veh.requiredLicense)) {
                conflicts.push({
                  conflictType: 'INELIGIBLE_DRIVER',
                  severity: 'BLOCK',
                  message: `Assigned driver "${driver.employeeName}" does not hold required license (${veh.requiredLicense.join(', ')}) for vehicle "${veh.name}". Held licenses: [${held.join(', ') || 'None'}].`,
                  targetId: String(driver.employeeId),
                  targetName: driver.employeeName,
                });
              }
            }
          }
        }
      }
    }
  }

  // -------------------------------------------------------------
  // 4. CHECK UNDER-STAFFING / QUOTATION REQUIREMENTS
  // -------------------------------------------------------------
  if (jobId && mongoose.Types.ObjectId.isValid(jobId)) {
    const jobDoc = await JobSchedule.findById(jobId).select('relocation status index knownAddress');
    if (jobDoc && jobDoc.relocation) {
      const reqMovers = Number(jobDoc.relocation.relocation_movers) || 0;
      const assignedCrewCount = empList.length;

      if (reqMovers > 0 && assignedCrewCount < reqMovers) {
        warnings.push({
          conflictType: 'UNDER_STAFFED',
          severity: 'WARNING',
          message: `Job #${jobDoc.index || ''} requires ${reqMovers} movers according to quotation estimate, but only ${assignedCrewCount} crew member(s) assigned.`,
          targetId: String(jobDoc._id),
          targetName: `Job #${jobDoc.index || ''}`,
        });
      }

      const reqLiftQty = Number(jobDoc.relocation.movingLift_quantity) || 0;
      if (reqLiftQty > 0) {
        // Check if a Moving Lift is among assigned vehicles
        let hasLift = false;
        if (vehicleIdsToCheck.size > 0) {
          const assignedVehs = await Vehicle.find({
            _id: { $in: Array.from(vehicleIdsToCheck).filter((id) => mongoose.Types.ObjectId.isValid(id)) },
          }).select('vehicleType name');
          hasLift = assignedVehs.some(
            (v) => (v.vehicleType || '').toLowerCase().includes('lift') || (v.name || '').toLowerCase().includes('lift')
          );
        }

        if (!hasLift) {
          warnings.push({
            conflictType: 'UNDER_STAFFED',
            severity: 'WARNING',
            message: `Job #${jobDoc.index || ''} quotation specifies ${reqLiftQty} Moving Lift(s), but no Moving Lift resource is allocated to this appointment.`,
            targetId: String(jobDoc._id),
            targetName: 'Moving Lift',
          });
        }
      }
    }
  }

  // -------------------------------------------------------------
  // 5. SURVEY APPOINTMENT DISAMBIGUATION
  // -------------------------------------------------------------
  if (appointmentType === 'Survey') {
    const hasEstimator =
      surveyDetails?.estimatorId ||
      empList.some((e) => (e.workType || '').toLowerCase().includes('estimator') || (e.workType || '').toLowerCase().includes('survey'));

    if (!hasEstimator && empList.length === 0) {
      warnings.push({
        conflictType: 'SURVEY_MISSING_ESTIMATOR',
        severity: 'WARNING',
        message: 'Survey appointment requires an assigned estimator for valuation inspection.',
        targetId: 'survey-estimator',
        targetName: 'Estimator',
      });
    }
  }

  const hasBlockConflicts = conflicts.some((c) => c.severity === 'BLOCK');
  const hasConflicts = conflicts.length > 0;
  const hasWarnings = warnings.length > 0;

  return {
    hasConflicts,
    hasBlockConflicts,
    conflicts,
    warnings,
  };
}

module.exports = {
  checkResourceConflicts,
  intervalsOverlap,
  isLicenseSufficient,
};

