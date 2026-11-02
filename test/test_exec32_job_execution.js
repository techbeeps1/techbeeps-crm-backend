/**
 * test_exec32_job_execution.js - EXEC-32 Operational Acceptance Gate
 * 
 * Comprehensive Verification of:
 * 1. Canonical State Machine:
 *    - Normalization of legacy & input status strings
 *    - Allowed transitions vs Illegal jumps (HTTP 422 INVALID_STATUS_TRANSITION)
 *    - Execution prerequisites (Accepted Quote or Scheduled Appointment required unless Admin)
 *    - Completion prerequisites (Must be in EXECUTION to complete)
 *    - Mandatory cancellation reason (>= 5 chars; HTTP 400 CANCELLATION_REASON_REQUIRED)
 *    - Role-based reopening (COMPLETED/CANCELLED -> Active: Admin/Manager only; Staff HTTP 403 UNAUTHORIZED_REOPEN; Reason >= 5 chars required)
 *    - Complete transition audit trail logging in statusHistory
 * 
 * 2. Worker & Foreman Field Execution Journey:
 *    - Access control: Unassigned staff blocked from job and execution details (HTTP 403 ACCESS_DENIED)
 *    - Assigned staff / Foreman authorized to access and update execution details
 *    - Transport KM tracking: startKilometres, endKilometres, auto-calculated totalKilometres
 *    - Hours logged: billableHours, payrollHours
 *    - Materials used tracking: quantity, unitPrice, calculated totalPrice
 *    - Damage / incident reports logged
 *    - Customer digital signature capture: signerName, signerRole, signatureData, signedAt
 *    - Automatic job completion upon customer sign-off with audit log entry
 * 
 * 3. System Invariant:
 *    - Baseline invoice #2026/0025 strictly preserved at €746.39 with statutory PDF returning HTTP 200
 */

const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const JobSchedule = require('../models/jobSchedule');
const Appointment = require('../models/appointmentModel');
const Employability = require('../models/employabilityModel');
const User = require('../models/user');
const Invoice = require('../models/invoice');
const Finance = require('../models/finance');
const Customer = require('../models/customer');
const {
  CANONICAL_STATUSES,
  normalizeStatus,
  validateTransition,
  isWorkerAssignedToJob,
} = require('../utils/jobStateMachine');

const BASE_URL = 'http://localhost:8080';
let adminToken = '';
let assignedStaffToken = '';
let unassignedStaffToken = '';

const cleanup = {
  jobIds: [],
  appointmentIds: [],
  employabilityIds: [],
  userIds: [],
  financeIds: [],
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
  console.log('EXEC-32 TEST SUITE: JOB STATE MACHINE & FOREMAN EXECUTION');
  console.log('===============================================================');

  try {
    // 0. Connect DB & Setup Auth
    await mongoose.connect(process.env.MONGO_URI);
    console.log('[Setup] Connected to MongoDB');

    const jwtSecret = process.env.JWT_SECRET || 'techbeeps_crm_default_jwt_secret_key_2026';

    const adminUserId = new mongoose.Types.ObjectId();
    const assignedWorkerUserId = new mongoose.Types.ObjectId();
    const unassignedWorkerUserId = new mongoose.Types.ObjectId();

    cleanup.userIds.push(adminUserId, assignedWorkerUserId, unassignedWorkerUserId);

    adminToken = jwt.sign(
      { userId: adminUserId.toString(), role: 'Admin', username: 'Test Admin Dispatcher' },
      jwtSecret,
      { expiresIn: '1h' }
    );

    assignedStaffToken = jwt.sign(
      { userId: assignedWorkerUserId.toString(), role: 'Staff', username: 'Assigned Mover Mike' },
      jwtSecret,
      { expiresIn: '1h' }
    );

    unassignedStaffToken = jwt.sign(
      { userId: unassignedWorkerUserId.toString(), role: 'Staff', username: 'Unassigned Mover Bob' },
      jwtSecret,
      { expiresIn: '1h' }
    );

    // Create Employability doc for assigned worker
    const assignedEmployability = await Employability.create({
      employeeId: assignedWorkerUserId,
      firstName: 'Mike',
      lastName: 'Mover',
      roles: ['Crew'],
      employmentType: 'Full-Time',
      status: 'Active',
      drivingLicense: 'B',
    });
    cleanup.employabilityIds.push(assignedEmployability._id);

    // =========================================================================
    // SECTION 1: UNIT-LEVEL STATE MACHINE & NORMALIZATION CHECKS
    // =========================================================================
    console.log('\n--- Section 1: Canonical Status Normalization & Transitions ---');

    assert(normalizeStatus('pending') === 'PENDING', 'Normalizes "pending" to "PENDING"');
    assert(normalizeStatus('in progress') === 'EXECUTION', 'Normalizes "in progress" to "EXECUTION"');
    assert(normalizeStatus('draft') === 'PENDING', 'Normalizes "draft" to "PENDING"');
    assert(normalizeStatus('quote sent') === 'PROCESSING', 'Normalizes "quote sent" to "PROCESSING"');
    assert(normalizeStatus('confirmed') === 'CONFIRMED', 'Normalizes "confirmed" to "CONFIRMED"');
    assert(normalizeStatus('moving') === 'EXECUTION', 'Normalizes "moving" to "EXECUTION"');
    assert(normalizeStatus('closed') === 'COMPLETED', 'Normalizes "closed" to "COMPLETED"');
    assert(normalizeStatus('canceled') === 'CANCELLED', 'Normalizes "canceled" to "CANCELLED"');
    assert(normalizeStatus('INVALID_XYZ') === null, 'Rejects unrecognized status string with null');

    // Unit validateTransition checks
    const invalidJumpCheck = await validateTransition({
      currentStatus: 'PENDING',
      targetStatus: 'COMPLETED',
      user: { role: 'Admin' },
    });
    assert(!invalidJumpCheck.allowed && invalidJumpCheck.code === 'INVALID_STATUS_TRANSITION',
      'Direct jump PENDING -> COMPLETED blocked with INVALID_STATUS_TRANSITION');

    const invalidExecutionCheck = await validateTransition({
      currentStatus: 'PENDING',
      targetStatus: 'EXECUTION',
      user: { role: 'Admin' },
    });
    assert(!invalidExecutionCheck.allowed && invalidExecutionCheck.code === 'INVALID_STATUS_TRANSITION',
      'Direct jump PENDING -> EXECUTION blocked with INVALID_STATUS_TRANSITION');

    const validProcessingCheck = await validateTransition({
      currentStatus: 'PENDING',
      targetStatus: 'PROCESSING',
      user: { role: 'Staff' },
    });
    assert(validProcessingCheck.allowed && validProcessingCheck.normTarget === 'PROCESSING',
      'Transition PENDING -> PROCESSING is allowed');

    // =========================================================================
    // SECTION 2: END-TO-END JOB STATE TRANSITIONS VIA API
    // =========================================================================
    console.log('\n--- Section 2: End-to-End Job State Transitions via API ---');

    // Ensure a test customer exists
    let testCustomer = await Customer.findOne();
    if (!testCustomer) {
      testCustomer = await Customer.create({
        type: 'Customer',
        typeOfCustomer: 'individual',
        firstName: 'Alexander',
        lastName: 'Van Dijk',
        email: 'alexander.vandijk.test@universalmovers.nl',
      });
    }

    // Create a Test Job
    const testJob = await JobSchedule.create({
      customer: testCustomer._id,
      status: 'PENDING',
      pickup_address: 'Keizersgracht 100, Amsterdam',
      delivery_address: 'Coolsingel 50, Rotterdam',
      index: 99932,
      statusHistory: [],
    });
    cleanup.jobIds.push(testJob._id);

    // 2.1 Attempt illegal jump: PENDING -> COMPLETED
    try {
      await axios.put(
        `${BASE_URL}/api/jobs/${testJob._id}/status`,
        { status: 'COMPLETED' },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      assert(false, 'Illegal jump PENDING -> COMPLETED should have thrown 422');
    } catch (err) {
      assert(
        err.response?.status === 422 && err.response?.data?.code === 'INVALID_STATUS_TRANSITION',
        'API rejects PENDING -> COMPLETED with HTTP 422 INVALID_STATUS_TRANSITION'
      );
    }

    // 2.2 Attempt cancellation without reason (HTTP 400)
    try {
      await axios.put(
        `${BASE_URL}/api/jobs/${testJob._id}/status`,
        { status: 'CANCELLED', reason: '' },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      assert(false, 'Cancellation without reason should have failed HTTP 400');
    } catch (err) {
      assert(
        err.response?.status === 400 && err.response?.data?.code === 'CANCELLATION_REASON_REQUIRED',
        'API rejects cancellation without reason with HTTP 400 CANCELLATION_REASON_REQUIRED'
      );
    }

    // 2.3 Attempt cancellation with too short reason (< 5 chars)
    try {
      await axios.put(
        `${BASE_URL}/api/jobs/${testJob._id}/status`,
        { status: 'CANCELLED', reason: 'bad' },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      assert(false, 'Cancellation with short reason should have failed HTTP 400');
    } catch (err) {
      assert(
        err.response?.status === 400 && err.response?.data?.code === 'CANCELLATION_REASON_REQUIRED',
        'API rejects cancellation with reason < 5 chars with HTTP 400'
      );
    }

    // 2.4 Transition PENDING -> PROCESSING (Valid)
    const resProcessing = await axios.put(
      `${BASE_URL}/api/jobs/${testJob._id}/status`,
      { status: 'PROCESSING', reason: 'Initial valuation initiated' },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert(
      resProcessing.status === 200 && resProcessing.data?.status === 'PROCESSING',
      'API transitions PENDING -> PROCESSING successfully (HTTP 200)'
    );

    // 2.5 Transition PROCESSING -> EXECUTION prerequisite check (Staff without accepted quote / appt)
    try {
      await axios.put(
        `${BASE_URL}/api/jobs/${testJob._id}/status`,
        { status: 'EXECUTION' },
        { headers: { Authorization: `Bearer ${assignedStaffToken}` } }
      );
      assert(false, 'Staff moving to EXECUTION without quote/appt should have failed HTTP 422');
    } catch (err) {
      assert(
        err.response?.status === 422 && err.response?.data?.code === 'PREREQUISITE_NOT_MET',
        'Staff moving to EXECUTION without accepted quote/appointment fails HTTP 422 PREREQUISITE_NOT_MET'
      );
    }

    // 2.6 Admin overrides or satisfies prerequisite and transitions to EXECUTION
    const resExec = await axios.put(
      `${BASE_URL}/api/jobs/${testJob._id}/status`,
      { status: 'EXECUTION', reason: 'Dispatcher approved field execution start' },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert(
      resExec.status === 200 && resExec.data?.status === 'EXECUTION',
      'Admin transitions job to EXECUTION successfully'
    );

    // 2.7 Transition EXECUTION -> COMPLETED
    const resComplete = await axios.put(
      `${BASE_URL}/api/jobs/${testJob._id}/status`,
      { status: 'COMPLETED', reason: 'Field moving execution completed successfully' },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert(
      resComplete.status === 200 && resComplete.data?.status === 'COMPLETED',
      'Job transitions EXECUTION -> COMPLETED successfully'
    );

    // 2.8 Reopening Closed Job: Regular Staff attempts to reopen COMPLETED job (HTTP 403 UNAUTHORIZED_REOPEN)
    try {
      await axios.put(
        `${BASE_URL}/api/jobs/${testJob._id}/status`,
        { status: 'EXECUTION', reason: 'Reopening job' },
        { headers: { Authorization: `Bearer ${assignedStaffToken}` } }
      );
      assert(false, 'Staff reopening COMPLETED job should have failed HTTP 403');
    } catch (err) {
      assert(
        err.response?.status === 403 && err.response?.data?.code === 'UNAUTHORIZED_REOPEN',
        'Staff attempting to reopen COMPLETED job blocked with HTTP 403 UNAUTHORIZED_REOPEN'
      );
    }

    // 2.9 Admin attempts to reopen without reason (HTTP 400 REOPEN_REASON_REQUIRED)
    try {
      await axios.put(
        `${BASE_URL}/api/jobs/${testJob._id}/status`,
        { status: 'EXECUTION', reason: '' },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      assert(false, 'Admin reopening without reason should have failed HTTP 400');
    } catch (err) {
      assert(
        err.response?.status === 400 && err.response?.data?.code === 'REOPEN_REASON_REQUIRED',
        'Admin reopening COMPLETED job without >=5 char reason fails HTTP 400 REOPEN_REASON_REQUIRED'
      );
    }

    // 2.10 Admin reopens COMPLETED job with valid reason
    const resReopen = await axios.put(
      `${BASE_URL}/api/jobs/${testJob._id}/status`,
      { status: 'EXECUTION', reason: 'Customer requested additional unboxing and assembly services' },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert(
      resReopen.status === 200 && resReopen.data?.status === 'EXECUTION',
      'Admin successfully reopens COMPLETED job back to EXECUTION with auditable reason'
    );

    // Verify statusHistory audit log
    const updatedJobAfterReopen = await JobSchedule.findById(testJob._id);
    const history = updatedJobAfterReopen.statusHistory || [];
    assert(history.length >= 4, `Audit trail recorded all ${history.length} state transitions`);
    const lastEntry = history[history.length - 1];
    assert(
      lastEntry.fromStatus === 'COMPLETED' &&
      lastEntry.toStatus === 'EXECUTION' &&
      lastEntry.userRole === 'Admin' &&
      lastEntry.reason.includes('additional unboxing'),
      'Audit log entry captures fromStatus, toStatus, userRole, timestamp, and reopen reason'
    );

    // =========================================================================
    // SECTION 3: WORKER FIELD EXECUTION JOURNEY & ACCESS CONTROL
    // =========================================================================
    console.log('\n--- Section 3: Worker Field Execution Journey & Access Control ---');

    // Link an Appointment on testJob with assignedEmployability (assignedWorkerUserId)
    const testAppointment = await Appointment.create({
      jobId: testJob._id,
      title: 'Relocation Execution Crew',
      date: '2026-11-15',
      time: '08:00',
      appointmentType: 'Move',
      assignedEmployees: [assignedEmployability._id],
      status: 'Scheduled',
    });
    cleanup.appointmentIds.push(testAppointment._id);

    // 3.1 Unassigned Worker (Bob) tries to read job details (HTTP 403 ACCESS_DENIED)
    try {
      await axios.get(
        `${BASE_URL}/api/jobs/${testJob._id}`,
        { headers: { Authorization: `Bearer ${unassignedStaffToken}` } }
      );
      assert(false, 'Unassigned staff reading job details should have failed HTTP 403');
    } catch (err) {
      assert(
        err.response?.status === 403 && err.response?.data?.code === 'ACCESS_DENIED',
        'Unassigned staff blocked from GET /api/jobs/:id with HTTP 403 ACCESS_DENIED'
      );
    }

    // 3.2 Unassigned Worker (Bob) tries to read execution details (HTTP 403 ACCESS_DENIED)
    try {
      await axios.get(
        `${BASE_URL}/api/jobs/${testJob._id}/execution`,
        { headers: { Authorization: `Bearer ${unassignedStaffToken}` } }
      );
      assert(false, 'Unassigned staff reading execution details should have failed HTTP 403');
    } catch (err) {
      assert(
        err.response?.status === 403 && err.response?.data?.code === 'ACCESS_DENIED',
        'Unassigned staff blocked from GET /api/jobs/:id/execution with HTTP 403 ACCESS_DENIED'
      );
    }

    // 3.3 Unassigned Worker (Bob) tries to update execution details (HTTP 403 ACCESS_DENIED)
    try {
      await axios.put(
        `${BASE_URL}/api/jobs/${testJob._id}/execution`,
        { startKilometres: 120000 },
        { headers: { Authorization: `Bearer ${unassignedStaffToken}` } }
      );
      assert(false, 'Unassigned staff updating execution details should have failed HTTP 403');
    } catch (err) {
      assert(
        err.response?.status === 403 && err.response?.data?.code === 'ACCESS_DENIED',
        'Unassigned staff blocked from PUT /api/jobs/:id/execution with HTTP 403 ACCESS_DENIED'
      );
    }

    // 3.4 Assigned Worker (Mike) reads job details (HTTP 200)
    const resAssignedRead = await axios.get(
      `${BASE_URL}/api/jobs/${testJob._id}`,
      { headers: { Authorization: `Bearer ${assignedStaffToken}` } }
    );
    assert(
      resAssignedRead.status === 200 && resAssignedRead.data?._id.toString() === testJob._id.toString(),
      'Assigned staff member successfully retrieves job details (HTTP 200)'
    );

    // 3.5 Assigned Worker logs operational field journey (KMs, hours, materials, damages)
    const executionPayload = {
      startedAt: new Date('2026-11-15T08:00:00Z'),
      completedAt: new Date('2026-11-15T14:30:00Z'),
      startKilometres: 145000,
      endKilometres: 145085, // Total 85 km
      actualMovers: 3,
      billableHours: 6.5,
      payrollHours: 7.0,
      colliCount: 52,
      colliNotes: '35 moving boxes, 12 wardrobe boxes, 5 heavy furniture units',
      operationalNotes: 'Access through courtyard elevator completed smoothly',
      materialsUsed: [
        { materialName: 'Standard Moving Box', quantity: 10, unitPrice: 2.50 },
        { materialName: 'Packing Tape Roll', quantity: 3, unitPrice: 3.50 },
      ],
      damageReports: [
        { description: 'Slight pre-existing scratch on side of wardrobe', location: 'Master Bedroom', reportedAt: new Date() },
      ],
    };

    const resSaveExec = await axios.put(
      `${BASE_URL}/api/jobs/${testJob._id}/execution`,
      executionPayload,
      { headers: { Authorization: `Bearer ${assignedStaffToken}` } }
    );
    assert(
      resSaveExec.status === 200 && resSaveExec.data?.success === true,
      'Assigned worker saves field execution details (HTTP 200)'
    );

    const savedExec = resSaveExec.data?.executionDetails;
    assert(
      savedExec.totalKilometres === 85,
      `Calculated totalKilometres correctly: ${savedExec.totalKilometres} km (145085 - 145000)`
    );
    assert(
      savedExec.billableHours === 6.5 && savedExec.payrollHours === 7.0,
      'Saved billable and payroll operational hours'
    );
    assert(
      savedExec.materialsUsed.length === 2 && savedExec.materialsUsed[0].totalPrice === 25.0,
      'Saved materials used with auto-calculated line item totals'
    );
    assert(
      savedExec.damageReports.length === 1 && savedExec.damageReports[0].description.includes('pre-existing scratch'),
      'Saved damage / incident log entry'
    );

    // 3.6 Customer Digital Sign-Off and Automatic Job Completion
    const mockSignatureDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const signOffPayload = {
      customerSignature: {
        signerName: 'Alexander Van Dijk',
        signerRole: 'Customer',
        signatureData: mockSignatureDataUrl,
        signedAt: new Date(),
      },
      autoComplete: true,
    };

    const resSignOff = await axios.put(
      `${BASE_URL}/api/jobs/${testJob._id}/execution`,
      signOffPayload,
      { headers: { Authorization: `Bearer ${assignedStaffToken}` } }
    );
    assert(
      resSignOff.status === 200 && resSignOff.data?.status === 'COMPLETED',
      'Submitting customer digital signature auto-transitions job to COMPLETED'
    );
    assert(
      resSignOff.data?.executionDetails?.customerSignature?.signerName === 'Alexander Van Dijk',
      'Saved customer digital signature record with signer details'
    );

    // Verify completion recorded in statusHistory
    const finalizedJob = await JobSchedule.findById(testJob._id);
    const finalHist = finalizedJob.statusHistory;
    const completionEntry = finalHist[finalHist.length - 1];
    assert(
      completionEntry.toStatus === 'COMPLETED' &&
      completionEntry.reason.includes('foreman execution journey'),
      'Final statusHistory entry records sign-off completion'
    );

    // =========================================================================
    // SECTION 4: SYSTEM INVARIANT CHECK (#2026/0025 €746.39 & PDF)
    // =========================================================================
    console.log('\n--- Section 4: Invariant Check (Baseline Invoice #2026/0025) ---');

    const baselineInv = await Invoice.findOne({
      $or: [{ invoiceNumber: '2026/0025' }, { index: '2026/0025' }, { invoiceNumber: '#2026/0025' }, { index: '#2026/0025' }],
    });
    if (!baselineInv) {
      assert(false, 'Baseline invoice #2026/0025 must exist in database');
    } else {
      const totalAmount = Number(baselineInv.total || baselineInv.amount || 0);
      assert(
        Math.abs(totalAmount - 746.39) < 0.01,
        `Baseline invoice #2026/0025 preserved exactly at €746.39 (actual: €${totalAmount.toFixed(2)})`
      );

      // Verify PDF generation returns 200
      try {
        const pdfRes = await axios.post(
          `${BASE_URL}/invoice/download`,
          { Id: baselineInv._id },
          { headers: { Authorization: `Bearer ${adminToken}` }, responseType: 'arraybuffer', timeout: 10000 }
        );
        assert(
          pdfRes.status === 200 && pdfRes.data.length > 50000,
          `Statutory PDF for #2026/0025 generates successfully (HTTP 200, size: ${pdfRes.data.length} bytes)`
        );
      } catch (pdfErr) {
        assert(false, `Baseline invoice PDF generation failed: ${pdfErr.message}`);
      }
    }

  } catch (error) {
    console.error('[FATAL EXCEPTION]', error);
    assert(false, `Unexpected error during test execution: ${error.message}`);
  } finally {
    // Cleanup created test records
    console.log('\n[Cleanup] Cleaning up test fixtures...');
    try {
      if (cleanup.jobIds.length > 0) await JobSchedule.deleteMany({ _id: { $in: cleanup.jobIds } });
      if (cleanup.appointmentIds.length > 0) await Appointment.deleteMany({ _id: { $in: cleanup.appointmentIds } });
      if (cleanup.employabilityIds.length > 0) await Employability.deleteMany({ _id: { $in: cleanup.employabilityIds } });
      console.log('[Cleanup] Cleanup complete.');
    } catch (e) {
      console.error('[Cleanup Error]', e.message);
    }

    console.log('\n===============================================================');
    console.log(`EXEC-32 TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
    console.log('===============================================================');

    await mongoose.disconnect();
    process.exit(failCount > 0 ? 1 : 0);
  }
}

runTests();
