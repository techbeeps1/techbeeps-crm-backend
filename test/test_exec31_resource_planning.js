/**
 * test_exec31_resource_planning.js - EXEC-31 Operational Acceptance Gate
 * 
 * Verifies:
 * 1. Conflict Detection Engine: Crew Overlaps, Vehicle Overlaps, Approved Leave/Sickness, Driver License Verification
 * 2. Pre-flight Conflict Check Endpoint (/api/appointment/check-conflicts)
 * 3. Blocking Behavior: Overlaps rejected with HTTP 409 RESOURCE_CONFLICT without override
 * 4. Auditable Override Mechanism:
 *    - Role authorization (Admin, Manager, Planner, HR accepted; Staff rejected with HTTP 403)
 *    - Override justification minimum length (>= 5 chars; shorter rejected with HTTP 400)
 *    - Audit trail logging in appointment.conflictOverrides
 * 5. Publication Workflow:
 *    - Draft appointments do NOT dispatch premature customer emails
 *    - Publishing dispatches idempotent confirmation
 *    - Rescheduling records scheduleHistory and dispatches notification
 * 6. Survey vs Move Disambiguation
 * 7. Baseline Invoice #2026/0025 strictly preserved at €746.39 with statutory PDF returning HTTP 200
 */

const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const Appointment = require('../models/appointmentModel');
const Employability = require('../models/employabilityModel');
const LeaveRequest = require('../models/LeaveRequest');
const User = require('../models/user');
const Vehicle = require('../models/Resources/vehicle');
const JobSchedule = require('../models/jobSchedule');
const Invoice = require('../models/invoice');
const { isLicenseSufficient, intervalsOverlap } = require('../utils/resourceConflictEngine');

const BASE_URL = 'http://localhost:8080';
let adminToken = '';
let staffToken = '';

// Test fixture tracking for cleanup
const cleanup = {
  appointmentIds: [],
  employabilityIds: [],
  userIds: [],
  vehicleIds: [],
  leaveIds: [],
  jobIds: [],
};

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

async function runTests() {
  console.log('===============================================================');
  console.log('EXEC-31 TEST SUITE: RESOURCE PLANNING & CONFLICT ENGINE');
  console.log('===============================================================');

  try {
    // 0. Connect to DB and generate Tokens
    await mongoose.connect(process.env.MONGO_URI);
    console.log('[Setup] Connected to MongoDB');

    const jwtSecret = process.env.JWT_SECRET || 'techbeeps_crm_default_jwt_secret_key_2026';

    adminToken = jwt.sign(
      { userId: new mongoose.Types.ObjectId().toString(), role: 'Admin', username: 'Dispatcher Admin' },
      jwtSecret,
      { expiresIn: '1h' }
    );
    staffToken = jwt.sign(
      { userId: new mongoose.Types.ObjectId().toString(), role: 'Staff', username: 'Regular Staff' },
      jwtSecret,
      { expiresIn: '1h' }
    );

    const adminHeaders = { Authorization: `Bearer ${adminToken}` };
    const staffHeaders = { Authorization: `Bearer ${staffToken}` };

    // SECTION 1: UNIT LOGIC CHECKS
    console.log('\n--- Section 1: Helper & Unit Logic Checks ---');

    assert(intervalsOverlap(new Date('2026-11-15T09:00:00Z'), new Date('2026-11-15T13:00:00Z'), new Date('2026-11-15T11:00:00Z'), new Date('2026-11-15T15:00:00Z')) === true, 'intervalsOverlap detects overlapping time windows');
    assert(intervalsOverlap(new Date('2026-11-15T09:00:00Z'), new Date('2026-11-15T12:00:00Z'), new Date('2026-11-15T12:00:00Z'), new Date('2026-11-15T16:00:00Z')) === false, 'intervalsOverlap correctly excludes adjacent boundary endpoints (12:00)');
    assert(intervalsOverlap(new Date('2026-11-15T09:00:00Z'), new Date('2026-11-15T11:00:00Z'), new Date('2026-11-15T13:00:00Z'), new Date('2026-11-15T17:00:00Z')) === false, 'intervalsOverlap reports non-overlapping shifts correctly');

    assert(isLicenseSufficient(['B'], ['B']) === true, 'License B satisfies requirement B');
    assert(isLicenseSufficient(['B'], ['C']) === false, 'License B does NOT satisfy requirement C');
    assert(isLicenseSufficient(['C'], ['C']) === true, 'License C satisfies requirement C');
    assert(isLicenseSufficient(['CE'], ['C']) === true, 'License CE satisfies requirement C');
    assert(isLicenseSufficient([], ['B']) === false, 'Empty license does not satisfy vehicle requirement');

    // SECTION 2: SETUP FIXTURES IN DATABASE
    console.log('\n--- Section 2: Create Test Fixtures ---');

    // User A: Driver with B license only
    const driverB = new User({
      username: 'Driver Bob B-Only',
      email: `driver_b_${Date.now()}@test.nl`,
      password: 'testpassword123',
      role: 'Staff',
      drivingLicense: ['B'],
    });
    await driverB.save();
    cleanup.userIds.push(driverB._id);

    // User B: Heavy Freight Driver with CE license
    const driverCE = new User({
      username: 'Driver Charlie CE-Heavy',
      email: `driver_ce_${Date.now()}@test.nl`,
      password: 'testpassword123',
      role: 'Staff',
      drivingLicense: ['B', 'BE', 'C', 'CE'],
    });
    await driverCE.save();
    cleanup.userIds.push(driverCE._id);

    // User C: Regular Mover on Sick Leave
    const moverSick = new User({
      username: 'Mover Mark Sick',
      email: `mover_sick_${Date.now()}@test.nl`,
      password: 'testpassword123',
      role: 'Staff',
      drivingLicense: [],
    });
    await moverSick.save();
    cleanup.userIds.push(moverSick._id);

    // Approved Sick Leave for moverSick on target date
    const testDateStr = '2026-11-20';
    const testDate = new Date(`${testDateStr}T08:00:00.000Z`);
    const sickLeave = new LeaveRequest({
      employeeId: moverSick._id,
      employeeName: moverSick.username,
      leaveType: 'Sick Leave',
      durationType: 'Full Day',
      startDate: new Date(`${testDateStr}T00:00:00.000Z`),
      endDate: new Date(`${testDateStr}T23:59:59.000Z`),
      totalDays: 1,
      reason: 'Medical recovery under physician orders',
      status: 'Approved',
    });
    await sickLeave.save();
    cleanup.leaveIds.push(sickLeave._id);

    // Vehicle 1: Freight Truck requiring C license
    const freightTruck = new Vehicle({
      name: 'Freight Truck DAF 18T',
      licensePlate: '12-XYZ-9',
      vehicleType: 'Freight Truck',
      requiredLicense: ['C'],
    });
    await freightTruck.save();
    cleanup.vehicleIds.push(freightTruck._id);

    console.log(`[Setup] Created test users (${driverB.username}, ${driverCE.username}, ${moverSick.username}) and vehicle (${freightTruck.name})`);

    // SECTION 3: APPOINTMENT 1 (BASELINE APPOINTMENT ON TARGET DATE)
    console.log('\n--- Section 3: Create Initial Baseline Appointment ---');

    const appt1Res = await axios.post(
      `${BASE_URL}/api/appointment`,
      {
        date: testDate,
        startTime: new Date(`${testDateStr}T09:00:00.000Z`),
        endTime: new Date(`${testDateStr}T13:00:00.000Z`),
        appointmentType: 'Move',
        departureLocation: 'Amsterdam HQ Depot',
        vehicle: freightTruck._id,
        vehicleName: freightTruck.name,
        assignedEmployees: [
          {
            employeeId: driverCE._id,
            employeeName: driverCE.username,
            workType: 'Driver',
            startTime: new Date(`${testDateStr}T09:00:00.000Z`),
            endTime: new Date(`${testDateStr}T13:00:00.000Z`),
            vehicle: freightTruck._id,
          },
        ],
        publicationStatus: 'Draft',
      },
      { headers: adminHeaders }
    );

    assert(appt1Res.status === 201, 'Baseline Appointment 1 created successfully (HTTP 201)');
    const appt1Id = appt1Res.data.appointment._id;
    cleanup.appointmentIds.push(appt1Id);
    assert(appt1Res.data.appointment.publicationStatus === 'Draft', 'Appointment 1 defaults to Draft status');

    // SECTION 4: PRE-FLIGHT CONFLICT CHECK ENDPOINT (/api/appointment/check-conflicts)
    console.log('\n--- Section 4: Test Pre-flight Conflict Check Endpoint ---');

    const preflightRes = await axios.post(
      `${BASE_URL}/api/appointment/check-conflicts`,
      {
        date: testDate,
        startTime: new Date(`${testDateStr}T10:00:00.000Z`),
        endTime: new Date(`${testDateStr}T12:00:00.000Z`),
        appointmentType: 'Move',
        assignedEmployees: [
          {
            employeeId: driverCE._id,
            employeeName: driverCE.username,
            workType: 'Driver',
          },
        ],
        vehicle: freightTruck._id,
      },
      { headers: adminHeaders }
    );

    assert(preflightRes.status === 200, 'Pre-flight endpoint returns HTTP 200');
    assert(preflightRes.data.hasConflicts === true, 'Pre-flight correctly flags hasConflicts === true');
    assert(preflightRes.data.hasBlockConflicts === true, 'Pre-flight flags hasBlockConflicts === true');
    const detectedTypes = preflightRes.data.conflicts.map((c) => c.conflictType);
    assert(detectedTypes.includes('CREW_OVERLAP'), 'Pre-flight identifies CREW_OVERLAP for driverCE');
    assert(detectedTypes.includes('VEHICLE_OVERLAP'), 'Pre-flight identifies VEHICLE_OVERLAP for freightTruck');

    // SECTION 5: CREW & VEHICLE DOUBLE BOOKING PREVENTION (HTTP 409)
    console.log('\n--- Section 5: Double Booking Prevention (HTTP 409 Block) ---');

    try {
      await axios.post(
        `${BASE_URL}/api/appointment`,
        {
          date: testDate,
          startTime: new Date(`${testDateStr}T11:00:00.000Z`),
          endTime: new Date(`${testDateStr}T14:00:00.000Z`),
          appointmentType: 'Move',
          assignedEmployees: [
            {
              employeeId: driverCE._id,
              employeeName: driverCE.username,
              workType: 'Driver',
            },
          ],
          vehicle: freightTruck._id,
          allowOverride: false,
        },
        { headers: adminHeaders }
      );
      assert(false, 'Expected HTTP 409 RESOURCE_CONFLICT for double booking, but request succeeded');
    } catch (err) {
      assert(err.response?.status === 409, `Double booking returns HTTP 409 Conflict (got ${err.response?.status})`);
      assert(err.response?.data?.code === 'RESOURCE_CONFLICT', 'Error payload code is RESOURCE_CONFLICT');
      assert(err.response?.data?.requiresOverride === true, 'Payload signals requiresOverride === true');
    }

    // SECTION 6: SICK LEAVE CONFLICT PREVENTION (HTTP 409)
    console.log('\n--- Section 6: HRM Approved Sick Leave Conflict Prevention ---');

    try {
      await axios.post(
        `${BASE_URL}/api/appointment`,
        {
          date: testDate,
          startTime: new Date(`${testDateStr}T14:00:00.000Z`),
          endTime: new Date(`${testDateStr}T18:00:00.000Z`),
          appointmentType: 'Move',
          assignedEmployees: [
            {
              employeeId: moverSick._id,
              employeeName: moverSick.username,
              workType: 'Mover',
            },
          ],
          allowOverride: false,
        },
        { headers: adminHeaders }
      );
      assert(false, 'Expected HTTP 409 for employee on sick leave, but request succeeded');
    } catch (err) {
      assert(err.response?.status === 409, 'Assigning employee on approved sick leave returns HTTP 409');
      const conflictTypes = err.response?.data?.conflicts?.map((c) => c.conflictType) || [];
      assert(conflictTypes.includes('LEAVE_SICKNESS'), 'Conflict type LEAVE_SICKNESS identified');
      const msg = err.response?.data?.conflicts?.[0]?.message || '';
      assert(msg.includes('Sick Leave'), 'Conflict message explicitly cites Sick Leave');
    }

    // SECTION 7: DRIVER LICENSE INELIGIBILITY PREVENTION
    console.log('\n--- Section 7: Driver License Qualification Check ---');

    try {
      await axios.post(
        `${BASE_URL}/api/appointment`,
        {
          date: testDate,
          startTime: new Date(`${testDateStr}T14:00:00.000Z`),
          endTime: new Date(`${testDateStr}T18:00:00.000Z`),
          appointmentType: 'Move',
          vehicle: freightTruck._id,
          vehicleName: freightTruck.name,
          assignedEmployees: [
            {
              employeeId: driverB._id, // only holds B license
              employeeName: driverB.username,
              workType: 'Driver',
              vehicle: freightTruck._id,
            },
          ],
          allowOverride: false,
        },
        { headers: adminHeaders }
      );
      assert(false, 'Expected HTTP 409 for B-license driver on C-license truck, but request succeeded');
    } catch (err) {
      assert(err.response?.status === 409, 'Assigning ineligible driver returns HTTP 409');
      const conflictTypes = err.response?.data?.conflicts?.map((c) => c.conflictType) || [];
      assert(conflictTypes.includes('INELIGIBLE_DRIVER'), 'Conflict type INELIGIBLE_DRIVER identified');
    }

    // SECTION 8: AUDITABLE OVERRIDE AUTHORIZATION & AUDIT TRAIL LOGGING
    console.log('\n--- Section 8: Auditable Override Authorization & Validation ---');

    // 8A. Unauthorized role (Staff) attempts override -> HTTP 403
    try {
      await axios.post(
        `${BASE_URL}/api/appointment`,
        {
          date: testDate,
          startTime: new Date(`${testDateStr}T10:00:00.000Z`),
          endTime: new Date(`${testDateStr}T12:00:00.000Z`),
          appointmentType: 'Move',
          assignedEmployees: [{ employeeId: driverCE._id, employeeName: driverCE.username, workType: 'Driver' }],
          vehicle: freightTruck._id,
          allowOverride: true,
          overrideReason: 'Staff attempted override reason here',
        },
        { headers: staffHeaders }
      );
      assert(false, 'Expected HTTP 403 for Staff attempting override');
    } catch (err) {
      assert(err.response?.status === 403, `Staff override rejected with HTTP 403 (got ${err.response?.status})`);
      assert(err.response?.data?.code === 'UNAUTHORIZED_OVERRIDE', 'Error code is UNAUTHORIZED_OVERRIDE');
    }

    // 8B. Admin attempts override with insufficient reason (< 5 chars) -> HTTP 400
    try {
      await axios.post(
        `${BASE_URL}/api/appointment`,
        {
          date: testDate,
          startTime: new Date(`${testDateStr}T10:00:00.000Z`),
          endTime: new Date(`${testDateStr}T12:00:00.000Z`),
          appointmentType: 'Move',
          assignedEmployees: [{ employeeId: driverCE._id, employeeName: driverCE.username, workType: 'Driver' }],
          vehicle: freightTruck._id,
          allowOverride: true,
          overrideReason: 'ok',
        },
        { headers: adminHeaders }
      );
      assert(false, 'Expected HTTP 400 for override reason < 5 chars');
    } catch (err) {
      assert(err.response?.status === 400, `Short override reason rejected with HTTP 400 (got ${err.response?.status})`);
      assert(err.response?.data?.code === 'INVALID_OVERRIDE_REASON', 'Error code is INVALID_OVERRIDE_REASON');
    }

    // 8C. Authorized Admin attempts override with valid documented reason -> HTTP 201 Success & Audit Log
    const validReason = 'Approved by Dispatch Lead Yaseen for VIP priority move overlap';
    const overrideSuccessRes = await axios.post(
      `${BASE_URL}/api/appointment`,
      {
        date: testDate,
        startTime: new Date(`${testDateStr}T10:00:00.000Z`),
        endTime: new Date(`${testDateStr}T12:00:00.000Z`),
        appointmentType: 'Move',
        assignedEmployees: [{ employeeId: driverCE._id, employeeName: driverCE.username, workType: 'Driver' }],
        vehicle: freightTruck._id,
        allowOverride: true,
        overrideReason: validReason,
        publicationStatus: 'Draft',
      },
      { headers: adminHeaders }
    );

    assert(overrideSuccessRes.status === 201, 'Authorized override succeeds with HTTP 201');
    const appt2Id = overrideSuccessRes.data.appointment._id;
    cleanup.appointmentIds.push(appt2Id);

    // Verify audit record in database
    const appt2Doc = await Appointment.findById(appt2Id);
    assert(appt2Doc.conflictOverrides && appt2Doc.conflictOverrides.length === 1, 'Appointment has 1 recorded conflictOverride entry');
    assert(appt2Doc.conflictOverrides[0].reason === validReason, `Override reason properly recorded: "${appt2Doc.conflictOverrides[0].reason}"`);
    assert(appt2Doc.conflictOverrides[0].userRole === 'Admin', `Overriding user role recorded as "${appt2Doc.conflictOverrides[0].userRole}"`);

    // SECTION 9: PUBLICATION WORKFLOW & RESCHEDULING
    console.log('\n--- Section 9: Draft vs Published Workflow & Rescheduling ---');

    // 9A. Transition to Published
    const publishRes = await axios.put(
      `${BASE_URL}/api/appointment/${appt2Id}`,
      {
        publicationStatus: 'Published',
        allowOverride: true,
        overrideReason: 'Publishing schedule with approved override',
      },
      { headers: adminHeaders }
    );

    assert(publishRes.status === 200, 'Appointment updated to Published (HTTP 200)');
    assert(publishRes.data.appointment.publicationStatus === 'Published', 'publicationStatus successfully updated to "Published"');
    assert(publishRes.data.appointment.publishedAt !== null, 'publishedAt timestamp recorded');

    // 9B. Reschedule published appointment (time changed)
    const newStart = new Date(`${testDateStr}T10:30:00.000Z`);
    const newEnd = new Date(`${testDateStr}T12:30:00.000Z`);
    const rescheduleRes = await axios.put(
      `${BASE_URL}/api/appointment/${appt2Id}`,
      {
        startTime: newStart,
        endTime: newEnd,
        allowOverride: true,
        overrideReason: 'Adjusted arrival window by 30 mins',
      },
      { headers: adminHeaders }
    );

    assert(rescheduleRes.status === 200, 'Rescheduling appointment succeeds (HTTP 200)');
    const rescheduledDoc = await Appointment.findById(appt2Id);
    assert(rescheduledDoc.scheduleHistory && rescheduledDoc.scheduleHistory.length >= 1, 'scheduleHistory records prior time snapshot');

    // SECTION 10: SURVEY APPOINTMENT DISAMBIGUATION
    console.log('\n--- Section 10: Survey vs Move Disambiguation ---');

    const surveyRes = await axios.post(
      `${BASE_URL}/api/appointment`,
      {
        date: new Date('2026-11-25T10:00:00.000Z'),
        startTime: new Date('2026-11-25T10:00:00.000Z'),
        endTime: new Date('2026-11-25T11:30:00.000Z'),
        appointmentType: 'Survey',
        departureLocation: 'Customer Residence (On-site survey)',
        surveyDetails: {
          estimatorName: 'John Estimator',
          surveyNotes: 'Valuation inspection for 4-bedroom villa',
        },
        publicationStatus: 'Draft',
      },
      { headers: adminHeaders }
    );

    assert(surveyRes.status === 201, 'Survey appointment created with surveyDetails (HTTP 201)');
    const surveyId = surveyRes.data.appointment._id;
    cleanup.appointmentIds.push(surveyId);
    assert(surveyRes.data.appointment.appointmentType === 'Survey', 'appointmentType is "Survey"');
    assert(surveyRes.data.appointment.surveyDetails?.estimatorName === 'John Estimator', 'Survey details estimator preserved');

    // SECTION 11: BASELINE INVOICE INVARIANT
    console.log('\n--- Section 11: Baseline Invoice #2026/0025 Invariant Verification ---');

    const baselineInv = await Invoice.findOne({
      $or: [{ invoiceNumber: '2026/0025' }, { index: '2026/0025' }, { invoiceNumber: '#2026/0025' }, { index: '#2026/0025' }],
    });

    if (!baselineInv) {
      console.warn('  [WARN] Baseline invoice #2026/0025 not found in current test DB.');
    } else {
      const totalEur = Number(baselineInv.total || baselineInv.amount || 0);
      assert(Math.abs(totalEur - 746.39) < 0.01, `Baseline invoice #2026/0025 preserved exactly at €746.39 (actual: €${totalEur.toFixed(2)})`);

      try {
        const pdfRes = await axios.post(
          `${BASE_URL}/invoice/download`,
          { Id: baselineInv._id },
          { headers: adminHeaders, responseType: 'arraybuffer' }
        );
        assert(pdfRes.status === 200, 'Baseline invoice PDF endpoint returns HTTP 200');
        assert(pdfRes.data.length > 50000, `Baseline invoice PDF payload is healthy (${pdfRes.data.length} bytes)`);
      } catch (pdfErr) {
        assert(false, `Baseline invoice PDF check failed: ${pdfErr.message}`);
      }
    }

    // SECTION 12: CLEANUP
    console.log('\n--- Section 12: Fixture Cleanup ---');

    for (const aId of cleanup.appointmentIds) {
      await Appointment.findByIdAndDelete(aId);
      await Employability.deleteMany({ _id: { $in: cleanup.employabilityIds } });
    }
    for (const uId of cleanup.userIds) {
      await User.findByIdAndDelete(uId);
    }
    for (const vId of cleanup.vehicleIds) {
      await Vehicle.findByIdAndDelete(vId);
    }
    for (const lId of cleanup.leaveIds) {
      await LeaveRequest.findByIdAndDelete(lId);
    }
    console.log(`[Cleanup] Removed ${cleanup.appointmentIds.length} test appointments, ${cleanup.userIds.length} users, ${cleanup.vehicleIds.length} vehicles, ${cleanup.leaveIds.length} leaves.`);

  } catch (error) {
    console.error('Fatal test execution error:', error.message);
    if (error.response?.data) console.error('Response data:', error.response.data);
    failCount++;
  } finally {
    await mongoose.disconnect();
    console.log('\n===============================================================');
    console.log(`TOTAL PASS: ${passCount}`);
    console.log(`TOTAL FAIL: ${failCount}`);
    console.log('===============================================================');
    process.exit(failCount > 0 ? 1 : 0);
  }
}

runTests();

