/**
 * Task 38: Dutch Statutory Sick Leave Rules & Baseline Entitlement Verification Test
 * 
 * Verifies:
 * 1. Default annual leave baseline entitlement is 20 days under Dutch law (4 weeks * 5 days).
 * 2. Sick Leave (Ziekmelding Art. 7:629 BW):
 *    - Fully paid (paidDays = totalDays, unpaidDays = 0).
 *    - Strictly separated from vacation quota (does NOT increment usedDays or deduct from annual vacation quota).
 *    - Correctly recorded under breakdown.sick.
 * 3. Annual Vacation Leave consumption:
 *    - Annual leave increments usedDays and reduces remaining vacation days.
 * 4. Sickness during Vacation (Art. 7:638 lid 8 BW):
 *    - When sick leave overlaps approved vacation, vacation quota is credited back.
 */

const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/user');
const Availability = require('../models/availabilityModel');
const LeaveRequest = require('../models/LeaveRequest');
const LeaveBalance = require('../models/LeaveBalance');
const leaveController = require('../controllers/leaveController');

async function runTask38Tests() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is not set in .env');
  }

  console.log('[Task 38] Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('[Task 38] Connected to MongoDB successfully.');

  const syntheticId = new mongoose.Types.ObjectId();
  const currentYear = new Date().getFullYear();

  // Create mock response helper
  const createResMock = () => {
    return {
      statusCode: 200,
      status: function (code) {
        this.statusCode = code;
        return this;
      },
      json: function (payload) {
        this.data = payload;
        return this;
      },
    };
  };

  try {
    // 0. Setup synthetic user
    const synthUser = new User({
      _id: syntheticId,
      username: 'synthetic_dutch_staff_task38',
      email: 'synth_dutch_task38@example.com',
      password: 'SyntheticTestPassword123!',
      role: 'Staff',
    });
    await synthUser.save();
    console.log('[Task 38] Created synthetic employee:', synthUser.username);

    // Set standard Mon-Fri availability roster
    await Availability.findOneAndUpdate(
      { employeeId: syntheticId },
      {
        $set: {
          employeeId: syntheticId,
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

    // -------------------------------------------------------------------------
    // TEST 1: Baseline Entitlement Default is 20 days
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 1: Statutory Baseline Quota (20 Days) ---');
    const newBal = new LeaveBalance({
      employeeId: syntheticId,
      employeeName: synthUser.username,
      year: currentYear,
    });
    await newBal.save();

    console.log(`Default LeaveBalance annualEntitlement: ${newBal.annualEntitlement}`);
    if (newBal.annualEntitlement !== 20) {
      throw new Error(`Expected default annualEntitlement to be 20, got ${newBal.annualEntitlement}`);
    }
    console.log('✓ TEST 1 PASSED: Default annual vacation entitlement initialized to 20 statutory days.');

    // Helper to get future date: next week's Monday
    const getNextMonday = (weeksAhead = 1) => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      const day = d.getDay();
      const diffToMonday = ((8 - day) % 7 || 7) + (weeksAhead - 1) * 7;
      d.setDate(d.getDate() + diffToMonday);
      return d;
    };

    // -------------------------------------------------------------------------
    // TEST 2: Statutory Sick Leave (Art. 7:629 BW) Paid & Separate Quota
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Paid Sick Leave Strictly Separate from Vacation Quota ---');
    // Staff takes 3 days Sick Leave (Wednesday to Friday next week)
    const nextMon = getNextMonday(1);
    const sickStart = new Date(nextMon);
    sickStart.setDate(nextMon.getDate() + 2); // Wednesday
    const sickEnd = new Date(nextMon);
    sickEnd.setDate(nextMon.getDate() + 4);   // Friday

    const reqSick = {
      user: { role: 'Staff', id: syntheticId.toString() },
      body: {
        employeeId: syntheticId.toString(),
        employeeName: synthUser.username,
        leaveType: 'Sick Leave',
        durationType: 'Multiple Days',
        startDate: sickStart,
        endDate: sickEnd,
        reason: 'Flu and medical rest under Art. 7:629 BW',
      },
    };
    const resSick = createResMock();
    await leaveController.createLeaveRequest(reqSick, resSick);

    const sickLeaveRecord = resSick.data?.data;
    if (!sickLeaveRecord) {
      throw new Error(`Failed to create sick leave request: ${JSON.stringify(resSick.data)}`);
    }

    console.log(`Created Sick Leave: totalDays=${sickLeaveRecord.totalDays}, paidDays=${sickLeaveRecord.paidDays}, unpaidDays=${sickLeaveRecord.unpaidDays}`);
    if (sickLeaveRecord.paidDays !== 3 || sickLeaveRecord.unpaidDays !== 0) {
      throw new Error(`Expected paidDays=3 and unpaidDays=0 for Sick Leave, got paid=${sickLeaveRecord.paidDays}, unpaid=${sickLeaveRecord.unpaidDays}`);
    }

    // Admin approves the Sick Leave
    const reqApproveSick = {
      params: { id: sickLeaveRecord._id.toString() },
      user: { role: 'Admin', id: syntheticId.toString() },
      body: { status: 'Approved', reviewerComment: 'Statutory sick leave approved' },
    };
    const resApproveSick = createResMock();
    await leaveController.updateLeaveStatus(reqApproveSick, resApproveSick);

    // Verify Balance after Sick Leave approval
    const balAfterSick = await LeaveBalance.findOne({ employeeId: syntheticId, year: currentYear });
    console.log(`Balance after Sick Leave: usedDays=${balAfterSick.usedDays}, sickBreakdown=${balAfterSick.usedBreakdown?.sick}`);

    // Statutory Check: Sick leave MUST NOT deduct from vacation quota (usedDays must be 0)
    if (balAfterSick.usedDays !== 0) {
      throw new Error(`Dutch Law Violation: Sick leave deducted from vacation usedDays! Expected usedDays=0, got ${balAfterSick.usedDays}`);
    }
    if ((balAfterSick.usedBreakdown?.sick || 0) !== 3) {
      throw new Error(`Expected usedBreakdown.sick to be 3, got ${balAfterSick.usedBreakdown?.sick}`);
    }
    const remainingVacation = (balAfterSick.annualEntitlement || 20) - (balAfterSick.usedDays || 0);
    console.log(`Remaining Vacation Days: ${remainingVacation} (Full 20 intact)`);
    if (remainingVacation !== 20) {
      throw new Error(`Expected remaining vacation days to remain 20, got ${remainingVacation}`);
    }
    console.log('✓ TEST 2 PASSED: Sick leave is fully paid and vacation quota remains 100% intact.');

    // -------------------------------------------------------------------------
    // TEST 3: Vacation Leave Quota Consumption
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Annual / Vacation Leave Quota Deduction ---');
    // Staff takes 5 days Vacation (Mon-Fri 2 weeks ahead)
    const vacMon = getNextMonday(2);
    const vacStart = new Date(vacMon);
    const vacEnd = new Date(vacMon);
    vacEnd.setDate(vacMon.getDate() + 4);

    const reqVac = {
      user: { role: 'Staff', id: syntheticId.toString() },
      body: {
        employeeId: syntheticId.toString(),
        employeeName: synthUser.username,
        leaveType: 'Annual / Vacation',
        durationType: 'Multiple Days',
        startDate: vacStart,
        endDate: vacEnd,
        reason: 'Family holiday in Spain',
      },
    };
    const resVac = createResMock();
    await leaveController.createLeaveRequest(reqVac, resVac);

    const vacRecord = resVac.data?.data;
    if (!vacRecord) {
      throw new Error(`Failed to create vacation request: ${JSON.stringify(resVac.data)}`);
    }

    // Approve the Vacation Leave
    const reqApproveVac = {
      params: { id: vacRecord._id.toString() },
      user: { role: 'Admin', id: syntheticId.toString() },
      body: { status: 'Approved', reviewerComment: 'Holiday approved' },
    };
    const resApproveVac = createResMock();
    await leaveController.updateLeaveStatus(reqApproveVac, resApproveVac);

    const balAfterVac = await LeaveBalance.findOne({ employeeId: syntheticId, year: currentYear });
    console.log(`Balance after Vacation: usedDays=${balAfterVac.usedDays}, vacationRemaining=${20 - balAfterVac.usedDays}`);

    if (balAfterVac.usedDays !== 5) {
      throw new Error(`Expected vacation usedDays=5, got ${balAfterVac.usedDays}`);
    }
    if ((balAfterVac.usedBreakdown?.annual || 0) !== 5) {
      throw new Error(`Expected usedBreakdown.annual to be 5, got ${balAfterVac.usedBreakdown?.annual}`);
    }
    if ((balAfterVac.usedBreakdown?.sick || 0) !== 3) {
      throw new Error(`Expected usedBreakdown.sick to still be 3, got ${balAfterVac.usedBreakdown?.sick}`);
    }
    console.log('✓ TEST 3 PASSED: Vacation quota consumed exactly 5 days; sick days maintained separately.');

    // -------------------------------------------------------------------------
    // TEST 4: Sickness during Approved Vacation (Art. 7:638 lid 8 BW)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Overlapping Sickness during Vacation Re-credits Quota (Art. 7:638 lid 8 BW) ---');
    // Employee fell sick for 2 days during that 5-day vacation (Tuesday to Wednesday of week 2)
    const illnessStart = new Date(vacMon);
    illnessStart.setDate(vacMon.getDate() + 1); // Tuesday
    const illnessEnd = new Date(vacMon);
    illnessEnd.setDate(vacMon.getDate() + 2);   // Wednesday

    const reqIllness = {
      user: { role: 'Staff', id: syntheticId.toString() },
      body: {
        employeeId: syntheticId.toString(),
        employeeName: synthUser.username,
        leaveType: 'Sick Leave',
        durationType: 'Multiple Days',
        startDate: illnessStart,
        endDate: illnessEnd,
        reason: 'Fell sick during vacation, converting 2 days to sick leave under Art. 7:638 lid 8 BW',
      },
    };
    const resIllness = createResMock();
    await leaveController.createLeaveRequest(reqIllness, resIllness);
    const illnessRecord = resIllness.data?.data;

    // Approve illness leave
    const reqApproveIllness = {
      params: { id: illnessRecord._id.toString() },
      user: { role: 'Admin', id: syntheticId.toString() },
      body: { status: 'Approved', reviewerComment: 'Illness during vacation acknowledged' },
    };
    const resApproveIllness = createResMock();
    await leaveController.updateLeaveStatus(reqApproveIllness, resApproveIllness);

    const balAfterIllness = await LeaveBalance.findOne({ employeeId: syntheticId, year: currentYear });
    console.log(`Balance after illness overlap: usedDays=${balAfterIllness.usedDays}, sickBreakdown=${balAfterIllness.usedBreakdown?.sick}, annualBreakdown=${balAfterIllness.usedBreakdown?.annual}`);

    // Vacation was 5 days, 2 days converted to sick leave -> remaining vacation usedDays must now be 3!
    // Total sick days: 3 + 2 = 5 days!
    if (balAfterIllness.usedDays !== 3) {
      throw new Error(`Expected vacation usedDays to be adjusted to 3, got ${balAfterIllness.usedDays}`);
    }
    if ((balAfterIllness.usedBreakdown?.sick || 0) !== 5) {
      throw new Error(`Expected total sick days to be 5, got ${balAfterIllness.usedBreakdown?.sick}`);
    }
    console.log('✓ TEST 4 PASSED: Overlapping vacation days credited back as required by Dutch Civil Code Art. 7:638 lid 8 BW.');

    console.log('\n======================================================');
    console.log('ALL TASK 38 DUTCH SICK LEAVE VERIFICATIONS PASSED (4/4)');
    console.log('======================================================');

  } finally {
    // Clean up all synthetic test data
    console.log('\n[Cleanup] Removing synthetic test records...');
    await User.findByIdAndDelete(syntheticId);
    await Availability.deleteMany({ employeeId: syntheticId });
    await LeaveRequest.deleteMany({ employeeId: syntheticId });
    await LeaveBalance.deleteMany({ employeeId: syntheticId });
    console.log('[Cleanup] Synthetic test fixtures cleaned up safely.');
    await mongoose.disconnect();
  }
}

runTask38Tests()
  .then(() => {
    console.log('[Task 38] Verification script completed successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[Task 38] Verification failed with error:', err);
    process.exit(1);
  });
