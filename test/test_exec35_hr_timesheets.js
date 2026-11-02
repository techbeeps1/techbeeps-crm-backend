const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const BASE_URL = 'http://localhost:8080';
const User = require('../models/user');
const Availability = require('../models/availabilityModel');
const LeaveRequest = require('../models/LeaveRequest');
const LeaveBalance = require('../models/LeaveBalance');
const WorkHour = require('../models/workHourModel');
const Invoice = require('../models/invoice');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passCount++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failCount++;
  }
}

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function runTests() {
  console.log('===============================================================');
  console.log('EXEC-35 TEST SUITE: HR AVAILABILITY, BALANCES & TIMESHEETS');
  console.log('===============================================================');

  const createdUserIds = [];
  const createdLeaveIds = [];
  const createdWorkHourIds = [];
  const createdAvailabilityIds = [];
  const createdBalanceIds = [];

  try {
    // 0. Connect DB & Setup Synthetic Users
    await mongoose.connect(process.env.MONGO_URI);
    console.log('[Setup] Connected to MongoDB');

    const jwtSecret = process.env.JWT_SECRET || 'techbeeps_crm_default_jwt_secret_key_2026';

    // Synthetic Staff User
    const staffId = new mongoose.Types.ObjectId();
    const staffUser = new User({
      _id: staffId,
      username: `synth_staff_exec35_${Date.now()}`,
      email: `synth_staff_${Date.now()}@example.com`,
      password: 'SyntheticStaffPassword123!',
      role: 'Staff',
      isActive: true,
    });
    await staffUser.save();
    createdUserIds.push(staffId);

    const staffToken = jwt.sign(
      { userId: staffId.toString(), role: 'Staff', username: staffUser.username },
      jwtSecret,
      { expiresIn: '1h' }
    );
    const staffAuth = {
      headers: { Authorization: `Bearer ${staffToken}` },
    };

    // Synthetic Admin User
    const adminId = new mongoose.Types.ObjectId();
    const adminUser = new User({
      _id: adminId,
      username: `synth_admin_exec35_${Date.now()}`,
      email: `synth_admin_${Date.now()}@example.com`,
      password: 'SyntheticAdminPassword123!',
      role: 'Admin',
      isActive: true,
    });
    await adminUser.save();
    createdUserIds.push(adminId);

    const adminToken = jwt.sign(
      { userId: adminId.toString(), role: 'Admin', username: adminUser.username },
      jwtSecret,
      { expiresIn: '1h' }
    );
    const adminAuth = {
      headers: { Authorization: `Bearer ${adminToken}` },
    };

    // Standard Staff Working Roster: Mon-Fri enabled, Sat-Sun disabled
    await Availability.findOneAndUpdate(
      { employeeId: staffId },
      {
        $set: {
          employeeId: staffId,
          weeklySchedule: {
            monday: { enabled: true },
            tuesday: { enabled: true },
            wednesday: { enabled: true },
            thursday: { enabled: true },
            friday: { enabled: true },
            saturday: { enabled: false },
            sunday: { enabled: false },
          },
        },
      },
      { upsert: true, new: true }
    );
    createdAvailabilityIds.push(staffId);

    // Initial Leave Balance for targetTestYear: 10 vacation days entitlement
    const currentYear = new Date().getFullYear();
    const targetTestYear = currentYear + 1;

    const initBalance = await LeaveBalance.findOneAndUpdate(
      { employeeId: staffId, year: targetTestYear },
      {
        $set: {
          employeeId: staffId,
          employeeName: staffUser.username,
          year: targetTestYear,
          annualEntitlement: 10,
          usedDays: 0,
          unpaidDays: 0,
          usedBreakdown: { annual: 0, sick: 0, casual: 0, emergency: 0, unpaid: 0, maternity: 0 },
        },
      },
      { upsert: true, new: true }
    );
    createdBalanceIds.push(initBalance._id);

    console.log(`[Setup] Created synthetic staff and admin users with roster & 10d entitlement for ${targetTestYear}`);

    // =================================================================
    // SECTION 1: VACATION BALANCE EXHAUSTION GUARD
    // =================================================================
    console.log('\n--- Section 1: Vacation Balance Exhaustion Guard ---');

    // Find next Monday in November of targetTestYear
    const futureNovStart = new Date(targetTestYear, 10, 1); // Nov 1
    while (futureNovStart.getDay() !== 1) {
      futureNovStart.setDate(futureNovStart.getDate() + 1);
    }

    // 1.1: Staff applying for 15 vacation days (> 10 available) should be blocked with HTTP 422
    // Monday of week 1 to Friday of week 3: 15 working days
    const req15Start = new Date(futureNovStart);
    const req15End = new Date(futureNovStart);
    req15End.setDate(req15Start.getDate() + 18); // 18 calendar days = 15 working days (Mon-Fri, Mon-Fri, Mon-Fri)

    try {
      await axios.post(
        `${BASE_URL}/api/leave/requests`,
        {
          leaveType: 'Annual / Vacation',
          durationType: 'Multiple Days',
          startDate: toDateStr(req15Start),
          endDate: toDateStr(req15End),
          reason: 'Attempting to request 15 days when only 10 days exist',
        },
        staffAuth
      );
      assert(false, 'Expected HTTP 422 for staff vacation request exceeding available balance');
    } catch (err) {
      assert(
        err.response?.status === 422 &&
        err.response?.data?.code === 'INSUFFICIENT_LEAVE_BALANCE',
        `1.1 Staff request > remaining vacation quota rejected with HTTP 422 INSUFFICIENT_LEAVE_BALANCE (Got: ${err.response?.status}, code: ${err.response?.data?.code})`
      );
    }

    // 1.2: Staff applies for 5 vacation days (Mon to Fri = 5 days, within 10 days quota)
    const vac5Start = new Date(futureNovStart);
    const vac5End = new Date(futureNovStart);
    vac5End.setDate(vac5Start.getDate() + 4); // Mon to Fri = exactly 5 working days

    let vac5ReqId = null;
    try {
      const res = await axios.post(
        `${BASE_URL}/api/leave/requests`,
        {
          leaveType: 'Annual / Vacation',
          durationType: 'Multiple Days',
          startDate: toDateStr(vac5Start),
          endDate: toDateStr(vac5End),
          reason: 'Valid 5-day vacation request',
        },
        staffAuth
      );
      assert(res.status === 201 || res.status === 200, `1.2 Staff within quota applied for 5 vacation days (HTTP ${res.status})`);
      vac5ReqId = res.data?.data?._id || res.data?._id;
      if (vac5ReqId) createdLeaveIds.push(vac5ReqId);
    } catch (err) {
      assert(false, `1.2 Failed to apply for 5 vacation days: ${err.message}`);
    }

    // 1.3: Admin approves the 5 vacation days
    if (vac5ReqId) {
      try {
        const approveRes = await axios.put(
          `${BASE_URL}/api/leave/requests/${vac5ReqId}/status`,
          { status: 'Approved', reviewerComment: 'Approved annual leave by manager' },
          adminAuth
        );
        assert(approveRes.status === 200, `1.3 Admin approved 5-day vacation request (HTTP ${approveRes.status})`);

        // Check balance: usedDays should now be 5, remaining should be 5
        const balCheck = await LeaveBalance.findOne({ employeeId: staffId, year: targetTestYear });
        const used = balCheck?.usedDays || 0;
        const ent = balCheck?.annualEntitlement || 10;
        assert(used === 5, `1.3 Vacation usedDays correctly incremented to 5 (Got: ${used})`);
        assert(ent - used === 5, `1.3 Remaining vacation days correctly calculated as 5 (Got: ${ent - used})`);
      } catch (err) {
        assert(false, `1.3 Admin approval of vacation failed: ${err.message}`);
      }
    }

    // 1.4: Staff now requests 6 vacation days (only 5 remaining: Mon to next Mon = 6 working days)
    const vac6Start = new Date(futureNovStart);
    vac6Start.setDate(vac6Start.getDate() + 7); // Next Monday
    const vac6End = new Date(vac6Start);
    vac6End.setDate(vac6Start.getDate() + 7); // Mon to next Mon = 6 working days

    try {
      await axios.post(
        `${BASE_URL}/api/leave/requests`,
        {
          leaveType: 'Annual / Vacation',
          durationType: 'Multiple Days',
          startDate: toDateStr(vac6Start),
          endDate: toDateStr(vac6End),
          reason: 'Attempting to request 6 days when only 5 remaining',
        },
        staffAuth
      );
      assert(false, 'Expected HTTP 422 for staff requesting 6 days with 5 remaining');
    } catch (err) {
      assert(
        err.response?.status === 422 &&
        err.response?.data?.code === 'INSUFFICIENT_LEAVE_BALANCE',
        `1.4 Staff request of 6 days with 5 remaining rejected with HTTP 422 (Available: ${err.response?.data?.remainingVacation})`
      );
    }

    // =================================================================
    // SECTION 2: STATUTORY SICKNESS SEPARATION (WET ARBEID EN ZORG)
    // =================================================================
    console.log('\n--- Section 2: Statutory Sickness Separation (Wet Arbeid en Zorg) ---');

    // 2.1: Staff applies for 4 days of Sick Leave (Mon to Thu = 4 working days)
    const sickStart = new Date(futureNovStart);
    sickStart.setDate(sickStart.getDate() + 14); // Mon of week 3
    const sickEnd = new Date(sickStart);
    sickEnd.setDate(sickStart.getDate() + 3); // Mon to Thu = 4 working days

    let sickReqId = null;
    try {
      const res = await axios.post(
        `${BASE_URL}/api/leave/requests`,
        {
          leaveType: 'Sick Leave',
          durationType: 'Multiple Days',
          startDate: toDateStr(sickStart),
          endDate: toDateStr(sickEnd),
          reason: 'Flu illness recovery (Ziekmelding)',
        },
        staffAuth
      );
      assert(res.status === 201 || res.status === 200, `2.1 Staff applied for 4 days of Sick Leave (HTTP ${res.status})`);
      sickReqId = res.data?.data?._id || res.data?._id;
      if (sickReqId) createdLeaveIds.push(sickReqId);
    } catch (err) {
      assert(false, `2.1 Failed to apply for Sick Leave: ${err.message}`);
    }

    // 2.2: Admin approves the Sick Leave request
    if (sickReqId) {
      try {
        const approveSick = await axios.put(
          `${BASE_URL}/api/leave/requests/${sickReqId}/status`,
          { status: 'Approved', reviewerComment: 'Statutory medical leave verified' },
          adminAuth
        );
        assert(approveSick.status === 200, `2.2 Admin approved Sick Leave request (HTTP ${approveSick.status})`);

        // 2.3: STATUTORY CHECK: usedDays must NOT include sickness!
        // It must STILL be 5, and usedBreakdown.sick must be 4!
        const postSickBalance = await LeaveBalance.findOne({ employeeId: staffId, year: targetTestYear });
        const postUsed = postSickBalance?.usedDays || 0;
        const postSick = postSickBalance?.usedBreakdown?.sick || 0;
        const postAnnual = postSickBalance?.usedBreakdown?.annual || 0;

        assert(
          postUsed === 5,
          `2.3 Statutory separation verified: balance.usedDays is strictly ${postUsed} (sickness DID NOT consume annual quota!)`
        );
        assert(
          postSick === 4,
          `2.3 Statutory sickness recorded independently: breakdown.sick is ${postSick} days`
        );
        assert(
          postAnnual === 5,
          `2.3 Annual vacation quota preserved: breakdown.annual is ${postAnnual} days`
        );
      } catch (err) {
        assert(false, `2.2 Error approving sick leave: ${err.message}`);
      }
    }

    // =================================================================
    // SECTION 3: LEAVE RECONCILIATION LEDGER PRECISION
    // =================================================================
    console.log('\n--- Section 3: Leave Reconciliation Ledger Precision ---');

    try {
      const reconRes = await axios.post(
        `${BASE_URL}/api/leave/balances/${staffId}/reconcile?year=${targetTestYear}`,
        {},
        adminAuth
      );
      assert(reconRes.status === 200, `3.1 Reconcile balance endpoint executed (HTTP ${reconRes.status})`);

      const reconBal = reconRes.data?.data || reconRes.data;
      assert(
        reconBal.usedDays === 5,
        `3.2 Reconciled usedDays strictly preserved at 5 (Got: ${reconBal.usedDays})`
      );
      assert(
        reconBal.usedBreakdown?.sick === 4,
        `3.2 Reconciled sick breakdown strictly preserved at 4 (Got: ${reconBal.usedBreakdown?.sick})`
      );
    } catch (err) {
      assert(false, `3.1 Failed to reconcile balance: ${err.message}`);
    }

    // =================================================================
    // SECTION 4: TIMESHEET ROLE AUTHORIZATION
    // =================================================================
    console.log('\n--- Section 4: Timesheet Role Authorization ---');

    const testApptId = new mongoose.Types.ObjectId();
    const testShiftId = new mongoose.Types.ObjectId();

    // 4.1: Regular Staff attempting to approve shift -> HTTP 403
    try {
      await axios.post(
        `${BASE_URL}/api/hours/approve`,
        {
          shifts: [
            {
              appointmentId: testApptId,
              employabilityId: testShiftId,
              employeeId: staffId,
              scheduledHours: 8,
              approvedHours: 8,
            },
          ],
        },
        staffAuth
      );
      assert(false, 'Expected HTTP 403 for Staff approving timesheet shifts');
    } catch (err) {
      assert(
        err.response?.status === 403 &&
        err.response?.data?.code === 'UNAUTHORIZED_TIMESHEET_ACTION',
        `4.1 Regular Staff blocked from approving timesheet (HTTP 403 UNAUTHORIZED_TIMESHEET_ACTION)`
      );
    }

    // 4.2: Regular Staff attempting to reject shift -> HTTP 403
    try {
      await axios.post(
        `${BASE_URL}/api/hours/reject`,
        {
          appointmentId: testApptId,
          employabilityId: testShiftId,
          rejectionReason: 'Staff self-rejection attempt',
        },
        staffAuth
      );
      assert(false, 'Expected HTTP 403 for Staff rejecting timesheet shifts');
    } catch (err) {
      assert(
        err.response?.status === 403 &&
        err.response?.data?.code === 'UNAUTHORIZED_TIMESHEET_ACTION',
        `4.2 Regular Staff blocked from rejecting timesheet (HTTP 403 UNAUTHORIZED_TIMESHEET_ACTION)`
      );
    }

    // 4.3: Admin approving shift -> HTTP 200
    try {
      const appRes = await axios.post(
        `${BASE_URL}/api/hours/approve`,
        {
          shifts: [
            {
              appointmentId: testApptId,
              employabilityId: testShiftId,
              employeeId: staffId,
              employeeName: staffUser.username,
              scheduledHours: 8,
              actualStartTime: new Date('2026-11-10T08:00:00Z'),
              actualEndTime: new Date('2026-11-10T16:00:00Z'),
              breakMinutes: 0,
              approvedHours: 8,
            },
          ],
        },
        adminAuth
      );
      assert(appRes.status === 200, `4.3 Admin authorized to approve timesheet (HTTP 200, count: ${appRes.data?.count})`);
      createdWorkHourIds.push({ appointmentId: testApptId, employabilityId: testShiftId });
    } catch (err) {
      assert(false, `4.3 Admin timesheet approval failed: ${err.message}`);
    }

    // =================================================================
    // SECTION 5: MANDATORY REJECTION REASON REQUIREMENT
    // =================================================================
    console.log('\n--- Section 5: Mandatory Rejection Reason Requirement ---');

    const rejectShiftApptId = new mongoose.Types.ObjectId();
    const rejectShiftEmpId = new mongoose.Types.ObjectId();

    // 5.1: Admin rejecting with empty reason -> HTTP 400 REJECTION_REASON_REQUIRED
    try {
      await axios.post(
        `${BASE_URL}/api/hours/reject`,
        {
          appointmentId: rejectShiftApptId,
          employabilityId: rejectShiftEmpId,
          employeeId: staffId,
          rejectionReason: '',
        },
        adminAuth
      );
      assert(false, 'Expected HTTP 400 when rejectionReason is empty');
    } catch (err) {
      assert(
        err.response?.status === 400 &&
        err.response?.data?.code === 'REJECTION_REASON_REQUIRED',
        `5.1 Empty rejection reason rejected with HTTP 400 REJECTION_REASON_REQUIRED`
      );
    }

    // 5.2: Admin rejecting with too short reason (< 5 chars) -> HTTP 400 REJECTION_REASON_REQUIRED
    try {
      await axios.post(
        `${BASE_URL}/api/hours/reject`,
        {
          appointmentId: rejectShiftApptId,
          employabilityId: rejectShiftEmpId,
          employeeId: staffId,
          rejectionReason: 'No',
        },
        adminAuth
      );
      assert(false, 'Expected HTTP 400 when rejectionReason is < 5 characters');
    } catch (err) {
      assert(
        err.response?.status === 400 &&
        err.response?.data?.code === 'REJECTION_REASON_REQUIRED',
        `5.2 Short rejection reason (<5 chars) rejected with HTTP 400 REJECTION_REASON_REQUIRED`
      );
    }

    // 5.3: Admin rejecting with documented reason (>= 5 chars) -> HTTP 200
    try {
      const rejRes = await axios.post(
        `${BASE_URL}/api/hours/reject`,
        {
          appointmentId: rejectShiftApptId,
          employabilityId: rejectShiftEmpId,
          employeeId: staffId,
          rejectionReason: 'Shift cancelled due to client schedule change',
        },
        adminAuth
      );
      assert(rejRes.status === 200, `5.3 Documented rejection reason accepted (HTTP 200)`);
      createdWorkHourIds.push({ appointmentId: rejectShiftApptId, employabilityId: rejectShiftEmpId });

      const rejDoc = await WorkHour.findOne({
        appointmentId: rejectShiftApptId,
        employabilityId: rejectShiftEmpId,
      });
      assert(rejDoc?.status === 'Rejected', `5.3 Shift status successfully updated to 'Rejected'`);
    } catch (err) {
      assert(false, `5.3 Documented rejection failed: ${err.message}`);
    }

    // =================================================================
    // SECTION 6: APPROVED TIMESHEET IMMUTABILITY LOCK
    // =================================================================
    console.log('\n--- Section 6: Approved Timesheet Immutability Lock ---');

    // 6.1: Staff attempting to adjust already approved shift -> HTTP 422 APPROVED_TIMESHEET_LOCKED
    try {
      await axios.put(
        `${BASE_URL}/api/hours/adjust`,
        {
          appointmentId: testApptId,
          employabilityId: testShiftId,
          actualStartTime: new Date('2026-11-10T08:00:00Z'),
          actualEndTime: new Date('2026-11-10T17:00:00Z'),
          approvedHours: 9,
        },
        staffAuth
      );
      assert(false, 'Expected HTTP 422 when Staff attempts to modify Approved timesheet');
    } catch (err) {
      assert(
        err.response?.status === 422 &&
        err.response?.data?.code === 'APPROVED_TIMESHEET_LOCKED',
        `6.1 Non-admin editing Approved shift locked with HTTP 422 APPROVED_TIMESHEET_LOCKED`
      );
    }

    // 6.2: Admin adjusting the approved shift -> HTTP 200
    try {
      const adjRes = await axios.put(
        `${BASE_URL}/api/hours/adjust`,
        {
          appointmentId: testApptId,
          employabilityId: testShiftId,
          actualStartTime: new Date('2026-11-10T08:00:00Z'),
          actualEndTime: new Date('2026-11-10T17:00:00Z'),
          approvedHours: 8.5,
          notes: 'Supervisor adjusted by 30 mins',
        },
        adminAuth
      );
      assert(adjRes.status === 200, `6.2 Admin allowed to adjust approved shift (HTTP 200, new hours: ${adjRes.data?.data?.approvedHours})`);
    } catch (err) {
      assert(false, `6.2 Admin adjustment failed: ${err.message}`);
    }

    // =================================================================
    // SECTION 7: OVERTIME AUTO-CALCULATION
    // =================================================================
    console.log('\n--- Section 7: Overtime Auto-Calculation ---');

    const otApptId = new mongoose.Types.ObjectId();
    const otShiftId = new mongoose.Types.ObjectId();

    // 7.1: Work 10.5 hours (07:30 to 18:00), 0 break -> standard is 8.0, so overtime is 2.5
    try {
      const otRes = await axios.post(
        `${BASE_URL}/api/hours/approve`,
        {
          shifts: [
            {
              appointmentId: otApptId,
              employabilityId: otShiftId,
              employeeId: staffId,
              employeeName: staffUser.username,
              actualStartTime: new Date('2026-11-12T07:30:00Z'),
              actualEndTime: new Date('2026-11-12T18:00:00Z'),
              breakMinutes: 0,
              // approvedHours omitted to trigger auto-calculation
            },
          ],
        },
        adminAuth
      );
      assert(otRes.status === 200, `7.1 Shift with 10.5h duration submitted for approval (HTTP 200)`);
      createdWorkHourIds.push({ appointmentId: otApptId, employabilityId: otShiftId });

      const otDoc = await WorkHour.findOne({ appointmentId: otApptId, employabilityId: otShiftId });
      assert(otDoc?.approvedHours === 10.5, `7.1 Approved hours correctly calculated as 10.5 (Got: ${otDoc?.approvedHours})`);
      assert(
        otDoc?.overtimeHours === 2.5,
        `7.1 Overtime automatically computed as 2.5h (10.5 - 8.0 = 2.5, Got: ${otDoc?.overtimeHours})`
      );
    } catch (err) {
      assert(false, `7.1 Overtime auto-calculation failed: ${err.message}`);
    }

    // =================================================================
    // SECTION 8: BASELINE INVOICE INVARIANT & PDF
    // =================================================================
    console.log('\n--- Section 8: Baseline Invoice Invariant & PDF ---');

    const baselineInvoice = await Invoice.findOne({
      $or: [
        { invoiceNumber: '2026/0025' },
        { index: '2026/0025' },
        { invoiceNumber: '#2026/0025' },
        { index: '#2026/0025' },
      ],
    });

    assert(!!baselineInvoice, '8.1 Baseline invoice #2026/0025 found in database');
    if (baselineInvoice) {
      const total = Number(baselineInvoice.totalAmount || baselineInvoice.total || 0).toFixed(2);
      assert(total === '746.39', `8.2 Baseline total amount preserved at exactly €746.39 (Got: €${total})`);

      try {
        const pdfRes = await axios.post(
          `${BASE_URL}/invoice/download`,
          { Id: baselineInvoice._id },
          {
            headers: { Authorization: `Bearer ${adminToken}` },
          }
        );
        assert(pdfRes.status === 200, `8.3 Statutory PDF download returned HTTP 200`);
        assert(pdfRes.data.length > 50000, `8.3 Statutory PDF payload valid (${pdfRes.data.length} bytes)`);
      } catch (err) {
        assert(false, `8.3 Statutory PDF download failed: ${err.message}`);
      }
    }

  } catch (globalErr) {
    console.error('Fatal execution error:', globalErr);
    failCount++;
  } finally {
    // Teardown Synthetic Data
    console.log('\n[Teardown] Cleaning up synthetic test records...');
    try {
      if (createdUserIds.length > 0) {
        await User.deleteMany({ _id: { $in: createdUserIds } });
      }
      if (createdLeaveIds.length > 0) {
        await LeaveRequest.deleteMany({ _id: { $in: createdLeaveIds } });
      }
      if (createdAvailabilityIds.length > 0) {
        await Availability.deleteMany({ employeeId: { $in: createdAvailabilityIds } });
      }
      if (createdBalanceIds.length > 0) {
        await LeaveBalance.deleteMany({ _id: { $in: createdBalanceIds } });
      }
      for (const item of createdWorkHourIds) {
        await WorkHour.deleteMany({
          appointmentId: item.appointmentId,
          employabilityId: item.employabilityId,
        });
      }
      console.log('[Teardown] Synthetic records successfully pruned');
    } catch (teardownErr) {
      console.warn('[Teardown] Cleanup warning:', teardownErr.message);
    }

    await mongoose.disconnect();
    console.log('[Teardown] Disconnected from MongoDB');

    console.log('\n===============================================================');
    console.log(`EXEC-35 RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
    console.log('===============================================================');
    process.exit(failCount > 0 ? 1 : 0);
  }
}

runTests();
