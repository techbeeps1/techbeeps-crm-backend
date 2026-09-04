const LeaveRequest = require('../models/LeaveRequest');
const LeaveBalance = require('../models/LeaveBalance');
const User = require('../models/user');

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
      employeeId: requestedEmployeeId,
      employeeName: requestedEmployeeName,
    } = req.body;

    const currentUserId = req.user?.id || req.user?.userId || req.user?._id;
    const currentUserRole = req.user?.role;
    const currentUserName = req.user?.username || req.user?.name;

    // Determine target employee
    const targetEmployeeId = (currentUserRole === 'Admin' && requestedEmployeeId)
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

    const existingOverlap = await LeaveRequest.findOne({
      employeeId: targetEmployeeId,
      status: { $in: ['Pending', 'Approved'] },
      startDate: { $lte: rangeEnd },
      endDate: { $gte: rangeStart },
    });

    if (existingOverlap) {
      const existStart = new Date(existingOverlap.startDate).toLocaleDateString('en-GB');
      const existEnd = new Date(existingOverlap.endDate).toLocaleDateString('en-GB');
      return res.status(400).json({
        error: `Leave already exists for this employee on ${existStart}${existEnd !== existStart ? ` — ${existEnd}` : ''} (${existingOverlap.status}). Cannot apply twice for the same date.`,
      });
    }

    // Calculate days based on durationType
    let calculatedDays = 1.0;
    if (durationType === 'Half Day - First Half' || durationType === 'Half Day - Second Half') {
      calculatedDays = 0.5;
    } else if (durationType === 'Full Day') {
      calculatedDays = 1.0;
    } else {
      // Multiple Days: inclusive calendar days (e.g., 04/09 to 06/09 = 3 days)
      const s = new Date(startDate);
      const e = new Date(endDate || startDate);
      const diffTime = e.getTime() - s.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
      calculatedDays = Math.max(1, diffDays);
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

    return res.status(201).json({
      message: 'Leave request submitted successfully',
      data: newRequest,
    });
  } catch (err) {
    console.error('Error creating leave request:', err);
    return res.status(500).json({ error: err.message || 'Server error creating leave request' });
  }
};

// 2. Get list of leave requests (Admins get all, Staff gets their own)
exports.getLeaveRequests = async (req, res) => {
  try {
    const currentUserId = req.user?.id || req.user?.userId || req.user?._id;
    const currentUserRole = req.user?.role;
    const isAdmin = currentUserRole === 'Admin';

    const { status, year, employeeId } = req.query;
    const filter = {};

    if (!isAdmin) {
      // Staff / Agent only see their own requests
      filter.employeeId = currentUserId;
    } else if (employeeId) {
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
    const currentUserId = req.user?.id || req.user?.userId || req.user?._id;
    const currentUserName = req.user?.username || req.user?.name || 'Admin';

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

    // Update Leave Balance if status transitioned to or from Approved
    let balance = await LeaveBalance.findOne({
      employeeId: leaveReq.employeeId,
      year: leaveYear,
    });

    if (!balance) {
      balance = new LeaveBalance({
        employeeId: leaveReq.employeeId,
        employeeName: leaveReq.employeeName,
        year: leaveYear,
        annualEntitlement: 12,
        usedDays: 0,
        unpaidDays: 0,
      });
    }

    const paidDays = leaveReq.paidDays !== undefined ? leaveReq.paidDays : leaveDays;
    const unpaidDays = leaveReq.unpaidDays !== undefined ? leaveReq.unpaidDays : 0;

    // If becoming Approved from another status: add to used and unpaid
    if (status === 'Approved' && prevStatus !== 'Approved') {
      if (paidDays > 0) {
        balance.usedDays = Math.max(0, (balance.usedDays || 0) + paidDays);
        if (!balance.usedBreakdown) balance.usedBreakdown = {};
        balance.usedBreakdown[breakdownField] = Math.max(
          0,
          (balance.usedBreakdown[breakdownField] || 0) + paidDays
        );
      }
      if (unpaidDays > 0) {
        balance.unpaidDays = Math.max(0, (balance.unpaidDays || 0) + unpaidDays);
        if (!balance.usedBreakdown) balance.usedBreakdown = {};
        balance.usedBreakdown.unpaid = Math.max(
          0,
          (balance.usedBreakdown.unpaid || 0) + unpaidDays
        );
      }
      await balance.save();
    }

    // If previously Approved and now changed to Rejected or Cancelled: rollback
    if (prevStatus === 'Approved' && status !== 'Approved') {
      if (paidDays > 0) {
        balance.usedDays = Math.max(0, (balance.usedDays || 0) - paidDays);
        if (!balance.usedBreakdown) balance.usedBreakdown = {};
        balance.usedBreakdown[breakdownField] = Math.max(
          0,
          (balance.usedBreakdown[breakdownField] || 0) - paidDays
        );
      }
      if (unpaidDays > 0) {
        balance.unpaidDays = Math.max(0, (balance.unpaidDays || 0) - unpaidDays);
        if (!balance.usedBreakdown) balance.usedBreakdown = {};
        balance.usedBreakdown.unpaid = Math.max(
          0,
          (balance.usedBreakdown.unpaid || 0) - unpaidDays
        );
      }
      await balance.save();
    }

    return res.status(200).json({
      message: `Leave request has been ${status.toLowerCase()} successfully`,
      data: leaveReq,
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
    const currentUserId = req.user?.id || req.user?.userId || req.user?._id;
    const currentUserRole = req.user?.role;
    const isAdmin = currentUserRole === 'Admin';

    const leaveReq = await LeaveRequest.findById(id);
    if (!leaveReq) {
      return res.status(404).json({ error: 'Leave request not found' });
    }

    // Only applicant or admin can cancel/delete
    if (!isAdmin && String(leaveReq.employeeId) !== String(currentUserId)) {
      return res.status(403).json({ error: 'Access denied: You can only cancel your own leave requests' });
    }

    // Rollback balance if it was approved
    if (leaveReq.status === 'Approved') {
      const leaveYear = new Date(leaveReq.startDate).getFullYear();
      const breakdownField = mapLeaveTypeToField(leaveReq.leaveType);
      const balance = await LeaveBalance.findOne({
        employeeId: leaveReq.employeeId,
        year: leaveYear,
      });
      if (balance) {
        const paidDays = leaveReq.paidDays !== undefined ? leaveReq.paidDays : (leaveReq.totalDays || 1);
        const unpaidDays = leaveReq.unpaidDays !== undefined ? leaveReq.unpaidDays : 0;
        if (paidDays > 0) {
          balance.usedDays = Math.max(0, (balance.usedDays || 0) - paidDays);
          if (balance.usedBreakdown) {
            balance.usedBreakdown[breakdownField] = Math.max(
              0,
              (balance.usedBreakdown[breakdownField] || 0) - paidDays
            );
          }
        }
        if (unpaidDays > 0) {
          balance.unpaidDays = Math.max(0, (balance.unpaidDays || 0) - unpaidDays);
          if (balance.usedBreakdown) {
            balance.usedBreakdown.unpaid = Math.max(
              0,
              (balance.usedBreakdown.unpaid || 0) - unpaidDays
            );
          }
        }
        await balance.save();
      }
    }

    await LeaveRequest.findByIdAndDelete(id);

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
    const currentUserId = req.user?.id || req.user?.userId || req.user?._id;
    const currentUserRole = req.user?.role;
    const isAdmin = currentUserRole === 'Admin';
    const year = parseInt(req.query.year) || new Date().getFullYear();

    if (!isAdmin) {
      // Staff only sees their own leave card
      let balance = await LeaveBalance.findOne({ employeeId: currentUserId, year });
      if (!balance) {
        const user = await User.findById(currentUserId);
        balance = new LeaveBalance({
          employeeId: currentUserId,
          employeeName: user?.username || 'Staff',
          year,
          annualEntitlement: 12,
          usedDays: 0,
          unpaidDays: 0,
        });
        await balance.save();
      }

      const pendingRequests = await LeaveRequest.find({
        employeeId: currentUserId,
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
    const empFilter = { role: { $in: ['Staff', 'Agent', 'Admin'] } };
    if (req.query.employeeId) {
      empFilter._id = req.query.employeeId;
    }
    const employees = await User.find(empFilter).select(
      'username email role telephone contract'
    );

    const cards = [];
    for (const emp of employees) {
      let balance = await LeaveBalance.findOne({ employeeId: emp._id, year });
      if (!balance) {
        balance = new LeaveBalance({
          employeeId: emp._id,
          employeeName: emp.username,
          year,
          annualEntitlement: 12,
          usedDays: 0,
          unpaidDays: 0,
        });
        await balance.save();
      }

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
    const currentUserId = req.user?.id || req.user?.userId || req.user?._id;
    const currentUserRole = req.user?.role;
    const isAdmin = currentUserRole === 'Admin';

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
