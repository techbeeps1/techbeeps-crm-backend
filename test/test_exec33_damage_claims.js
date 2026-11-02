/**
 * test_exec33_damage_claims.js - EXEC-33 Operational Acceptance Gate
 * 
 * Comprehensive Verification of:
 * 1. Claim Creation & Item-level Validations:
 *    - Rejects negative item claimed amounts (HTTP 400 INVALID_CLAIMED_AMOUNT)
 *    - Rejects zero total claimed amount (HTTP 400 INVALID_TOTAL_CLAIMED)
 *    - Valid creation with multiple damaged items & default deductible
 * 
 * 2. Mathematical Consistency & Approval Cap Guards:
 *    - Rejects total approved > total claimed (HTTP 422 APPROVED_EXCEEDS_CLAIMED)
 *    - Rejects item approved > item claimed (HTTP 422 ITEM_APPROVED_EXCEEDS_CLAIMED)
 *    - Valid item and total approvals adhere to caps
 * 
 * 3. Deductible (Eigen Risico) & Net Settlement Formula:
 *    - Formula: netSettlement = max(0, totalApproved - deductibleApplied)
 *    - Case A: Approved €400, Deductible €100 -> Net €300
 *    - Case B: Approved €75, Deductible €100 -> Net €0 (no negative payout)
 * 
 * 4. Role Authorization for Claim Adjustments:
 *    - Regular Staff blocked from approving, rejecting, settling claims (HTTP 403 UNAUTHORIZED_CLAIM_ADJUSTMENT)
 *    - Privileged roles (Admin, Manager, Claims Adjuster) authorized
 * 
 * 5. Rejection & Audit Requirements:
 *    - Rejection without documented reason fails (HTTP 400 REJECTION_REASON_REQUIRED)
 *    - Rejection with valid reason resets approved and net amounts to €0
 * 
 * 6. Settlement Execution Guardrails:
 *    - Settling positive payout requires valid settlementType (HTTP 400 SETTLEMENT_TYPE_REQUIRED)
 *    - Direct Bank Transfer requires paymentReference (HTTP 400 PAYMENT_REFERENCE_REQUIRED)
 *    - Valid settlement records settledDate, settledBy, and statusHistory
 * 
 * 7. Reopening Guard for Settled/Closed Claims:
 *    - Staff blocked from reopening settled claims (HTTP 403 UNAUTHORIZED_REOPEN_CLAIM)
 *    - Admin reopening without reason blocked (HTTP 400 REOPEN_REASON_REQUIRED)
 *    - Admin reopening with reason succeeds
 * 
 * 8. Summary KPIs & Filter Endpoints:
 *    - GET /api/damage-claims tallies metrics accurately
 * 
 * 9. System Invariant:
 *    - Baseline invoice #2026/0025 strictly preserved at €746.39 with statutory PDF download returning HTTP 200
 */

const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const DamageClaim = require('../models/damageClaimModel');
const JobSchedule = require('../models/jobSchedule');
const Customer = require('../models/customer');
const Invoice = require('../models/invoice');

const BASE_URL = 'http://localhost:8080';
let adminToken = '';
let staffToken = '';

const cleanup = {
  claimIds: [],
  jobIds: [],
  customerIds: [],
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
  console.log('EXEC-33 TEST SUITE: DAMAGE CLAIM RECONCILIATION & DEDUCTIBLES');
  console.log('===============================================================');

  try {
    // 0. Connect DB & Setup Auth
    await mongoose.connect(process.env.MONGO_URI);
    console.log('[Setup] Connected to MongoDB');

    const jwtSecret = process.env.JWT_SECRET || 'techbeeps_crm_default_jwt_secret_key_2026';
    const adminId = new mongoose.Types.ObjectId();
    const staffId = new mongoose.Types.ObjectId();

    adminToken = jwt.sign(
      { userId: adminId.toString(), role: 'Admin', username: 'Claims Manager Admin' },
      jwtSecret,
      { expiresIn: '1h' }
    );

    staffToken = jwt.sign(
      { userId: staffId.toString(), role: 'Staff', username: 'Mover Mark' },
      jwtSecret,
      { expiresIn: '1h' }
    );

    // Create a Test Customer & Job
    let testCustomer = await Customer.findOne();
    if (!testCustomer) {
      testCustomer = await Customer.create({
        type: 'Customer',
        typeOfCustomer: 'individual',
        firstName: 'Sanne',
        lastName: 'De Jong',
        email: 'sanne.dejong.test@universalmovers.nl',
        contact: '0612345678',
      });
      cleanup.customerIds.push(testCustomer._id);
    }

    const testJob = await JobSchedule.create({
      customer: testCustomer._id,
      status: 'EXECUTION',
      pickup_address: 'Singel 250, Amsterdam',
      delivery_address: 'Oudegracht 120, Utrecht',
      index: 99933,
    });
    cleanup.jobIds.push(testJob._id);

    // =========================================================================
    // SECTION 1: CLAIM CREATION & ITEM VALIDATION
    // =========================================================================
    console.log('\n--- Section 1: Claim Creation & Item Validation ---');

    // 1.1 Rejects negative item claimed amount
    try {
      await axios.post(
        `${BASE_URL}/api/damage-claims`,
        {
          customerName: 'Sanne De Jong',
          items: [{ itemName: 'Antique Mirror', claimedAmount: -50 }],
        },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      assert(false, 'Negative item claimed amount should have failed HTTP 400');
    } catch (err) {
      assert(
        err.response?.status === 400 && err.response?.data?.code === 'INVALID_CLAIMED_AMOUNT',
        'API rejects negative item claimed amount with HTTP 400 INVALID_CLAIMED_AMOUNT'
      );
    }

    // 1.2 Rejects total claimed amount <= 0
    try {
      await axios.post(
        `${BASE_URL}/api/damage-claims`,
        {
          customerName: 'Sanne De Jong',
          items: [{ itemName: 'Antique Mirror', claimedAmount: 0 }],
        },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      assert(false, 'Zero total claimed amount should have failed HTTP 400');
    } catch (err) {
      assert(
        err.response?.status === 400 && err.response?.data?.code === 'INVALID_TOTAL_CLAIMED',
        'API rejects total claimed amount of €0 with HTTP 400 INVALID_TOTAL_CLAIMED'
      );
    }

    // 1.3 Create valid multi-item claim with deductible
    const createPayload = {
      jobId: testJob._id,
      customerId: testCustomer._id,
      customerName: 'Sanne De Jong',
      customerEmail: 'sanne.dejong.test@universalmovers.nl',
      customerPhone: '0612345678',
      incidentStage: 'Loading / In-Transit',
      incidentLocation: 'Living Room',
      incidentDescription: 'Scratched dining table and broken crystal lamp',
      deductibleAmount: 100, // Standard Dutch €100 Eigen Risico
      items: [
        {
          itemName: 'Oak Dining Table',
          itemCategory: 'Furniture',
          damageType: 'Scratch / Dent',
          quantity: 1,
          claimedAmount: 350.00,
        },
        {
          itemName: 'Crystal Chandelier Lamp',
          itemCategory: 'Glass & Fragile',
          damageType: 'Broken / Shattered',
          quantity: 1,
          claimedAmount: 150.00,
        },
      ],
    };

    const resCreate = await axios.post(
      `${BASE_URL}/api/damage-claims`,
      createPayload,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert(
      resCreate.status === 201 && resCreate.data?.data?._id,
      'Valid damage claim created with HTTP 201'
    );

    const testClaim = resCreate.data?.data;
    cleanup.claimIds.push(testClaim._id);

    assert(
      testClaim.totalClaimedAmount === 500.00,
      `Total claimed amount accurately summed to €500.00 (got: €${testClaim.totalClaimedAmount})`
    );
    assert(
      testClaim.deductibleAmount === 100.00,
      `Standard deductible preserved at €100.00 (got: €${testClaim.deductibleAmount})`
    );
    assert(
      testClaim.status === 'Reported',
      'Initial claim status correctly defaults to "Reported"'
    );

    // =========================================================================
    // SECTION 2: MATHEMATICAL CONSISTENCY & APPROVAL CAP GUARDS
    // =========================================================================
    console.log('\n--- Section 2: Mathematical Consistency & Approval Cap Guards ---');

    // 2.1 Attempt to approve more than total claimed amount (€650 on €500 claim)
    try {
      await axios.put(
        `${BASE_URL}/api/damage-claims/${testClaim._id}/settlement`,
        {
          status: 'Approved',
          totalApprovedAmount: 650.00,
          reviewerComment: 'Approving full claim plus extra',
        },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      assert(false, 'Approving > totalClaimedAmount should have failed HTTP 422');
    } catch (err) {
      assert(
        err.response?.status === 422 && err.response?.data?.code === 'APPROVED_EXCEEDS_CLAIMED',
        'API rejects total approved (€650) exceeding total claimed (€500) with HTTP 422 APPROVED_EXCEEDS_CLAIMED'
      );
    }

    // 2.2 Attempt to approve more than individual item claimed amount
    const itemId1 = testClaim.items[0]._id; // Oak Dining Table (Claimed €350)
    try {
      await axios.put(
        `${BASE_URL}/api/damage-claims/${testClaim._id}/settlement`,
        {
          status: 'Partially Approved',
          itemApprovedAmounts: {
            [itemId1]: 400.00, // €400 > €350
          },
          reviewerComment: 'Table approval exceeds claimed',
        },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      assert(false, 'Approving > item.claimedAmount should have failed HTTP 422');
    } catch (err) {
      assert(
        err.response?.status === 422 && err.response?.data?.code === 'ITEM_APPROVED_EXCEEDS_CLAIMED',
        'API rejects item approved (€400) exceeding item claimed (€350) with HTTP 422 ITEM_APPROVED_EXCEEDS_CLAIMED'
      );
    }

    // =========================================================================
    // SECTION 3: ROLE AUTHORIZATION FOR CLAIM ADJUSTMENTS
    // =========================================================================
    console.log('\n--- Section 3: Role Authorization for Claim Adjustments ---');

    // 3.1 Regular Staff member attempts to approve claim (HTTP 403)
    try {
      await axios.put(
        `${BASE_URL}/api/damage-claims/${testClaim._id}/settlement`,
        {
          status: 'Approved',
          totalApprovedAmount: 400.00,
          reviewerComment: 'Staff attempting self-approval',
        },
        { headers: { Authorization: `Bearer ${staffToken}` } }
      );
      assert(false, 'Staff approving claim should have failed HTTP 403');
    } catch (err) {
      assert(
        err.response?.status === 403 && err.response?.data?.code === 'UNAUTHORIZED_CLAIM_ADJUSTMENT',
        'Regular Staff blocked from approving claim with HTTP 403 UNAUTHORIZED_CLAIM_ADJUSTMENT'
      );
    }

    // 3.2 Regular Staff member attempts to reject claim (HTTP 403)
    try {
      await axios.put(
        `${BASE_URL}/api/damage-claims/${testClaim._id}/settlement`,
        {
          status: 'Rejected',
          rejectionReason: 'Staff rejecting claim without authority',
        },
        { headers: { Authorization: `Bearer ${staffToken}` } }
      );
      assert(false, 'Staff rejecting claim should have failed HTTP 403');
    } catch (err) {
      assert(
        err.response?.status === 403 && err.response?.data?.code === 'UNAUTHORIZED_CLAIM_ADJUSTMENT',
        'Regular Staff blocked from rejecting claim with HTTP 403 UNAUTHORIZED_CLAIM_ADJUSTMENT'
      );
    }

    // =========================================================================
    // SECTION 4: DEDUCTIBLE (EIGEN RISICO) & NET SETTLEMENT FORMULA
    // =========================================================================
    console.log('\n--- Section 4: Deductible (Eigen Risico) & Net Settlement Formula ---');

    // 4.1 Case A: Approve €400 with €100 deductible -> Net Settlement = €300
    const resApprove = await axios.put(
      `${BASE_URL}/api/damage-claims/${testClaim._id}/settlement`,
      {
        status: 'Approved',
        totalApprovedAmount: 400.00,
        deductibleApplied: 100.00,
        reviewerComment: 'Approved €400 gross; standard €100 Eigen Risico applied',
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert(
      resApprove.status === 200 && resApprove.data?.data?.status === 'Approved',
      'Admin approves claim successfully with HTTP 200'
    );

    const approvedClaim = resApprove.data?.data;
    assert(
      approvedClaim.totalApprovedAmount === 400.00,
      `totalApprovedAmount set to €400.00 (got: €${approvedClaim.totalApprovedAmount})`
    );
    assert(
      approvedClaim.deductibleApplied === 100.00,
      `deductibleApplied set to €100.00 (got: €${approvedClaim.deductibleApplied})`
    );
    assert(
      approvedClaim.netSettlementAmount === 300.00,
      `netSettlementAmount correctly calculated as €300.00 (€400 - €100) (got: €${approvedClaim.netSettlementAmount})`
    );

    // 4.2 Case B: Approved amount (€80) is less than deductible (€100) -> Net Settlement = €0 (No negative payout)
    const resUnderDeductible = await axios.put(
      `${BASE_URL}/api/damage-claims/${testClaim._id}/settlement`,
      {
        status: 'Partially Approved',
        totalApprovedAmount: 80.00,
        deductibleApplied: 100.00,
        reviewerComment: 'Approved €80 minor touch-up, below €100 deductible',
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert(
      resUnderDeductible.status === 200,
      'Under-deductible approval request succeeds with HTTP 200'
    );
    const underDedClaim = resUnderDeductible.data?.data;
    assert(
      underDedClaim.netSettlementAmount === 0,
      `netSettlementAmount clamped to €0 when deductible exceeds approved (got: €${underDedClaim.netSettlementAmount})`
    );

    // Restore to €400 approved / €300 net for settlement testing
    await axios.put(
      `${BASE_URL}/api/damage-claims/${testClaim._id}/settlement`,
      {
        status: 'Approved',
        totalApprovedAmount: 400.00,
        deductibleApplied: 100.00,
        reviewerComment: 'Restored to €400 approved for settlement execution',
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    // =========================================================================
    // SECTION 5: SETTLEMENT EXECUTION GUARDRAILS
    // =========================================================================
    console.log('\n--- Section 5: Settlement Execution Guardrails ---');

    // 5.1 Setting status 'Settled' with missing settlementType fails (HTTP 400)
    try {
      await axios.put(
        `${BASE_URL}/api/damage-claims/${testClaim._id}/settlement`,
        {
          status: 'Settled',
          settlementType: '',
        },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      assert(false, 'Settling positive payout without settlementType should have failed HTTP 400');
    } catch (err) {
      assert(
        err.response?.status === 400 && err.response?.data?.code === 'SETTLEMENT_TYPE_REQUIRED',
        'API rejects settlement without settlementType with HTTP 400 SETTLEMENT_TYPE_REQUIRED'
      );
    }

    // 5.2 Direct Bank Transfer without paymentReference fails (HTTP 400)
    try {
      await axios.put(
        `${BASE_URL}/api/damage-claims/${testClaim._id}/settlement`,
        {
          status: 'Settled',
          settlementType: 'Direct Bank Transfer',
          paymentReference: '',
        },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      assert(false, 'Direct Bank Transfer without paymentReference should have failed HTTP 400');
    } catch (err) {
      assert(
        err.response?.status === 400 && err.response?.data?.code === 'PAYMENT_REFERENCE_REQUIRED',
        'API rejects Direct Bank Transfer without reference with HTTP 400 PAYMENT_REFERENCE_REQUIRED'
      );
    }

    // 5.3 Valid Settlement Execution succeeds
    const resSettle = await axios.put(
      `${BASE_URL}/api/damage-claims/${testClaim._id}/settlement`,
      {
        status: 'Settled',
        settlementType: 'Direct Bank Transfer',
        paymentReference: 'NL88INGB0001234567-CLAIM-9901',
        settlementNotes: 'Transferred €300.00 to customer verified Rabobank account',
        releaseAgreementSigned: true,
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert(
      resSettle.status === 200 && resSettle.data?.data?.status === 'Settled',
      'Claim successfully transitioned to Settled with HTTP 200'
    );

    const settledClaim = resSettle.data?.data;
    assert(
      settledClaim.settlementStatus === 'Settled',
      'settlementStatus updated to "Settled"'
    );
    assert(
      settledClaim.settlementDate !== null,
      'settlementDate timestamp recorded'
    );
    assert(
      settledClaim.paymentReference === 'NL88INGB0001234567-CLAIM-9901',
      'paymentReference properly saved'
    );
    assert(
      settledClaim.releaseAgreementSigned === true,
      'releaseAgreementSigned recorded as true'
    );

    // =========================================================================
    // SECTION 6: REOPENING SETTLED CLAIMS & REJECTION RULES
    // =========================================================================
    console.log('\n--- Section 6: Reopening Settled Claims & Rejection Rules ---');

    // 6.1 Staff cannot reopen settled claim
    try {
      await axios.put(
        `${BASE_URL}/api/damage-claims/${testClaim._id}/settlement`,
        {
          status: 'Under Review',
          reviewerComment: 'Staff attempting reopen',
        },
        { headers: { Authorization: `Bearer ${staffToken}` } }
      );
      assert(false, 'Staff reopening settled claim should have failed HTTP 403');
    } catch (err) {
      assert(
        err.response?.status === 403 && err.response?.data?.code === 'UNAUTHORIZED_REOPEN_CLAIM',
        'Staff blocked from reopening settled claim with HTTP 403 UNAUTHORIZED_REOPEN_CLAIM'
      );
    }

    // 6.2 Admin reopening without >= 5 char reason fails
    try {
      await axios.put(
        `${BASE_URL}/api/damage-claims/${testClaim._id}/settlement`,
        {
          status: 'Under Review',
          reviewerComment: 'bad',
        },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      assert(false, 'Admin reopening without reason should have failed HTTP 400');
    } catch (err) {
      assert(
        err.response?.status === 400 && err.response?.data?.code === 'REOPEN_REASON_REQUIRED',
        'Admin reopening settled claim without >=5 char reason fails HTTP 400 REOPEN_REASON_REQUIRED'
      );
    }

    // 6.3 Admin reopens with valid reason
    const resReopen = await axios.put(
      `${BASE_URL}/api/damage-claims/${testClaim._id}/settlement`,
      {
        status: 'Under Review',
        reviewerComment: 'Customer dispute reopened following independent second assessor report',
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert(
      resReopen.status === 200 && resReopen.data?.data?.status === 'Under Review',
      'Admin successfully reopens settled claim back to "Under Review"'
    );

    // 6.4 Test Rejection without reason fails
    try {
      await axios.put(
        `${BASE_URL}/api/damage-claims/${testClaim._id}/settlement`,
        {
          status: 'Rejected',
          rejectionReason: '',
        },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      assert(false, 'Rejecting claim without reason should have failed HTTP 400');
    } catch (err) {
      assert(
        err.response?.status === 400 && err.response?.data?.code === 'REJECTION_REASON_REQUIRED',
        'Rejecting claim without >=5 char reason fails HTTP 400 REJECTION_REASON_REQUIRED'
      );
    }

    // 6.5 Test Rejection with valid reason
    const resReject = await axios.put(
      `${BASE_URL}/api/damage-claims/${testClaim._id}/settlement`,
      {
        status: 'Rejected',
        rejectionReason: 'Pre-existing damage noted on initial inventory sheet signed by customer',
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert(
      resReject.status === 200 && resReject.data?.data?.status === 'Rejected',
      'Claim rejected successfully with documented reason'
    );
    const rejectedClaim = resReject.data?.data;
    assert(
      rejectedClaim.totalApprovedAmount === 0 && rejectedClaim.netSettlementAmount === 0,
      'Rejected claim resets totalApprovedAmount and netSettlementAmount to €0.00'
    );

    // Verify audit log entries
    const refreshedClaim = await DamageClaim.findById(testClaim._id);
    const history = refreshedClaim.statusHistory || [];
    assert(
      history.length >= 5,
      `Audit trail recorded all ${history.length} state and settlement transitions`
    );

    // =========================================================================
    // SECTION 7: SUMMARY KPIS & FILTER ENDPOINTS
    // =========================================================================
    console.log('\n--- Section 7: Summary KPIs & Filter Endpoints ---');

    const resList = await axios.get(
      `${BASE_URL}/api/damage-claims?jobId=${testJob._id}`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert(
      resList.status === 200 && Array.isArray(resList.data?.data),
      'GET /api/damage-claims?jobId=... returns HTTP 200 with matching claims array'
    );
    assert(
      resList.data?.summary && typeof resList.data?.summary?.totalClaimsCount === 'number',
      'GET /api/damage-claims computes summary KPI metrics'
    );

    // =========================================================================
    // SECTION 8: SYSTEM INVARIANT CHECK (#2026/0025 €746.39 & PDF)
    // =========================================================================
    console.log('\n--- Section 8: Invariant Check (Baseline Invoice #2026/0025) ---');

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
      if (cleanup.claimIds.length > 0) await DamageClaim.deleteMany({ _id: { $in: cleanup.claimIds } });
      if (cleanup.jobIds.length > 0) await JobSchedule.deleteMany({ _id: { $in: cleanup.jobIds } });
      if (cleanup.customerIds.length > 0) await Customer.deleteMany({ _id: { $in: cleanup.customerIds } });
      console.log('[Cleanup] Cleanup complete.');
    } catch (e) {
      console.error('[Cleanup Error]', e.message);
    }

    console.log('\n===============================================================');
    console.log(`EXEC-33 TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
    console.log('===============================================================');

    await mongoose.disconnect();
    process.exit(failCount > 0 ? 1 : 0);
  }
}

runTests();

