const mongoose = require('mongoose');
const Appointment = require('../models/appointmentModel');
const Employability = require('../models/employabilityModel');
const WorkHour = require('../models/workHourModel');
const User = require('../models/user');
const Vehicle = require('../models/Resources/vehicle');
const JobSchedule = require('../models/jobSchedule');
const Customer = require('../models/customer');

// Helper to compute duration in hours between two dates/times
function computeHours(startTime, endTime) {
  if (!startTime || !endTime) return 0;
  const start = new Date(startTime);
  const end = new Date(endTime);
  const diffMs = end - start;
  if (isNaN(diffMs) || diffMs <= 0) return 0;
  return Number((diffMs / (1000 * 60 * 60)).toFixed(2));
}

// 1. GET ALL SHIFTS FOR APPROVAL
exports.getShiftsForApproval = async (req, res) => {
  try {
    const { startDate, endDate, employeeId, status = 'All', search = '' } = req.query;

    const appointmentFilter = {};
    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      appointmentFilter.date = { $gte: start, $lte: end };
    } else if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      appointmentFilter.date = { $gte: start };
    }

    // Fetch appointments populated with employee shifts and job info
    const appointments = await Appointment.find(appointmentFilter)
      .populate({
        path: 'assignedEmployees',
        populate: [
          { path: 'employeeId', select: 'username email role telephone photo' },
          { path: 'vehicle', select: 'name licensePlate model vehicleType' },
        ],
      })
      .populate({
        path: 'jobId',
        select: 'index customer load unload status relocation date',
        populate: {
          path: 'customer',
          select: 'firstName lastName email mobile contact address companyName',
        },
      })
      .sort({ date: -1, startTime: -1 });

    // Collect all appointment IDs to batch fetch existing WorkHour approval records
    const appointmentIds = appointments.map((a) => a._id);
    const existingWorkHours = await WorkHour.find({
      appointmentId: { $in: appointmentIds },
    }).populate('approvedBy', 'username email');

    // Index existing WorkHour records by appointmentId + employabilityId
    const workHourMap = new Map();
    existingWorkHours.forEach((wh) => {
      const key = `${wh.appointmentId.toString()}_${wh.employabilityId.toString()}`;
      workHourMap.set(key, wh);
    });

    const shiftRecords = [];

    appointments.forEach((appt) => {
      const apptDate = appt.date || appt.startTime;
      const apptJob = appt.jobId || null;

      // Condition: Only include appointments if parent job is completed
      const jobStatus = (apptJob?.status || '').trim().toLowerCase();
      const isJobCompleted = jobStatus === 'completed' || jobStatus === 'complete';
      if (!isJobCompleted) return;

      (appt.assignedEmployees || []).forEach((emp) => {
        if (!emp) return;

        const empId = emp.employeeId?._id || emp.employeeId || null;
        const empName = emp.employeeName || emp.employeeId?.username || 'Staff Member';
        const empRole = emp.employeeId?.role || 'Staff';
        const empPhoto = emp.employeeId?.photo || null;

        // Shift times
        const sTime = emp.startTime || appt.startTime;
        const eTime = emp.endTime || appt.endTime;
        const scheduledDuration = computeHours(sTime, eTime);

        // Check if existing approval record exists
        const key = `${appt._id.toString()}_${emp._id.toString()}`;
        const wh = workHourMap.get(key);

        const currentStatus = wh ? wh.status : 'Pending';
        const breakMins = wh ? wh.breakMinutes : 0;
        const actualSTime = wh ? wh.actualStartTime || sTime : sTime;
        const actualETime = wh ? wh.actualEndTime || eTime : eTime;

        // Calculate approved/actual hours
        let appHours = wh?.approvedHours;
        if (appHours === undefined || appHours === null) {
          const rawDuration = computeHours(actualSTime, actualETime);
          const breakHours = breakMins / 60;
          appHours = Math.max(0, Number((rawDuration - breakHours).toFixed(2)));
        }

        const overtimeHrs = wh ? wh.overtimeHours : 0;

        const shiftItem = {
          _id: wh?._id || `${appt._id}_${emp._id}`,
          isPersisted: !!wh,
          appointmentId: appt._id,
          employabilityId: emp._id,
          jobId: apptJob?._id || null,
          jobIndex: apptJob?.index || 'N/A',
          customerName: apptJob?.customer
            ? `${apptJob.customer.firstName || ''} ${apptJob.customer.lastName || ''}`.trim() ||
              apptJob.customer.companyName ||
              'Valued Client'
            : 'General Appointment',
          workLocation:
            appt.workLocation ||
            (apptJob?.load?.city ? `${apptJob.load.city} → ${apptJob.unload?.city || ''}` : 'On Site'),
          appointmentType: appt.appointmentType || 'Standard Shift',
          departureLocation: appt.departureLocation || '',
          date: apptDate,
          employeeId: empId,
          employeeName: empName,
          employeeRole: empRole,
          employeePhoto: empPhoto,
          workType: emp.workType || 'Mover',
          vehicle: emp.vehicle || null,
          scheduledStartTime: sTime,
          scheduledEndTime: eTime,
          scheduledHours: scheduledDuration,
          actualStartTime: actualSTime,
          actualEndTime: actualETime,
          breakMinutes: breakMins,
          approvedHours: appHours,
          overtimeHours: overtimeHrs,
          status: currentStatus,
          notes: wh?.notes || '',
          rejectionReason: wh?.rejectionReason || '',
          approvedBy: wh?.approvedBy ? { _id: wh.approvedBy._id, username: wh.approvedBy.username } : null,
          approvedAt: wh?.approvedAt || null,
        };

        shiftRecords.push(shiftItem);
      });
    });

    const isStaffOrAgent = req.user && req.user.role !== 'Admin';
    const effectiveEmployeeId = isStaffOrAgent
      ? (req.user.userId || req.user._id)
      : (employeeId && employeeId !== 'all' ? employeeId : null);

    // Filter by Employee ID if specified or if staff/agent
    let filteredShifts = shiftRecords;
    if (effectiveEmployeeId) {
      filteredShifts = filteredShifts.filter(
        (s) => s.employeeId && s.employeeId.toString() === effectiveEmployeeId.toString()
      );
    }

    // Filter by Status if specified
    if (status && status !== 'All') {
      filteredShifts = filteredShifts.filter((s) => s.status.toLowerCase() === status.toLowerCase());
    }

    // Filter by Search Query
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filteredShifts = filteredShifts.filter(
        (s) =>
          s.employeeName.toLowerCase().includes(q) ||
          s.jobIndex.toLowerCase().includes(q) ||
          s.customerName.toLowerCase().includes(q) ||
          s.workType.toLowerCase().includes(q)
      );
    }

    // Compute metrics
    let totalLoggedHours = 0;
    let pendingHours = 0;
    let pendingCount = 0;
    let approvedHours = 0;
    let approvedCount = 0;
    let rejectedHours = 0;
    let rejectedCount = 0;
    let overtimeHours = 0;

    filteredShifts.forEach((s) => {
      const hrs = s.approvedHours || s.scheduledHours || 0;
      totalLoggedHours += hrs;
      overtimeHours += s.overtimeHours || 0;

      if (s.status === 'Approved') {
        approvedHours += hrs;
        approvedCount += 1;
      } else if (s.status === 'Rejected') {
        rejectedHours += hrs;
        rejectedCount += 1;
      } else {
        pendingHours += hrs;
        pendingCount += 1;
      }
    });

    res.status(200).json({
      success: true,
      count: filteredShifts.length,
      data: filteredShifts,
      summary: {
        totalShifts: filteredShifts.length,
        totalLoggedHours: Number(totalLoggedHours.toFixed(2)),
        pendingHours: Number(pendingHours.toFixed(2)),
        pendingCount,
        approvedHours: Number(approvedHours.toFixed(2)),
        approvedCount,
        rejectedHours: Number(rejectedHours.toFixed(2)),
        rejectedCount,
        overtimeHours: Number(overtimeHours.toFixed(2)),
      },
    });
  } catch (error) {
    console.error('Error in getShiftsForApproval:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 2. APPROVE SINGLE OR BULK SHIFTS
exports.approveShifts = async (req, res) => {
  try {
    const { shifts, notes } = req.body; // array of shifts to approve
    const approvedBy = req.user?.userId || req.user?._id || null;

    if (!Array.isArray(shifts) || shifts.length === 0) {
      return res.status(400).json({ success: false, message: 'No shifts provided for approval' });
    }

    const approvedResults = [];

    for (const item of shifts) {
      const {
        appointmentId,
        employabilityId,
        jobId,
        employeeId,
        employeeName,
        workType,
        date,
        scheduledStartTime,
        scheduledEndTime,
        scheduledHours,
        actualStartTime,
        actualEndTime,
        breakMinutes = 0,
        approvedHours,
        overtimeHours = 0,
        notes: itemNotes,
      } = item;

      if (!appointmentId || !employabilityId) continue;

      const rawDuration = computeHours(
        actualStartTime || scheduledStartTime,
        actualEndTime || scheduledEndTime
      );
      const finalHours =
        approvedHours !== undefined
          ? approvedHours
          : Math.max(0, Number((rawDuration - breakMinutes / 60).toFixed(2)));

      const updateData = {
        appointmentId,
        employabilityId,
        jobId: jobId || null,
        employeeId: employeeId || null,
        employeeName: employeeName || '',
        workType: workType || 'Mover',
        date: date ? new Date(date) : new Date(),
        scheduledStartTime: scheduledStartTime ? new Date(scheduledStartTime) : null,
        scheduledEndTime: scheduledEndTime ? new Date(scheduledEndTime) : null,
        scheduledHours: scheduledHours || rawDuration,
        actualStartTime: actualStartTime ? new Date(actualStartTime) : scheduledStartTime,
        actualEndTime: actualEndTime ? new Date(actualEndTime) : scheduledEndTime,
        breakMinutes: Number(breakMinutes) || 0,
        approvedHours: Number(finalHours),
        overtimeHours: Number(overtimeHours) || 0,
        status: 'Approved',
        notes: itemNotes || notes || '',
        approvedBy,
        approvedAt: new Date(),
      };

      const doc = await WorkHour.findOneAndUpdate(
        { appointmentId, employabilityId },
        { $set: updateData },
        { new: true, upsert: true }
      );

      approvedResults.push(doc);
    }

    res.status(200).json({
      success: true,
      message: `Successfully approved ${approvedResults.length} shift(s)`,
      count: approvedResults.length,
      data: approvedResults,
    });
  } catch (error) {
    console.error('Error in approveShifts:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 3. REJECT SHIFT
exports.rejectShift = async (req, res) => {
  try {
    const { appointmentId, employabilityId, employeeId, rejectionReason, notes } = req.body;
    const approvedBy = req.user?.userId || req.user?._id || null;

    if (!appointmentId || !employabilityId) {
      return res.status(400).json({ success: false, message: 'Appointment and shift ID are required' });
    }

    const doc = await WorkHour.findOneAndUpdate(
      { appointmentId, employabilityId },
      {
        $set: {
          appointmentId,
          employabilityId,
          employeeId,
          status: 'Rejected',
          rejectionReason: rejectionReason || 'Rejected by supervisor',
          notes: notes || '',
          approvedBy,
          approvedAt: new Date(),
        },
      },
      { new: true, upsert: true }
    );

    res.status(200).json({
      success: true,
      message: 'Shift rejected successfully',
      data: doc,
    });
  } catch (error) {
    console.error('Error in rejectShift:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 4. ADJUST SHIFT HOURS & TIMES
exports.adjustShiftHours = async (req, res) => {
  try {
    const {
      appointmentId,
      employabilityId,
      jobId,
      employeeId,
      employeeName,
      workType,
      date,
      actualStartTime,
      actualEndTime,
      breakMinutes = 0,
      approvedHours,
      overtimeHours = 0,
      notes,
      status = 'Approved',
    } = req.body;

    const approvedBy = req.user?.userId || req.user?._id || null;

    if (!appointmentId || !employabilityId) {
      return res.status(400).json({ success: false, message: 'Appointment and shift ID are required' });
    }

    const rawDuration = computeHours(actualStartTime, actualEndTime);
    const finalHours =
      approvedHours !== undefined
        ? Number(approvedHours)
        : Math.max(0, Number((rawDuration - (Number(breakMinutes) || 0) / 60).toFixed(2)));

    const updateData = {
      appointmentId,
      employabilityId,
      jobId: jobId || null,
      employeeId: employeeId || null,
      employeeName: employeeName || '',
      workType: workType || 'Mover',
      date: date ? new Date(date) : new Date(),
      actualStartTime: actualStartTime ? new Date(actualStartTime) : null,
      actualEndTime: actualEndTime ? new Date(actualEndTime) : null,
      breakMinutes: Number(breakMinutes) || 0,
      approvedHours: finalHours,
      overtimeHours: Number(overtimeHours) || 0,
      notes: notes || '',
      status,
      approvedBy: status === 'Approved' ? approvedBy : undefined,
      approvedAt: status === 'Approved' ? new Date() : undefined,
    };

    const doc = await WorkHour.findOneAndUpdate(
      { appointmentId, employabilityId },
      { $set: updateData },
      { new: true, upsert: true }
    );

    res.status(200).json({
      success: true,
      message: 'Shift hours adjusted successfully',
      data: doc,
    });
  } catch (error) {
    console.error('Error in adjustShiftHours:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 5. GET HOURS OVERVIEW (ANALYTICS & EMPLOYEE SUMMARY)
exports.getHoursOverview = async (req, res) => {
  try {
    const { year, month, startDate, endDate, employeeId } = req.query;

    let start, end;
    if (startDate && endDate) {
      start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
    } else {
      const y = parseInt(year) || new Date().getFullYear();
      if (month !== undefined && month !== '' && month !== 'all') {
        const m = parseInt(month);
        start = new Date(y, m, 1, 0, 0, 0);
        end = new Date(y, m + 1, 0, 23, 59, 59);
      } else {
        start = new Date(y, 0, 1, 0, 0, 0);
        end = new Date(y, 11, 31, 23, 59, 59);
      }
    }

    // Fetch all appointments in window
    const appointments = await Appointment.find({
      date: { $gte: start, $lte: end },
    })
      .populate({
        path: 'assignedEmployees',
        populate: [
          { path: 'employeeId', select: 'username email role photo' },
          { path: 'vehicle', select: 'name licensePlate' },
        ],
      })
      .populate({
        path: 'jobId',
        select: 'index customer load unload status',
        populate: {
          path: 'customer',
          select: 'firstName lastName companyName',
        },
      })
      .sort({ date: 1 });

    const appointmentIds = appointments.map((a) => a._id);
    const workHours = await WorkHour.find({
      appointmentId: { $in: appointmentIds },
    });

    const workHourMap = new Map();
    workHours.forEach((wh) => {
      const key = `${wh.appointmentId.toString()}_${wh.employabilityId.toString()}`;
      workHourMap.set(key, wh);
    });

    // Grouping by employee
    const employeeMap = new Map();

    appointments.forEach((appt) => {
      const apptJob = appt.jobId;

      // Condition: Only include appointments if parent job is completed
      const jobStatus = (apptJob?.status || '').trim().toLowerCase();
      const isJobCompleted = jobStatus === 'completed' || jobStatus === 'complete';
      if (!isJobCompleted) return;

      (appt.assignedEmployees || []).forEach((emp) => {
        if (!emp) return;

        const empIdObj = emp.employeeId;
        const empId = empIdObj?._id ? empIdObj._id.toString() : (emp.employeeId || emp.employeeName);
        const empName = empIdObj?.username || emp.employeeName || 'Staff Member';
        const empEmail = empIdObj?.email || '';
        const empRole = empIdObj?.role || 'Staff';
        const empPhoto = empIdObj?.photo || null;

        const sTime = emp.startTime || appt.startTime;
        const eTime = emp.endTime || appt.endTime;
        const scheduledDuration = computeHours(sTime, eTime);

        const key = `${appt._id.toString()}_${emp._id.toString()}`;
        const wh = workHourMap.get(key);

        const status = wh ? wh.status : 'Pending';
        const breakMins = wh ? wh.breakMinutes : 0;
        const actualSTime = wh?.actualStartTime || sTime;
        const actualETime = wh?.actualEndTime || eTime;
        const approvedHrs =
          wh?.approvedHours !== undefined
            ? wh.approvedHours
            : Math.max(0, Number((computeHours(actualSTime, actualETime) - breakMins / 60).toFixed(2)));
        const overtimeHrs = wh?.overtimeHours || 0;

        if (!employeeMap.has(empId)) {
          employeeMap.set(empId, {
            employeeId: empId,
            employeeName: empName,
            employeeEmail: empEmail,
            employeeRole: empRole,
            employeePhoto: empPhoto,
            totalJobs: 0,
            totalScheduledHours: 0,
            approvedHours: 0,
            overtimeHours: 0,
            pendingHours: 0,
            rejectedHours: 0,
            totalNetApprovedHours: 0,
            shifts: [],
          });
        }

        const record = employeeMap.get(empId);
        record.totalJobs += 1;
        record.totalScheduledHours += scheduledDuration;
        record.overtimeHours += overtimeHrs;

        if (status === 'Approved') {
          record.approvedHours += approvedHrs;
          record.totalNetApprovedHours += approvedHrs + overtimeHrs;
        } else if (status === 'Rejected') {
          record.rejectedHours += approvedHrs;
        } else {
          record.pendingHours += approvedHrs;
        }

        record.shifts.push({
          appointmentId: appt._id,
          employabilityId: emp._id,
          jobIndex: apptJob?.index || 'N/A',
          customerName: apptJob?.customer
            ? `${apptJob.customer.firstName || ''} ${apptJob.customer.lastName || ''}`.trim() ||
              apptJob.customer.companyName ||
              'Client'
            : 'General Appointment',
          date: appt.date,
          workType: emp.workType || 'Mover',
          scheduledHours: scheduledDuration,
          actualStartTime: actualSTime,
          actualEndTime: actualETime,
          breakMinutes: breakMins,
          approvedHours: approvedHrs,
          overtimeHours: overtimeHrs,
          status,
          notes: wh?.notes || '',
        });
      });
    });

    // Convert map to list
    let employeeSummaries = Array.from(employeeMap.values()).map((emp) => ({
      ...emp,
      totalScheduledHours: Number(emp.totalScheduledHours.toFixed(2)),
      approvedHours: Number(emp.approvedHours.toFixed(2)),
      overtimeHours: Number(emp.overtimeHours.toFixed(2)),
      pendingHours: Number(emp.pendingHours.toFixed(2)),
      rejectedHours: Number(emp.rejectedHours.toFixed(2)),
      totalNetApprovedHours: Number(emp.totalNetApprovedHours.toFixed(2)),
    }));

    const isStaffOrAgent = req.user && req.user.role !== 'Admin';
    const effectiveEmployeeId = isStaffOrAgent
      ? (req.user.userId || req.user._id)
      : (employeeId && employeeId !== 'all' ? employeeId : null);

    if (effectiveEmployeeId) {
      employeeSummaries = employeeSummaries.filter(
        (e) => e.employeeId && e.employeeId.toString() === effectiveEmployeeId.toString()
      );
    }

    // Overall KPI metrics
    let totalWorkHours = 0;
    let totalApprovedHours = 0;
    let totalPendingHours = 0;
    let totalOvertimeHours = 0;
    let totalJobsCount = 0;

    employeeSummaries.forEach((e) => {
      totalWorkHours += e.totalScheduledHours;
      totalApprovedHours += e.approvedHours;
      totalPendingHours += e.pendingHours;
      totalOvertimeHours += e.overtimeHours;
      totalJobsCount += e.totalJobs;
    });

    res.status(200).json({
      success: true,
      period: { start, end },
      metrics: {
        activeStaffCount: employeeSummaries.length,
        totalJobsCount,
        totalWorkHours: Number(totalWorkHours.toFixed(2)),
        totalApprovedHours: Number(totalApprovedHours.toFixed(2)),
        totalPendingHours: Number(totalPendingHours.toFixed(2)),
        totalOvertimeHours: Number(totalOvertimeHours.toFixed(2)),
        avgHoursPerStaff:
          employeeSummaries.length > 0
            ? Number((totalApprovedHours / employeeSummaries.length).toFixed(2))
            : 0,
      },
      data: employeeSummaries,
    });
  } catch (error) {
    console.error('Error in getHoursOverview:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
