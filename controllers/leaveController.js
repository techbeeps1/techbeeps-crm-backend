const LeaveRequest = require('../models/LeaveRequest');
const LeaveBalance = require('../models/LeaveBalance');
const User = require('../models/user');
const Appointment = require('../models/appointmentModel');

// Helper to calculate working days from employee's roster / availability
const calculateWorkingDaysFromRoster = async (employeeId, startDate, endDate) => {
  let availability = null;
  try {
    const Availability = require('../models/availabilityModel');
    availability = await Availability.findOne({ employeeId });
  } catch (e) {
    console.warn('Availability model lookup failed:', e.message);
  }

  // Roster schedule: Monday to Friday enabled by default, Saturday/Sunday disabled unless staff roster enables them
  const schedule = availability?.weeklySchedule || {
    monday: { enabled: true },
    tuesday: { enabled: true },
    wednesday: { enabled: true },
    thursday: { enabled: true },
    friday: { enabled: true },
    saturday: { enabled: false },
    sunday: { enabled: false },
  };

  const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const exceptionsMap = {};
  if (availability?.sporadicExceptions && Array.isArray(availability.sporadicExceptions)) {
    for (const ex of availability.sporadicExceptions) {
      if (ex.date) exceptionsMap[ex.date] = ex.type;
    }
  }

  let count = 0;
  let cur = new Date(startDate);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(endDate || startDate);
  end.setHours(0, 0, 0, 0);

  while (cur <= end) {
    const dateStr = cur.toISOString().slice(0, 10);
    if (exceptionsMap[dateStr]) {
      if (exceptionsMap[dateStr] === 'available') count++;
    } else {
      const dayKey = dayKeys[cur.getDay()];
      if (schedule[dayKey] && schedule[dayKey].enabled) {
        count++;
      }
    }
    cur.setDate(cur.getDate() + 1);
  }
  return count;
};

// Helper to reconcile employee leave balance directly with approved request ledger
const reconcileEmployeeLeaveBalance = async (employeeId, year) => {
  const targetYear = parseInt(year) || new Date().getFullYear();
  const startOfYear = new Date(`${targetYear}-01-01T00:00:00.000Z`);
  const endOfYear = new Date(`${targetYear}-12-31T23:59:59.999Z`);

  const approvedRequests = await LeaveRequest.find({
    employeeId,
    status: 'Approved',
    startDate: { $gte: startOfYear, $lte: endOfYear },
  }).sort({ startDate: 1 });

  let totalApprovedPaidDays = 0;
  let totalApprovedUnpaidDays = 0;
  const breakdown = {
    annual: 0,
    sick: 0,
    casual: 0,
    emergency: 0,
    unpaid: 0,
    maternity: 0,
  };

  for (const req of approvedRequests) {
    const paid = typeof req.paidDays === 'number' ? req.paidDays : (req.totalDays || 0);
    const unpaid = typeof req.unpaidDays === 'number' ? req.unpaidDays : 0;
    totalApprovedPaidDays += paid;
    totalApprovedUnpaidDays += unpaid;

    const field = mapLeaveTypeToField(req.leaveType);
    breakdown[field] = (breakdown[field] || 0) + paid;
    if (unpaid > 0) {
      breakdown.unpaid = (breakdown.unpaid || 0) + unpaid;
    }
  }

  let balance = await LeaveBalance.findOne({ employeeId, year: targetYear });
  if (!balance) {
    const user = await User.findById(employeeId);
    balance = new LeaveBalance({
      employeeId,
      employeeName: user?.username || 'Staff',
      year: targetYear,
      annualEntitlement: 12,
      usedDays: totalApprovedPaidDays,
      unpaidDays: totalApprovedUnpaidDays,
      usedBreakdown: breakdown,
    });
  } else {
    balance.usedDays = totalApprovedPaidDays;
    balance.unpaidDays = totalApprovedUnpaidDays;
    balance.usedBreakdown = breakdown;
  }

  await balance.save();
  return balance;
};

// Helper to map leaveType to balance breakdown field
const mapLeaveTypeToField = (type) => {
  const t = (type || '').toLowerCase();
  if (t.includes('annual') || t.includes('vacation')) return 'annual';
  if (t.includes('sick')) return 'sick';
  if (t.includes('casual')) return 'casual';
  if (t.includes('emergency') || t.includes('personal')) return 'emergency';
  if (t.includes('unpaid')) return 'unpaid';
  if (t.includes('maternity') || t.includes('paternity')) return 'maternity';
  return 'annual';
};

// Helper to check if caller has Admin/HR privileges
const isCallerAdmin = (req) => {
  const role = (
    req.user?.role ||
    req.user?.user?.role ||
    ''
  ).trim().toLowerCase();
  return role === 'admin' || role === 'superadmin' || role === 'hr' || role === 'manager';
};

// Robust helper to check admin privileges with DB fallback if token role is missing
const checkAdminPrivilege = async (req) => {
  if (isCallerAdmin(req)) return true;
  const uid = getCallerId(req);
  if (uid) {
    try {
      const userDoc = await User.findById(uid).select('role');
      const r = (userDoc?.role || '').trim().toLowerCase();
      return r === 'admin' || r === 'superadmin' || r === 'hr' || r === 'manager';
    } catch (e) {
      return false;
    }
  }
  return false;
};

// Helper to get authenticated user ID
const getCallerId = (req) => {
  return (
    req.user?.id ||
    req.user?.userId ||
    req.user?._id ||
    req.user?.user?.id ||
    req.user?.user?.userId ||
    req.user?.user?._id
  );
};

// 1. Submit a new leave request
exports.createLeaveRequest = async (req, res) => {
  try {
    const {
      leaveType,
      durationType,
      startDate,
      endDate,
      totalDays,
      reason,
    } = req.body;

    const currentUserId = getCallerId(req);
    const isAdmin = await checkAdminPrivilege(req);
    const currentUserName = req.user?.username || req.user?.name || req.user?.user?.username;

    const requestedEmployeeId = req.body.employeeId || req.body.requestedEmployeeId;
    const requestedEmployeeName = req.body.employeeName || req.body.requestedEmployeeName;

    // Determine target employee: Admin can apply for any employee; non-admin applies for self
    const targetEmployeeId = (isAdmin && requestedEmployeeId)
      ? requestedEmployeeId
      : currentUserId;

    if (!targetEmployeeId) {
      return res.status(400).json({ error: 'Employee identification is required' });
    }

    const employee = await User.findById(targetEmployeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const targetEmployeeName = employee.username || requestedEmployeeName || currentUserName || 'Employee';

    // 1. Validation: Cannot apply for past dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sDate = new Date(startDate);
    sDate.setHours(0, 0, 0, 0);
    if (sDate < today) {
      return res.status(400).json({
        error: 'Cannot apply for leave on past dates. Please select today or a future date.',
      });
    }

    // 2. Validation: Prevent duplicate / overlapping leave applications for the same dates
    const rangeStart = new Date(startDate);
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(endDate || startDate);
    rangeEnd.setHours(23, 59, 59, 999);

    const existingOverlaps = await LeaveRequest.find({
      employeeId: targetEmployeeId,
      status: { $in: ['Pending', 'Approved'] },
      startDate: { $lte: rangeEnd },
      endDate: { $gte: rangeStart },
    });

    let precedenceNotice = null;

    if (existingOverlaps.length > 0) {
      for (const ex of existingOverlaps) {
        // Exception 1: Allow morning half day and afternoon half day to coexist on the exact same date
        const isSingleDayRequest = rangeStart.getTime() === rangeEnd.getTime() || (endDate && startDate === endDate);
        const isExSingleDay = new Date(ex.startDate).toDateString() === new Date(ex.endDate).toDateString();
        const isOppositeHalfDay =
          (durationType === 'Half Day - First Half' && ex.durationType === 'Half Day - Second Half') ||
          (durationType === 'Half Day - Second Half' && ex.durationType === 'Half Day - First Half');

        if (isSingleDayRequest && isExSingleDay && isOppositeHalfDay) {
          continue; // Valid non-conflicting partial days!
        }

        // Exception 2: Sick Leave takes statutory precedence over Annual / Vacation leave
        if (leaveType === 'Sick Leave' && ex.leaveType === 'Annual / Vacation') {
          precedenceNotice = 'Sick Leave takes precedence over approved Vacation. Upon approval, overlapping vacation days will be credited back to annual quota.';
          continue;
        }

        const existStart = new Date(ex.startDate).toLocaleDateString('en-GB');
        const existEnd = new Date(ex.endDate).toLocaleDateString('en-GB');
        return res.status(400).json({
          error: `Leave already exists for this employee on ${existStart}${existEnd !== existStart ? ` — ${existEnd}` : ''} (${ex.status}, ${ex.leaveType}, ${ex.durationType}). Cannot apply twice for conflicting dates.`,
        });
      }
    }

    // Calculate days based on durationType and employee's roster schedule
    let calculatedDays = 1.0;
    if (durationType === 'Half Day - First Half' || durationType === 'Half Day - Second Half') {
      calculatedDays = 0.5;
    } else if (durationType === 'Full Day') {
      const isWorkDay = await calculateWorkingDaysFromRoster(targetEmployeeId, startDate, startDate);
      if (isWorkDay === 0) {
        return res.status(400).json({
          error: 'The selected date is not a scheduled working day according to the employee roster.',
        });
      }
      calculatedDays = 1.0;
    } else {
      calculatedDays = await calculateWorkingDaysFromRoster(targetEmployeeId, startDate, endDate);
      if (calculatedDays === 0) {
        return res.status(400).json({
          error: 'No scheduled working shifts found in the selected date range for this employee.',
        });
      }
    }

    // Ensure leave balance record exists
    const currentYear = new Date(startDate).getFullYear() || new Date().getFullYear();
    let balance = await LeaveBalance.findOne({ employeeId: targetEmployeeId, year: currentYear });
    if (!balance) {
      balance = new LeaveBalance({
        employeeId: targetEmployeeId,
        employeeName: targetEmployeeName,
        year: currentYear,
        annualEntitlement: 12,
        usedDays: 0,
        unpaidDays: 0,
      });
      await balance.save();
    }

    // Automatic calculation of Paid vs Non-Paid (Unpaid) Days
    const remainingPaid = Math.max(0, (balance.annualEntitlement || 12) - (balance.usedDays || 0));
    let paidDays = 0;
    let unpaidDays = 0;

    if (leaveType === 'Unpaid Leave') {
      paidDays = 0;
      unpaidDays = calculatedDays;
    } else {
      if (remainingPaid >= calculatedDays) {
        paidDays = calculatedDays;
        unpaidDays = 0;
      } else if (remainingPaid > 0) {
        paidDays = remainingPaid;
        unpaidDays = calculatedDays - remainingPaid;
      } else {
        // Paid quota exhausted: automatically apply as Non-Paid / Unpaid leave
        paidDays = 0;
        unpaidDays = calculatedDays;
      }
    }

    // Create the leave request
    const newRequest = new LeaveRequest({
      employeeId: targetEmployeeId,
      employeeName: targetEmployeeName,
      leaveType,
      durationType,
      startDate: new Date(startDate),
      endDate: new Date(endDate || startDate),
      totalDays: calculatedDays,
      paidDays,
      unpaidDays,
      reason,
      status: 'Pending',
    });

    await newRequest.save();

    // Check for conflicting appointments during this period
    let warning;
    let appointmentConflicts = [];
    try {
      appointmentConflicts = await Appointment.find({
        assignedEmployees: targetEmployeeId,
        date: { $gte: rangeStart, $lte: rangeEnd },
        status: { $in: ['Draft', 'Scheduled'] },
      }).select('date appointmentType notes').lean();

      if (appointmentConflicts.length > 0) {
        warning = `Employee has ${appointmentConflicts.length} active scheduled appointment(s) during this leave period.`;
      }
    } catch (schedErr) {
      console.warn('Could not check appointment conflicts:', schedErr.message);
    }

    return res.status(201).json({
      message: 'Leave request submitted successfully',
      data: newRequest,
      warning,
      appointmentConflicts: appointmentConflicts.length > 0 ? appointmentConflicts : undefined,
    });
  } catch (err) {
    console.error('Error creating leave request:', err);
    return res.status(500).json({ error: err.message || 'Server error creating leave request' });
  }
};

// 2. Get list of leave requests (Admins get all, Staff gets their own)
exports.getLeaveRequests = async (req, res) => {
  try {
    const currentUserId = getCallerId(req);
    const isAdmin = await checkAdminPrivilege(req);

    const { status, year, employeeId } = req.query;
    const filter = {};

    if (!isAdmin) {
      // Staff / Agent only see their own requests
      filter.employeeId = currentUserId;
    } else if (employeeId && employeeId !== 'all') {
      filter.employeeId = employeeId;
    }

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (year) {
      const startOfYear = new Date(`${year}-01-01T00:00:00.000Z`);
      const endOfYear = new Date(`${year}-12-31T23:59:59.999Z`);
      filter.startDate = { $gte: startOfYear, $lte: endOfYear };
    }

    const requests = await LeaveRequest.find(filter)
      .populate('employeeId', 'username email role telephone contract skills')
      .populate('reviewedBy', 'username role')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: requests.length,
      data: requests,
    });
  } catch (err) {
    console.error('Error fetching leave requests:', err);
    return res.status(500).json({ error: err.message || 'Server error fetching leave requests' });
  }
};
// 3. Admin approve or reject leave request
exports.updateLeaveStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reviewerComment } = req.body;
    const currentUserId = getCallerId(req);
    const currentUserName = req.user?.username || req.user?.name || req.user?.user?.username || 'Admin';

    if (!['Approved', 'Rejected', 'Cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const leaveReq = await LeaveRequest.findById(id);
    if (!leaveReq) {
      return res.status(404).json({ error: 'Leave request not found' });
    }

    const prevStatus = leaveReq.status;
    const leaveDays = leaveReq.totalDays || 1;
    const leaveYear = new Date(leaveReq.startDate).getFullYear();
    const breakdownField = mapLeaveTypeToField(leaveReq.leaveType);

    // Update leave request document
    leaveReq.status = status;
    leaveReq.reviewedBy = currentUserId;
    leaveReq.reviewerName = currentUserName;
    leaveReq.reviewerComment = reviewerComment || (status === 'Approved' ? 'Approved by Admin' : 'Rejected');
    leaveReq.reviewedAt = new Date();

    await leaveReq.save();

    // Overlap Precedence Handling:
    // If approving Sick Leave, adjust overlapping Approved Annual / Vacation leaves so vacation days are not double deducted
    if (status === 'Approved' && leaveReq.leaveType === 'Sick Leave') {
      try {
        const overlappingVacations = await LeaveRequest.find({
          _id: { $ne: leaveReq._id },
          employeeId: leaveReq.employeeId,
          leaveType: 'Annual / Vacation',
          status: 'Approved',
          startDate: { $lte: leaveReq.endDate },
          endDate: { $gte: leaveReq.startDate },
        });

        for (const vac of overlappingVacations) {
          const overlapStart = new Date(Math.max(new Date(vac.startDate).getTime(), new Date(leaveReq.startDate).getTime()));
          const overlapEnd = new Date(Math.min(new Date(vac.endDate).getTime(), new Date(leaveReq.endDate).getTime()));
          const overlapDays = await calculateWorkingDaysFromRoster(leaveReq.employeeId, overlapStart, overlapEnd);
          if (overlapDays > 0) {
            vac.totalDays = Math.max(0, (vac.totalDays || 0) - overlapDays);
            vac.paidDays = Math.max(0, (vac.paidDays || 0) - overlapDays);
            vac.reviewerComment = (vac.reviewerComment ? vac.reviewerComment + '; ' : '') +
              `Adjusted: ${overlapDays} day(s) re-credited due to approved Sick Leave`;
            await vac.save();
          }
        }
      } catch (overlapErr) {
        console.warn('Error adjusting overlapping vacation leaves:', overlapErr.message);
      }
    }

    // Always reconcile balance directly from the approved request ledger to ensure 100% precision
    await reconcileEmployeeLeaveBalance(leaveReq.employeeId, leaveYear);

    // Check for conflicting appointments if approving
    let warning;
    if (status === 'Approved') {
      try {
        const appointmentConflicts = await Appointment.find({
          assignedEmployees: leaveReq.employeeId,
          date: { $gte: leaveReq.startDate, $lte: leaveReq.endDate },
          status: { $in: ['Draft', 'Scheduled'] },
        }).select('date appointmentType notes').lean();

        if (appointmentConflicts.length > 0) {
          warning = `Approved. Notice: Employee is assigned to ${appointmentConflicts.length} active appointment(s) during this period.`;
        }
      } catch (e) {
        console.warn('Could not check appointment conflicts:', e.message);
      }
    }

    return res.status(200).json({
      message: `Leave request ${status.toLowerCase()} successfully`,
      data: leaveReq,
      warning,
    });
  } catch (err) {
    console.error('Error updating leave status:', err);
    return res.status(500).json({ error: err.message || 'Server error updating leave status' });
  }
};

// 4. Cancel / Delete a leave request
exports.deleteLeaveRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = getCallerId(req);
    const isAdmin = await checkAdminPrivilege(req);

    const leaveReq = await LeaveRequest.findById(id);
    if (!leaveReq) {
      return res.status(404).json({ error: 'Leave request not found' });
    }

    // Only applicant or admin can cancel/delete
    if (!isAdmin && String(leaveReq.employeeId) !== String(currentUserId)) {
      return res.status(403).json({ error: 'Access denied: You can only cancel your own leave requests' });
    }

    const leaveYear = new Date(leaveReq.startDate).getFullYear();
    const empId = leaveReq.employeeId;

    await LeaveRequest.findByIdAndDelete(id);

    // Reconcile balance with remaining approved requests ledger
    await reconcileEmployeeLeaveBalance(empId, leaveYear);

    return res.status(200).json({
      message: 'Leave request cancelled / deleted successfully',
      id,
    });
  } catch (err) {
    console.error('Error deleting leave request:', err);
    return res.status(500).json({ error: err.message || 'Server error deleting leave request' });
  }
};

// 5. Get Leave Balances / Leave Cards
exports.getLeaveBalances = async (req, res) => {
  try {
    const currentUserId = getCallerId(req);
    const isAdmin = await checkAdminPrivilege(req);
    const year = parseInt(req.query.year) || new Date().getFullYear();

    if (!isAdmin || (req.query.employeeId && req.query.employeeId !== 'all')) {
      const targetEmpId = (!isAdmin) ? currentUserId : req.query.employeeId;
      // Reconcile with ledger first to ensure 100% accurate count
      let balance = await reconcileEmployeeLeaveBalance(targetEmpId, year);

      const pendingRequests = await LeaveRequest.find({
        employeeId: targetEmpId,
        status: 'Pending',
      });
      const pendingDays = pendingRequests.reduce((acc, r) => acc + (r.totalDays || 0), 0);

      const balanceObj = balance.toObject();
      balanceObj.pendingDays = pendingDays;
      balanceObj.remainingDays = Math.max(
        0,
        (balanceObj.annualEntitlement || 12) - (balanceObj.usedDays || 0)
      );

      return res.status(200).json({
        success: true,
        data: [balanceObj],
      });
    }

    // Admin sees all employees' Leave Cards (or single employee if employeeId specified)
    const empFilter = {};
    if (req.query.employeeId && req.query.employeeId !== 'all') {
      empFilter._id = req.query.employeeId;
    }
    const employees = await User.find(empFilter).select(
      'username email role telephone contract'
    );

    const cards = [];
    for (const emp of employees) {
      let balance = await reconcileEmployeeLeaveBalance(emp._id, year);

      // Count pending days
      const pendingRequests = await LeaveRequest.find({
        employeeId: emp._id,
        status: 'Pending',
      });
      const pendingDays = pendingRequests.reduce((acc, r) => acc + (r.totalDays || 0), 0);

      const cardObj = balance.toObject();
      cardObj.employee = emp;
      cardObj.pendingDays = pendingDays;
      cardObj.remainingDays = Math.max(
        0,
        (cardObj.annualEntitlement || 12) - (cardObj.usedDays || 0)
      );

      cards.push(cardObj);
    }

    return res.status(200).json({
      success: true,
      count: cards.length,
      data: cards,
    });
  } catch (err) {
    console.error('Error fetching leave balances:', err);
    return res.status(500).json({ error: err.message || 'Server error fetching leave balances' });
  }
};

// 6. Admin update employee's annual leave quotas
exports.updateLeaveBalance = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { annualEntitlement, notes, year } = req.body;
    const targetYear = parseInt(year) || new Date().getFullYear();

    let balance = await LeaveBalance.findOne({ employeeId, year: targetYear });
    if (!balance) {
      const user = await User.findById(employeeId);
      balance = new LeaveBalance({
        employeeId,
        employeeName: user?.username || 'Employee',
        year: targetYear,
        annualEntitlement: 12,
        usedDays: 0,
        unpaidDays: 0,
      });
    }

    if (annualEntitlement !== undefined) balance.annualEntitlement = parseFloat(annualEntitlement);
    if (notes !== undefined) balance.notes = notes;

    await balance.save();

    return res.status(200).json({
      message: 'Employee leave quota updated successfully',
      data: balance,
    });
  } catch (err) {
    console.error('Error updating leave balance:', err);
    return res.status(500).json({ error: err.message || 'Server error updating leave balance' });
  }
};

// 7. Summary metrics (Total pending, approved this month, on leave today)
exports.getLeaveSummary = async (req, res) => {
  try {
    const currentUserId = getCallerId(req);
    const isAdmin = await checkAdminPrivilege(req);

    const baseFilter = isAdmin ? {} : { employeeId: currentUserId };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [pendingCount, approvedThisMonth, onLeaveToday, totalRequests] = await Promise.all([
      LeaveRequest.countDocuments({ ...baseFilter, status: 'Pending' }),
      LeaveRequest.countDocuments({
        ...baseFilter,
        status: 'Approved',
        startDate: { $gte: firstDayOfMonth },
      }),
      LeaveRequest.countDocuments({
        ...baseFilter,
        status: 'Approved',
        startDate: { $lte: today },
        endDate: { $gte: today },
      }),
      LeaveRequest.countDocuments(baseFilter),
    ]);

    return res.status(200).json({
      success: true,
      pendingCount,
      approvedThisMonth,
      onLeaveToday,
      totalRequests,
    });
  } catch (err) {
    console.error('Error fetching leave summary:', err);
    return res.status(500).json({ error: err.message || 'Server error fetching leave summary' });
  }
};

// 8. Explicit endpoint to reconcile balances with approved request ledger
exports.reconcileBalances = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const year = parseInt(req.body.year || req.query.year) || new Date().getFullYear();
    const isAdmin = await checkAdminPrivilege(req);
    const callerId = getCallerId(req);

    const targetEmpId = (isAdmin && employeeId && employeeId !== 'all') ? employeeId : (isAdmin ? 'all' : callerId);

    if (targetEmpId !== 'all') {
      const reconciled = await reconcileEmployeeLeaveBalance(targetEmpId, year);
      return res.status(200).json({
        success: true,
        message: 'Leave balance reconciled successfully with approved request ledger',
        data: reconciled,
      });
    }

    const allUsers = await User.find({}).select('_id');
    const results = [];
    for (const u of allUsers) {
      const b = await reconcileEmployeeLeaveBalance(u._id, year);
      results.push(b);
    }

    return res.status(200).json({
      success: true,
      message: `Reconciled ${results.length} employee balances with approved request ledger`,
      count: results.length,
      data: results,
    });
  } catch (err) {
    console.error('Error reconciling balances:', err);
    return res.status(500).json({ error: err.message || 'Error reconciling leave balances' });
  }
};
